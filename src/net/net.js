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
    this.timers = [];
    this.offered = new Set();
    this.noListen = new URLSearchParams(location.search).has('nolisten');     // QA: pretend the streaming listener is dead
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
    // Two ways to hear it, because either can fail on a phone: Firestore's live listener, and a plain read every 2 s.
    const peersCol = F.collection(d, 'rooms', this.code, 'peers');
    const knock = (id, data) => {
      if (this.offered.has(id)) return;
      this.offered.add(id);
      this.status(`${(data?.name?.stringValue ?? data?.name ?? 'A friend')} is knocking…`);
      this.offerTo(id).catch((e) => { console.warn('offer', e); this.offered.delete(id); this.status('Could not answer a friend: ' + (e.message || e)); });
    };
    if (!this.noListen) {
      this.unsubs.push(F.onSnapshot(peersCol, (qs) => {
        qs.docChanges().forEach((ch) => { if (ch.type === 'added') knock(ch.doc.id, ch.doc.data()); });
      }, (e) => console.warn('peers listener', e)));
    }
    this.peerPoll = setInterval(async () => {
      try { (await F.getDocs(peersCol)).forEach((doc) => knock(doc.id, doc.data())); } catch (e) { /* offline: try again */ }
    }, 2000);
    this.timers.push(this.peerPoll);
    return this.code;
  }

  async offerTo(peerId) {
    if (this.links.has(peerId)) return;
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
    const take = async (s) => {
      if (s.kind === 'answer' && !pc.remoteDescription) {
        try { await pc.setRemoteDescription(JSON.parse(s.data)); this.status('Friend answered, connecting…'); } catch (e) { console.warn(e); }
      }
    };
    if (!this.noListen) this.unsubs.push(F.onSnapshot(sigs, (qs) => { qs.docChanges().forEach((ch) => { if (ch.type === 'added') take(ch.doc.data()); }); }, (e) => console.warn('answer listener', e)));
    const poll = setInterval(async () => {
      if (pc.remoteDescription || !this.links.has(peerId)) { clearInterval(poll); return; }
      try { (await F.getDocs(sigs)).forEach((doc) => take(doc.data())); } catch (e) { /* retry */ }
    }, 1500);
    this.timers.push(poll);
  }

  async setStatus(status) {
    if (this.role !== 'host' || !this.code) return;
    const F = await this.fs();
    const d = await db();
    if (status !== 'lobby') clearInterval(this.peerPoll);          // nobody joins a game in progress: stop asking
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
    pc.oniceconnectionstatechange = () => { if (pc.iceConnectionState === 'failed') this.status('Could not reach the host over the network (ICE failed).'); };
    const sigs = F.collection(d, 'rooms', code, 'peers', this.id, 'signals');
    const answered = new Promise((resolve, reject) => {
      const to = setTimeout(() => { done = true; reject(new Error('The host did not answer. Ask them to keep the game open on the lobby screen, then try again.')); }, 40000);
      let done = false, working = false;
      const handle = async (s) => {
        if (done || working || s.kind !== 'offer' || pc.remoteDescription) return;
        working = true;
        try {
          this.status('Host answered, connecting…');
          await pc.setRemoteDescription(JSON.parse(s.data));
          await pc.setLocalDescription(await pc.createAnswer());
          await waitIce(pc);
          await F.addDoc(sigs, { from: this.id, kind: 'answer', data: JSON.stringify(pc.localDescription), t: Date.now() });
          done = true; clearTimeout(to);
          resolve();
        } catch (e) { done = true; clearTimeout(to); reject(e); }
      };
      if (!this.noListen) {
        this.unsubs.push(F.onSnapshot(sigs, (qs) => { qs.docChanges().forEach((ch) => { if (ch.type === 'added') handle(ch.doc.data()); }); }, (e) => console.warn('signals listener', e)));
      }
      this.timers.push(setInterval(async () => {
        if (done) return;
        try { (await F.getDocs(sigs)).forEach((doc) => handle(doc.data())); } catch (e) { /* retry */ }
      }, 1500));
    });
    await F.setDoc(F.doc(d, 'rooms', code, 'peers', this.id), { name: (name || 'Survivor').slice(0, 16), t: Date.now() });
    this.status('Knocking…');
    await answered;
    this.status('Connecting…');
    await new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('Found the game but could not open a line to the host. If you are on mobile data, try the same Wi-Fi as the host (or have the host try Wi-Fi).')), 25000);
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
    this.timers.forEach(clearInterval);
    this.timers = [];
    this.offered.clear();
    for (const l of this.links.values()) l.close();
    this.links.clear();
    if (this.role === 'host' && this.code) await this.setStatus('closed');
    this.role = 'solo';
    this.code = null;
  }
}
