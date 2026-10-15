// Boot, menus, the co-op lobby, and handing off to a Game.
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/ibm-plex-mono/500.css';
import './style.css';
import * as THREE from 'three';
import { Engine, isTouch } from './game/engine.js';
import { loadCharacters, loadProps, ZOMBIES, SURVIVORS, loadWeapon } from './game/assets.js';
import { Game } from './game/game.js';
import { HUD, escapeHtml } from './ui/hud.js';
import { Input } from './game/input.js';
import { audio } from './game/audio.js';
import { Net } from './net/net.js';
import { Shop } from './ui/shop.js';
import { save } from './game/save.js';
import { LEVEL_IDS, levelInfo } from './game/level.js';
import * as LEVELDATA from './game/level.js';

const $ = (id) => document.getElementById(id);
const canvas = $('view');
const engine = new Engine(canvas);
const hud = new HUD($('hud'));
const input = new Input(canvas, hud);
let game = null;
let net = null;
let lobby = [];          // [{ id, name, model, seat }]
let queued = [];
let starting = false;
let picked = 1;                // the level chosen on the menu
const shop = new Shop();

const store = {
  get(k, d) { try { return localStorage.getItem('ds.' + k) ?? d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('ds.' + k, v); } catch (e) { /* private mode */ } },
};
const me = {
  get name() { return ($('name').value.trim() || 'Survivor').slice(0, 14); },
  model: store.get('model', 'survivor_a'),
};

function show(screen) {
  for (const id of ['loading', 'menu', 'lobby']) $(id).classList.toggle('hidden', id !== screen);
  hud.show(screen === 'game');
}

// ----------------------------------------------------------------- boot --
async function boot() {
  const bar = document.querySelector('.load-bar i');
  let done = 0;
  const steps = [loadCharacters(ZOMBIES), loadProps(), ...['pistol', 'smg', 'shotgun', 'rifle', 'lmg'].map(loadWeapon)];
  steps.forEach((p) => p.then(() => { done++; bar.style.width = (done / steps.length * 100) + '%'; }));
  await Promise.all(steps);
  $('name').value = store.get('name', '');
  document.querySelectorAll('.chip[data-model]').forEach((c) => {
    c.classList.toggle('on', c.dataset.model === me.model);
    c.addEventListener('click', () => {
      me.model = c.dataset.model;
      store.set('model', me.model);
      document.querySelectorAll('.chip[data-model]').forEach((o) => o.classList.toggle('on', o === c));
      click();
    });
  });
  $('name').addEventListener('change', () => store.set('name', $('name').value.trim()));
  const qs = new URLSearchParams(location.search);
  requestAnimationFrame(loop);
  if (qs.has('play')) {
    // QA: straight into level 1 (?play&bot plays itself)
    // QA: ?kit=smg starts with the SMG bought and equipped, ?cash=5000 fills the wallet, ?lvl=2 picks the level
    if (qs.get('kit')) for (const k of qs.get('kit').split(',')) if (save.data.weapons[k]) { save.data.weapons[k].owned = true; save.data.equipped = k; }
    if (qs.has('cash')) save.data.cash = +qs.get('cash');
    if (qs.get('perks')) for (const kv of qs.get('perks').split(',')) { const [k, v] = kv.split(':'); save.data.perks[k] = +v; }
    save.write();
    await startGame(soloPlayers(), 'me', { checkpoint: +(qs.get('cp') || 0), level: +(qs.get('lvl') || 1) });
    if (qs.has('bot')) game.bot = true;
  } else {
    await attract();
    buildLevelPicker();
    show('menu');
  }
  window.__game = () => game;
  window.__THREE = THREE;
  window.__save = save;
  window.__level = LEVELDATA;
  window.__shop = shop;
  // QA: run the simulation forward without drawing (software GL is slow)
  window.__advance = (secs, step = 1 / 30) => { for (let t = 0; t < secs; t += step) game.update(step); return game.time; };
  window.__ready = true;
}

// ------------------------------------------------------------- the safehouse --
// `level` is the one DEPLOY starts. After a win it is the next level; from the menu it is the one picked.
function openShop(level, won = false) {
  const target = won ? Math.min(level + 1, Math.max(...LEVEL_IDS)) : level;
  const host = !net || net.role !== 'client';
  shop.open({
    level: target,
    deploy: host && target <= save.unlocked ? () => deploy(target) : null,
    why: host ? `LEVEL ${target} IS LOCKED` : 'WAITING FOR THE HOST',
    onClose: () => { refreshMenu(); },
  });
}

function deploy(level) {
  shop.el.classList.add('hidden');
  if (!net || net.role === 'solo') return startGame(soloPlayers(), 'me', { level });
  net.broadcast({ t: 'start', players: lobby, lvl: level });
  return startGame(lobby, net.id, { level });
}

function buildLevelPicker() {
  const box = $('levels');
  box.innerHTML = '';
  for (const id of LEVEL_IDS) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.dataset.level = id;
    b.textContent = String(id);
    b.addEventListener('click', () => { if (id > save.unlocked) { audio.unlock(); audio.play('deny', { vol: 0.6, jitter: 0 }); hud.toast?.('Win the earlier level first'); return; } picked = id; click(); refreshMenu(); });
    box.appendChild(b);
  }
  refreshMenu();
}

function refreshMenu() {
  if (picked > save.unlocked) picked = 1;
  document.querySelectorAll('#levels .chip').forEach((b) => {
    const id = +b.dataset.level;
    b.classList.toggle('on', id === picked);
    b.classList.toggle('lock', id > save.unlocked);
  });
  const info = levelInfo(picked);
  $('lc-name').textContent = `LEVEL ${picked} — ${info.name}`;
  $('lc-text').textContent = info.blurb;
  $('menu-cash').textContent = '$' + save.cash.toLocaleString('en-US');
  $('start').textContent = `START LEVEL ${picked}`;
}

function click() { audio.unlock(); audio.play('click', { vol: 0.5, jitter: 0 }); }

async function attract() {
  if (game) game.dispose();
  game = new Game(engine, hud, input, null, { attract: true, players: [{ id: 'cam', name: '', model: 'z_office', seat: 0 }], localId: 'cam' });
  await game.init();
  game.start();
}

// ----------------------------------------------------------------- loop --
let last = performance.now();
const FAST = new URLSearchParams(location.search).has('fast');   // QA on slow software GL
function loop(now) {
  // a 90/120 Hz phone: render every second or third refresh so the pace is an even 60/45/40 instead of
  // a GPU that is asked for twice the work and ends up stuttering
  if (now - last < 15.2 && !FAST) { requestAnimationFrame(loop); return; }
  const dtMs = Math.min(100, now - last);
  last = now;
  const dt = dtMs / 1000;
  if (game && game.ready && !game.paused) {
    // fixed-ish steps (never on a level that is still loading: Game.init is async): a slow phone must not run the dead in slow motion
    const span = Math.min(dt, FAST ? 1 / 8 : 0.1);
    const n = FAST ? 1 : Math.max(1, Math.ceil(span / (1 / 30)));
    for (let i = 0; i < n; i++) game.update(span / n);
  }
  engine.render(dt);
  engine.budget(dtMs, now);
  requestAnimationFrame(loop);
}

// ------------------------------------------------------------ play solo --
async function startGame(players, localId, opts = {}) {
  starting = true;
  show('loading');
  const level = opts.level || 1;
  document.querySelector('.load-text').textContent = `LEVEL ${level} — ${levelInfo(level).name}`;
  if (game) game.dispose();
  hud.reset();
  input.reset();
  document.activeElement?.blur?.();            // the join-code box must not keep the keyboard (or its keys)
  await loadCharacters([...new Set(players.map((p) => p.model))]);   // survivors load when chosen
  shop.el.classList.add('hidden');
  game = new Game(engine, hud, input, net, { players, localId, checkpoint: opts.checkpoint || 0, level });
  await game.init();
  // replay anything that arrived while we were building the level
  const q = queued; queued = [];
  q.forEach(([from, m]) => game.onNet(from, m));
  starting = false;
  show('game');
  game.start();
  hud.onReload = () => game?.me.startReload();
  hud.onQuit = () => quit();
  hud.onRetry = (fromCp) => retry(fromCp);
  hud.onSwap = () => game?.me.cycleWeapon();
  hud.onSafehouse = () => openShop(game.level, !!game.won);
  if (isTouch) {
    try { await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }); } catch (e) { /* iOS */ }
    try { await screen.orientation?.lock?.('landscape'); } catch (e) { /* not allowed */ }
  }
}

function soloPlayers() { return [{ id: 'me', name: me.name, model: me.model, seat: 0 }]; }

async function retry(fromCp = false) {
  const checkpoint = fromCp ? (game?.opened || 0) : 0;
  const level = game?.level || 1;
  if (!net || net.role === 'solo') return startGame(soloPlayers(), 'me', { checkpoint, level });
  if (net.role === 'host') {
    net.broadcast({ t: 'start', players: lobby, cp: checkpoint, lvl: level });
    return startGame(lobby, net.id, { checkpoint, level });
  }
  hud.toast('Waiting for the host to restart…');
}

async function quit() {
  if (net) { await net.close(); net = null; }
  lobby = [];
  hud.reset();
  show('loading');
  await attract();
  buildLevelPicker();
  show('menu');
}

$('solo').addEventListener('click', async () => {
  click();
  store.set('name', $('name').value.trim());
  await startGame(soloPlayers(), 'me', { level: picked });
});

// --------------------------------------------------------------- co-op --
function renderSeats() {
  const seats = [];
  for (let i = 0; i < 4; i++) {
    const p = lobby.find((q) => q.seat === i);
    seats.push(p
      ? `<div class="seat"><span>${escapeHtml(p.name)}</span><small>${i === 0 ? 'HOST' : 'READY'}</small></div>`
      : '<div class="seat empty"><span>open</span><small>—</small></div>');
  }
  $('seats').innerHTML = seats.join('');
  $('start').disabled = lobby.length < 1;
}

function status(text, err = false) {
  $('lobby-status').textContent = text;
  $('lobby-status').classList.toggle('err', err);
}

function lobbyMessage(from, m) {
  if (m.t === 'start' && net.role === 'client') {
    lobby = m.players;
    startGame(lobby, net.id, { checkpoint: m.cp || 0, level: m.lvl || 1 });
    return;
  }
  if (starting || (game && !game.opts.attract)) {
    if (starting) queued.push([from, m]); else game.onNet(from, m);
    return;
  }
  if (net.role === 'host' && m.t === 'hello') {
    if (lobby.length >= 4 || lobby.find((p) => p.id === from)) return;
    const used = new Set(lobby.map((p) => p.seat));
    let seat = 0; while (used.has(seat)) seat++;
    // two of the same survivor is fine, but give variety when we can
    let model = m.model;
    if (lobby.some((p) => p.model === model)) model = SURVIVORS.find((s) => !lobby.some((p) => p.model === s)) || model;
    lobby.push({ id: from, name: String(m.name || 'Survivor').slice(0, 14), model, seat });
    net.broadcast({ t: 'lobby', players: lobby });
    renderSeats();
    audio.play('click', { vol: 0.6, jitter: 0 });
  } else if (m.t === 'lobby') {
    lobby = m.players;
    renderSeats();
    status('In the room. Waiting for the host to start.');
  } else if (m.t === 'start') {
    lobby = m.players;
    startGame(lobby, net.id, { checkpoint: m.cp || 0, level: m.lvl || 1 });
  }
}

function peerChange(id, st) {
  if (game && !game.opts.attract) return;
  if (st === 'close') {
    if (net.role === 'client') { status('Lost the host.', true); return; }
    lobby = lobby.filter((p) => p.id !== id);
    net.broadcast({ t: 'lobby', players: lobby });
    renderSeats();
  }
}

function newNet() {
  net = new Net();
  net.onMessage = (from, m) => lobbyMessage(from, m);
  net.onPeer = (id, st) => {
    if (game && !game.opts.attract) { game.net === net && st === 'close' && game.peerLeft(id); return; }
    if (st === 'open' && net.role === 'client') net.toHost({ t: 'hello', name: me.name, model: me.model });
    peerChange(id, st);
  };
  net.onStatus = (s) => status(s);
  return net;
}

$('safehouse').addEventListener('click', () => {
  click();
  openShop(picked, false);
});

$('host').addEventListener('click', async () => {
  click();
  store.set('name', $('name').value.trim());
  show('lobby');
  $('lobby-kicker').textContent = 'HOSTING · SEND THIS CODE TO YOUR FRIENDS';
  $('code-wrap').classList.remove('hidden');
  $('join-wrap').classList.add('hidden');
  $('start').classList.remove('hidden');
  $('code').textContent = '····';
  status('Opening a room…');
  newNet();
  lobby = [{ id: net.id, name: me.name, model: me.model, seat: 0 }];
  renderSeats();
  try {
    const code = await net.host();
    $('code').textContent = code;
    status('Waiting for friends. You can also start alone.');
  } catch (e) {
    console.error(e);
    status('Could not open a room: ' + (e.message || e), true);
  }
});

$('share').addEventListener('click', async () => {
  click();
  const code = net?.code;
  if (!code) return;
  const url = location.origin + location.pathname;
  const text = `Join my Dead Signal game. Code: ${code}`;
  try {
    if (navigator.share) await navigator.share({ title: 'Dead Signal', text, url });
    else { await navigator.clipboard.writeText(`${text} — ${url}`); status('Copied. Paste it to your friends.'); }
  } catch (e) { /* cancelled */ }
});

$('join').addEventListener('click', () => {
  click();
  store.set('name', $('name').value.trim());
  show('lobby');
  $('lobby-kicker').textContent = 'JOIN A FRIEND';
  $('code-wrap').classList.add('hidden');
  $('join-wrap').classList.remove('hidden');
  $('start').classList.add('hidden');
  lobby = [];
  renderSeats();
  status('Type the 4-letter code your friend sent you.');
  setTimeout(() => $('code-in').focus(), 50);
});

$('code-in').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); });
$('code-in').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('join-go').click(); });
$('join-go').addEventListener('click', async () => {
  click();
  const code = $('code-in').value.trim();
  if (code.length !== 4) { status('Codes are 4 letters.', true); return; }
  $('join-go').disabled = true;
  newNet();
  try {
    status('Looking for the game…');
    await net.join(code, me.name);
    $('join-wrap').classList.add('hidden');
    status('Connected. Waiting for the host to start.');
  } catch (e) {
    console.error(e);
    status(e.message || 'Could not join.', true);
    await net.close();
    net = null;
  } finally {
    $('join-go').disabled = false;
  }
});

$('start').addEventListener('click', async () => {
  click();
  if (!net) return;
  await net.setStatus('playing');
  net.broadcast({ t: 'start', players: lobby, lvl: picked });
  startGame(lobby, net.id, { level: picked });
});

$('leave').addEventListener('click', async () => {
  click();
  if (net) { await net.close(); net = null; }
  show('menu');
});

// any first touch unlocks audio (iOS needs a gesture)
addEventListener('pointerdown', () => audio.unlock(), { once: true });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game && !game.opts.attract && (!net || net.role === 'solo')) hud.el.pauseMenu.classList.remove('hidden');
});

boot().catch((e) => {
  console.error(e);
  document.querySelector('.load-text').textContent = 'FAILED TO LOAD: ' + (e.message || e);
});
