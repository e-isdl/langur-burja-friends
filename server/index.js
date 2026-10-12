'use strict';
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { WebSocketServer } = require('ws');
const { Room } = require('./room');
const games = require('./games');

const PORT = process.env.PORT || 3000;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const rooms = new Map();          // code -> Room
const tokens = new Map();         // token -> { code, pid }

const app = express();
app.disable('x-powered-by');
app.get('/health', (req, res) => res.json({ ok: true, rooms: rooms.size, games: games.ORDER }));
app.use(express.static(path.join(__dirname, '..', 'public'), {
  // Fonts can cache; HTML/JS must not (else clients run stale builds after updates).
  maxAge: '1h', etag: true,
  setHeaders(res, file) {
    if (file.endsWith('.html') || file.endsWith('.js')) res.setHeader('Cache-Control', 'no-cache');
  },
}));
app.get('/r/:code', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
app.get('/games', (req, res) => res.json(catalog()));
app.get('*', (req, res) => res.status(404).send('Not found'));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, maxPayload: 16 * 1024 });

function catalog() {
  return games.ORDER.map((id) => { const g = games[id]; return { id, name: g.name, min: g.min, max: g.max, blurb: g.blurb, units: g.units || null, rules: g.rules || [], variants: g.variants || null }; });
}

function newCode() {
  for (;;) {
    let c = ''; for (let i = 0; i < 5; i++) c += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    if (!rooms.has(c)) return c;
  }
}
function sendWs(ws, msg) { if (ws.readyState === 1) { try { ws.send(JSON.stringify(msg)); } catch (_) {} } }
function cleanName(s) { return String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16); }
function validToken(t) { return typeof t === 'string' && /^[a-f0-9]{32,64}$/.test(t) ? t : null; }

function createRoom(opts = {}) {
  const code = newCode();
  const room = new Room(code, Object.assign({}, opts, { onEmpty: (r) => rooms.delete(r.code) }));
  rooms.set(code, room);
  return room;
}

function enterRoom(ws, room, token, name) {
  let entry = tokens.get(token);
  let p = entry && entry.code === room.code ? room.players.get(entry.pid) : null;
  if (p && p.left) p = null;
  if (!p) {
    if (room.live().length >= 10) return sendWs(ws, { t: 'error', message: 'This table is full', fatal: true });
    p = room.addHuman(name, token);
    tokens.set(token, { code: room.code, pid: p.pid });
  }
  sendWs(ws, { t: 'hi', pid: p.pid, token, code: room.code });
  room.attach(p, ws);
}

function leaveCurrent(ws) {
  const room = ws.roomCode && rooms.get(ws.roomCode);
  if (room && ws.pid) { const pid = ws.pid; if (ws.token) tokens.delete(ws.token); room.removePlayer(pid); }
  ws.roomCode = null; ws.pid = null;
}

function onMessage(ws, raw) {
  // token bucket: 40 msgs / 5s
  const t = Date.now(); ws.bucket = (ws.bucket || 40) + (t - (ws.bucketAt || t)) / 125; if (ws.bucket > 40) ws.bucket = 40; ws.bucketAt = t;
  if (--ws.bucket < 0) return;
  let m; try { m = JSON.parse(raw.toString()); } catch (_) { return; }
  if (!m || typeof m.t !== 'string') return;

  if (m.t === 'ping') return sendWs(ws, { t: 'pong' });
  if (m.t === 'hello') {
    const token = validToken(m.token) || crypto.randomBytes(16).toString('hex');
    ws.token = token;
    const entry = tokens.get(token);
    let code = typeof m.code === 'string' ? m.code.trim().toUpperCase() : '';
    if (code) {
      const room = rooms.get(code);
      if (!room) { sendWs(ws, { t: 'hi', pid: null, token, code: null }); return sendWs(ws, { t: 'error', message: 'No table with code ' + code + '. Check the code and try again.', code: 'noroom' }); }
      const known = entry && entry.code === code;
      if (!known && !cleanName(m.name)) return sendWs(ws, { t: 'hi', pid: null, token, code: null, needName: code });
      return enterRoom(ws, room, token, cleanName(m.name));
    }
    const room = entry && rooms.get(entry.code);
    if (room) return enterRoom(ws, room, token, cleanName(m.name));
    return sendWs(ws, { t: 'hi', pid: null, token, code: null });
  }
  if (!ws.token) return;

  if (m.t === 'create') {
    const name = cleanName(m.name); if (!name) return sendWs(ws, { t: 'error', message: 'Enter your name first' });
    if (ws.roomCode) leaveCurrent(ws);
    const room = createRoom(m.test ? { fast: true, seed: m.seed } : {});
    return enterRoom(ws, room, ws.token, name);
  }
  if (m.t === 'join') {
    const name = cleanName(m.name); if (!name) return sendWs(ws, { t: 'error', message: 'Enter your name first' });
    const room = rooms.get(String(m.code || '').trim().toUpperCase());
    if (!room) return sendWs(ws, { t: 'error', message: 'No table with that code', code: 'noroom' });
    if (ws.roomCode && ws.roomCode !== room.code) leaveCurrent(ws);
    return enterRoom(ws, room, ws.token, name);
  }

  const room = ws.roomCode && rooms.get(ws.roomCode); if (!room) return;
  const p = room.players.get(ws.pid); if (!p || p.ws !== ws) return;
  switch (m.t) {
    case 'leave': return leaveCurrent(ws);
    case 'pick': return room.doPick(p, m);
    case 'addbot': return room.doAddBot(p);
    case 'rmbot': return room.doRemoveBot(p, m);
    case 'kick': { if (p.pid !== room.hostPid) return; const q = room.players.get(m.pid); if (q && !q.bot && q.pid !== p.pid) { if (q.token) tokens.delete(q.token); room.removePlayer(q.pid, true); } return; }
    case 'start': return room.startGame(p, m);
    case 'act': if (m.a && typeof m.a === 'object') room.handleAct(p, m.a); return;
    case 'next': return room.skipResult(p);
    case 'end': return room.endTable(p);
    case 'sit': return room.takeSeat(p, m);
    case 'react': return room.react(p, m.e);
  }
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (raw) => { try { onMessage(ws, raw); } catch (e) { console.error('message error', e); } });
  ws.on('close', () => {
    const room = ws.roomCode && rooms.get(ws.roomCode);
    const p = room && ws.pid && room.players.get(ws.pid);
    if (p) room.detach(p, ws);
  });
  ws.on('error', () => {});
});

// Heartbeat + room sweeper.
setInterval(() => {
  wss.clients.forEach((ws) => { if (ws.isAlive === false) return ws.terminate(); ws.isAlive = false; try { ws.ping(); } catch (_) {} });
  const t = Date.now();
  for (const [code, room] of rooms) {
    if (room.onlineHumans().length === 0 && t - room.lastActive > 15 * 60 * 1000 && t - Math.max(0, ...room.humans().map((p) => p.lastSeen)) > 15 * 60 * 1000) { room.dispose(); rooms.delete(code); }
  }
  for (const [tok, e] of tokens) if (!rooms.has(e.code)) tokens.delete(tok);
}, 20000).unref();

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Langur Burja & Friends on http://localhost:${PORT}  (games: ${games.ORDER.join(', ') || 'none yet'})`);
    for (const ip of lanIPs()) console.log(`Friends on your WiFi join at: http://${ip}:${PORT}`);
    console.log('Friends anywhere join at: cloudflared tunnel --url http://localhost:' + PORT);
  });
}
function lanIPs() {
  const out = [];
  try {
    for (const nets of Object.values(require('os').networkInterfaces())) for (const n of nets || []) {
      if (n && n.family === 'IPv4' && !n.internal) out.push(n.address);
    }
  } catch (_) {}
  return out;
}
module.exports = { server, rooms, createRoom };
