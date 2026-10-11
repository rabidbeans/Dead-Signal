// Online co-op: Firestore (plain HTTPS requests, no SDK: the SDK's streaming connection stalled for ~30 s on iPhones) is the lobby and the handshake; the game itself
// runs over WebRTC data channels, player to player, host-authoritative.
//
//   rooms/{CODE}                      { host, created, status, level }
//   rooms/{CODE}/peers/{peerId}       { name, t }            (a friend knocks)
//   rooms/{CODE}/peers/{peerId}/signals/{auto}  { from, kind, data, t }
//
// Offers and answers are sent complete (non-trickle ICE) so each side
// writes exactly one signal. Two channels per friend: 'u' unordered and
// unreliable for snapshots/inputs, 'r' reliable for events.
import { firebaseConfig } from './firebase.js';

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


// ---- Firestore over plain fetch. The rules (firestore.rules) allow exactly these calls without signing in.
const FS = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;
const KEY = `key=${firebaseConfig.apiKey}`;
const str = (v) => ({ stringValue: String(v) });
const int = (v) => ({ integerValue: String(Math.round(v)) });
async function api(path, { method = 'GET', body, query = '', ms = 9000 } = {}) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(`${FS}/${path}?${query}${query ? '&' : ''}${KEY}`, { method, body: body ? JSON.stringify(body) : undefined, headers: body ? { 'content-type': 'application/json' } : undefined, signal: ctl.signal });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`Lobby server said ${r.status}`);
    return await r.json();
  } finally { clearTimeout(to); }
}
const plain = (doc) => { const o = { _id: doc.name.split('/').pop() }; for (const [k, v] of Object.entries(doc.fields || {})) o[k] = v.stringValue ?? (v.integerValue !== undefined ? +v.integerValue : v); return o; };
const list = async (path) => ((await api(path, { query: 'pageSize=100' }))?.documents || []).map(plain);

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
    this.timers = [];
    this.offered = new Set();
    this.onMessage = null;    // (fromId, msg)
    this.onPeer = null;       // (id, 'open'|'close')
    this.onStatus = null;     // text
  }

  status(s) { this.onStatus?.(s); }

  // ------------------------------------------------------------- host --
  async host() {
    this.role = 'host';
    for (let tries = 0; tries < 6; tries++) {
      const c = code4();
      const old = await api(`rooms/${c}`);
      if (old && Date.now() - (plain(old).created || 0) < 6 * 3600e3) continue;
      await api(`rooms/${c}`, { method: 'PATCH', body: { fields: { host: str(this.id), created: int(Date.now()), status: str('lobby'), level: int(1) } } });
      this.code = c;
      break;
    }
    if (!this.code) throw new Error('Could not reserve a room code');
    // a friend knocks: offer them a connection (checked every 1.5 s)
    this.peerPoll = setInterval(async () => {
      try {
        for (const p of await list(`rooms/${this.code}/peers`)) {
          if (this.offered.has(p._id)) continue;
          this.offered.add(p._id);
          this.status(`${p.name || 'A friend'} is knocking…`);
          this.offerTo(p._id).catch((e) => { console.warn('offer', e); this.offered.delete(p._id); this.status('Could not answer a friend: ' + (e.message || e)); });
        }
      } catch (e) { /* offline: try again */ }
    }, 1500);
    this.timers.push(this.peerPoll);
    return this.code;
  }

  async offerTo(peerId) {
    if (this.links.has(peerId)) return;
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const link = new Link(peerId, pc);
    this.links.set(peerId, link);
    link.r = pc.createDataChannel('r', { ordered: true });
    link.u = pc.createDataChannel('u', { ordered: false, maxRetransmits: 0 });
    this.wire(link);
    await pc.setLocalDescription(await pc.createOffer());
    await waitIce(pc);
    const sigs = `rooms/${this.code}/peers/${peerId}/signals`;
    await api(sigs, { method: 'POST', body: { fields: { from: str('host'), kind: str('offer'), data: str(JSON.stringify(pc.localDescription)), t: int(Date.now()) } } });
    const poll = setInterval(async () => {
      if (pc.remoteDescription || !this.links.has(peerId)) { clearInterval(poll); return; }
      try {
        for (const s of await list(sigs)) {
          if (s.kind === 'answer' && !pc.remoteDescription) {
            await pc.setRemoteDescription(JSON.parse(s.data));
            this.status('Friend answered, connecting…');
          }
        }
      } catch (e) { /* retry */ }
    }, 1000);
    this.timers.push(poll);
  }

  async setStatus(status) {
    if (this.role !== 'host' || !this.code) return;
    if (status !== 'lobby') clearInterval(this.peerPoll);          // nobody joins a game in progress: stop asking
    try { await api(`rooms/${this.code}`, { method: 'PATCH', query: 'updateMask.fieldPaths=status', body: { fields: { status: str(status) } } }); } catch (e) { /* offline */ }
  }

  // ------------------------------------------------------------- join --
  async join(code, name) {
    code = code.toUpperCase().trim();
    this.status('Looking for the game…');
    const room = await api(`rooms/${code}`).catch(() => { throw new Error('Could not reach the lobby server. Check your connection and try again.'); });
    if (!room) throw new Error('No game with that code');
    const info = plain(room);
    if (info.status === 'closed') throw new Error('That game has ended');
    this.role = 'client';
    this.code = code;
    const hostId = info.host;
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
    const sigs = `rooms/${code}/peers/${this.id}/signals`;
    this.status('Knocking…');
    await api(`rooms/${code}/peers/${this.id}`, { method: 'PATCH', body: { fields: { name: str((name || 'Survivor').slice(0, 16)), t: int(Date.now()) } } });
    await new Promise((resolve, reject) => {
      const t0 = Date.now();
      let working = false, done = false;
      const iv = setInterval(async () => {
        if (done || working) return;
        if (Date.now() - t0 > 45000) { done = true; clearInterval(iv); reject(new Error('The host did not answer. Ask them to keep the game open on the lobby screen, then try again.')); return; }
        try {
          const offer = (await list(sigs)).find((s) => s.kind === 'offer');
          if (!offer) return;
          working = true;
          this.status('Host answered, connecting…');
          await pc.setRemoteDescription(JSON.parse(offer.data));
          await pc.setLocalDescription(await pc.createAnswer());
          await waitIce(pc);
          await api(sigs, { method: 'POST', body: { fields: { from: str(this.id), kind: str('answer'), data: str(JSON.stringify(pc.localDescription)), t: int(Date.now()) } } });
          done = true; clearInterval(iv);
          resolve();
        } catch (e) { working = false; if (pc.remoteDescription) { done = true; clearInterval(iv); reject(e); } }
      }, 1000);
      this.timers.push(iv);
    });
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
