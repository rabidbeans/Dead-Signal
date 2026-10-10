// Online co-op: Firestore is the lobby and the handshake; the game itself
// runs over WebRTC data channels, player to player, host-authoritative.
//
//   rooms/{CODE}                      { host, created, status, level }
//   rooms/{CODE}/peers/{peerId}       { name, t }            (a friend knocks)
//   rooms/{CODE}/peers/{peerId}/signals/{auto}  { from, kind, data, t }
//
// Offers and answers are sent complete (non-trickle ICE) so each side
// writes exactly one signal. Two channels per friend: 'u' unordered and
// unreliable for snapshots/inputs, 'r' reliable for events.
import { db } from './firebase.js';

const ICE = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
];
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';     // no I or O: they read as 1 and 0

function code4() {
  let s = '';
  for (let i = 0; i < 4; i++) s += LETTERS[(Math.random() * LETTERS.length) | 0];
  return s;
}
function rid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }

function waitIce(pc, ms = 2500) {
  return new Promise((res) => {
    if (pc.iceGatheringState === 'complete') return res();
    const t = setTimeout(res, ms);
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); }
    });
  });
}

class Link {
  constructor(id, pc) {
    this.id = id; this.pc = pc; this.u = null; this.r = null; this.open = false;
  }
  send(msg, reliable = true) {
    const ch = reliable ? this.r : (this.u?.readyState === 'open' ? this.u : this.r);
    if (ch?.readyState === 'open') {
      // backpressure: drop unreliable traffic when the buffer is full
      if (!reliable && ch.bufferedAmount > 64 * 1024) return;
      ch.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
  }
  close() { try { this.pc.close(); } catch (e) { /* closed */ } }
}

export class Net {
  constructor() {
    this.role = 'solo';
    this.code = null;
    this.id = rid();
    this.links = new Map();
    this.unsubs = [];
    this.onMessage = null;    // (fromId, msg)
    this.onPeer = null;       // (id, 'open'|'close')
    this.onStatus = null;     // text
  }

  status(s) { this.onStatus?.(s); }

  async fs() {
    if (!this._fs) this._fs = await import('firebase/firestore');
    return this._fs;
  }

  // ------------------------------------------------------------- host --
  async host() {
    const F = await this.fs();
    const d = await db();
    this.role = 'host';
    for (let tries = 0; tries < 6; tries++) {
      const c = code4();
      const ref = F.doc(d, 'rooms', c);
      const snap = await F.getDoc(ref);
      if (snap.exists() && Date.now() - (snap.data().created || 0) < 6 * 3600e3) continue;
      await F.setDoc(ref, { host: this.id, created: Date.now(), status: 'lobby', level: 1 });
      this.code = c;
      break;
    }
    if (!this.code) throw new Error('Could not reserve a room code');
    // a friend knocks: offer them a connection
    const peersCol = F.collection(d, 'rooms', this.code, 'peers');
    this.unsubs.push(F.onSnapshot(peersCol, (qs) => {
      qs.docChanges().forEach((ch) => {
        if (ch.type === 'added' && !this.links.has(ch.doc.id)) this.offerTo(ch.doc.id, ch.doc.data());
      });
    }));
    return this.code;
  }

  async offerTo(peerId) {
    const F = await this.fs();
    const d = await db();
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const link = new Link(peerId, pc);
    this.links.set(peerId, link);
    link.r = pc.createDataChannel('r', { ordered: true });
    link.u = pc.createDataChannel('u', { ordered: false, maxRetransmits: 0 });
    this.wire(link);
    await pc.setLocalDescription(await pc.createOffer());
    await waitIce(pc);
    const sigs = F.collection(d, 'rooms', this.code, 'peers', peerId, 'signals');
    await F.addDoc(sigs, { from: 'host', kind: 'offer', data: JSON.stringify(pc.localDescription), t: Date.now() });
    const un = F.onSnapshot(sigs, (qs) => {
      qs.docChanges().forEach(async (ch) => {
        const s = ch.doc.data();
        if (ch.type === 'added' && s.kind === 'answer' && !pc.remoteDescription) {
          try { await pc.setRemoteDescription(JSON.parse(s.data)); } catch (e) { console.warn(e); }
        }
      });
    });
    this.unsubs.push(un);
  }

  async setStatus(status) {
    if (this.role !== 'host' || !this.code) return;
    const F = await this.fs();
    const d = await db();
    try { await F.updateDoc(F.doc(d, 'rooms', this.code), { status }); } catch (e) { /* offline */ }
  }

  // ------------------------------------------------------------- join --
  async join(code, name) {
    const F = await this.fs();
    const d = await db();
    code = code.toUpperCase().trim();
    const room = await F.getDoc(F.doc(d, 'rooms', code));
    if (!room.exists()) throw new Error('No game with that code');
    if (room.data().status === 'closed') throw new Error('That game has ended');
    this.role = 'client';
    this.code = code;
    const hostId = room.data().host;
    this.hostId = hostId;
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const link = new Link(hostId, pc);
    this.links.set(hostId, link);
    pc.ondatachannel = (e) => {
      if (e.channel.label === 'r') link.r = e.channel;
      else link.u = e.channel;
      this.wireChannel(link, e.channel);
    };
    pc.onconnectionstatechange = () => this.connState(link);
    const sigs = F.collection(d, 'rooms', code, 'peers', this.id, 'signals');
    const answered = new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('The host did not answer')), 20000);
      const un = F.onSnapshot(sigs, (qs) => {
        qs.docChanges().forEach(async (ch) => {
          const s = ch.doc.data();
          if (ch.type !== 'added' || s.kind !== 'offer' || pc.remoteDescription) return;
          try {
            await pc.setRemoteDescription(JSON.parse(s.data));
            await pc.setLocalDescription(await pc.createAnswer());
            await waitIce(pc);
            await F.addDoc(sigs, { from: this.id, kind: 'answer', data: JSON.stringify(pc.localDescription), t: Date.now() });
            clearTimeout(to);
            resolve();
          } catch (e) { reject(e); }
        });
      });
      this.unsubs.push(un);
    });
    await F.setDoc(F.doc(d, 'rooms', code, 'peers', this.id), { name: (name || 'Survivor').slice(0, 16), t: Date.now() });
    this.status('Knocking…');
    await answered;
    this.status('Connecting…');
    await new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('Could not connect to the host (network blocked?)')), 20000);
      const check = () => { if (link.open) { clearTimeout(to); resolve(); } else setTimeout(check, 100); };
      check();
    });
    return hostId;
  }

  // ------------------------------------------------------------ wiring --
  wire(link) {
    link.pc.onconnectionstatechange = () => this.connState(link);
    this.wireChannel(link, link.r);
    this.wireChannel(link, link.u);
  }

  wireChannel(link, ch) {
    ch.onopen = () => {
      if (link.r?.readyState === 'open' && !link.open) {
        link.open = true;
        this.onPeer?.(link.id, 'open');
      }
    };
    ch.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch (_) { return; }
      this.onMessage?.(link.id, m);
    };
    ch.onclose = () => this.drop(link);
  }

  connState(link) {
    const s = link.pc.connectionState;
    if (s === 'failed' || s === 'closed' || s === 'disconnected') {
      // 'disconnected' can recover; give it a moment
      if (s === 'disconnected') { setTimeout(() => { if (link.pc.connectionState !== 'connected') this.drop(link); }, 4000); return; }
      this.drop(link);
    }
  }

  drop(link) {
    if (!this.links.has(link.id)) return;
    this.links.delete(link.id);
    link.close();
    if (link.open) this.onPeer?.(link.id, 'close');
  }

  // ------------------------------------------------------------- send --
  send(to, msg, reliable = true) { this.links.get(to)?.send(msg, reliable); }
  broadcast(msg, reliable = true, except = null) {
    const s = JSON.stringify(msg);
    for (const l of this.links.values()) if (l.id !== except) l.send(s, reliable);
  }
  toHost(msg, reliable = true) { if (this.hostId) this.send(this.hostId, msg, reliable); }

  async close() {
    this.unsubs.forEach((u) => { try { u(); } catch (e) { /* gone */ } });
    this.unsubs = [];
    for (const l of this.links.values()) l.close();
    this.links.clear();
    if (this.role === 'host' && this.code) await this.setStatus('closed');
    this.role = 'solo';
    this.code = null;
  }
}
