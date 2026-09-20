/**
 * langur-burja-friends — private room server for friends.
 *
 * No DB, no auth, trust host.
 * - Host creates a room, shares the 6-char code + public URL (via Cloudflare Tunnel / WhatsApp).
 * - Friends join with a name. Chips are fun-credits stored in memory only.
 * - Game rules / cards / dice run client-side; server only relays `action` messages,
 *   tracks presence, chips deltas, and game lifecycle (start/end).
 */

const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');

const app = express();
app.use(express.json());

// Serve the frontend (client handles all game UI/rules).
app.use(express.static(path.join(__dirname, 'public')));

// Health check: { ok:true, rooms:n }
app.get('/health', (req, res) => {
  res.json({ ok: true, rooms: rooms.size });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ---------------------------------------------------------------------------
// Room state
// ---------------------------------------------------------------------------

// code -> room { code, hostId, players, game, createdAt, startingChips }
// player { id, name, chips, seat, connected, ws, lastSeen }
// ws is kept on the player object at runtime but NEVER sent to clients
// (see publicState below).
const rooms = new Map();

// Excludes confusing chars: 0/O, 1/I/L — easier to dictate over voice/WhatsApp.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const MAX_PLAYERS = 8;
const DEFAULT_CHIPS = 200;

// Games the server will accept for start-game. Rules themselves live client-side.
const ALLOWED_GAMES = new Set([
  'langur-burja',
  'teen-patti',
  'kitti',
  'jud-patti',
  'phalas',
  'marriage',
  'call-break',
  'in-between',
  'roulette',
  'sic-bo',
]);

function genRoomCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    }
  } while (rooms.has(code)); // avoid collision with live rooms
  return code;
}

function cleanName(name) {
  return typeof name === 'string' ? name.trim().slice(0, 20) : '';
}

function toChips(value, fallback) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, 1000000); // sanity cap so a typo can't explode balances
}

// Strip ws / internal fields before sending room to clients.
function publicState(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    startingChips: room.startingChips,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      chips: p.chips,
      seat: p.seat,
      connected: p.connected,
    })),
    game: room.game ? { type: room.game.type } : null,
  };
}

// Safe send: never throw if a socket is closing/closed.
function send(ws, obj) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify(obj));
  } catch (_) {
    // ignore — heartbeat / close handler will clean up
  }
}

function sendError(ws, message) {
  send(ws, { type: 'error', message });
}

// Broadcast to every connected player in the room, optionally skipping one.
function broadcast(room, obj, excludePlayerId = null) {
  for (const p of room.players) {
    if (excludePlayerId && p.id === excludePlayerId) continue;
    send(p.ws, obj);
  }
}

function roomOf(ws) {
  if (!ws.roomCode) return null;
  return rooms.get(ws.roomCode) || null;
}

function playerOf(room, ws) {
  if (!room || !ws.playerId) return null;
  return room.players.find((p) => p.id === ws.playerId) || null;
}

// ---------------------------------------------------------------------------
// Message handlers
// ---------------------------------------------------------------------------

function handleCreate(ws, msg) {
  const name = cleanName(msg.name);
  if (!name) {
    sendError(ws, 'Name must be 1-20 characters');
    return;
  }
  const code = genRoomCode();
  const startingChips = toChips(msg.chips, DEFAULT_CHIPS);

  const room = {
    code,
    hostId: null,
    players: [],
    game: null,
    createdAt: Date.now(),
    startingChips,
  };

  const player = {
    id: crypto.randomUUID(),
    name,
    chips: toChips(msg.chips, startingChips),
    seat: 0,
    connected: true,
    ws,
    lastSeen: Date.now(),
  };
  room.hostId = player.id;
  room.players.push(player);
  rooms.set(code, room);

  ws.roomCode = code;
  ws.playerId = player.id;

  send(ws, {
    type: 'joined',
    you: { id: player.id, name: player.name, chips: player.chips, seat: player.seat },
    room: publicState(room),
  });
  console.log(`[room ${code}] created by ${name} (${player.id})`);
}

function handleJoin(ws, msg) {
  const code = typeof msg.code === 'string' ? msg.code.trim().toUpperCase() : '';
  const name = cleanName(msg.name);
  if (!code) {
    sendError(ws, 'Room code required');
    return;
  }
  if (!name) {
    sendError(ws, 'Name must be 1-20 characters');
    return;
  }
  const room = rooms.get(code);
  if (!room) {
    sendError(ws, 'Room not found');
    return;
  }

  // Reconnect path: same display name matches a disconnected seat.
  // Name match is case-insensitive so "Ram" can reclaim "ram" after a drop.
  // We reuse the old id so host status / seat / chips survive a refresh.
  const stale = room.players.find(
    (p) => !p.connected && p.name.trim().toLowerCase() === name.toLowerCase()
  );
  if (stale) {
    stale.connected = true;
    stale.ws = ws;
    stale.lastSeen = Date.now();
    // If they rejoin with explicit chips, honour it only pre-game; otherwise keep balance.
    if (msg.chips !== undefined && !room.game) {
      stale.chips = toChips(msg.chips, stale.chips);
    }
    ws.roomCode = code;
    ws.playerId = stale.id;
    send(ws, {
      type: 'joined',
      you: { id: stale.id, name: stale.name, chips: stale.chips, seat: stale.seat, reconnected: true },
      room: publicState(room),
    });
    broadcast(room, { type: 'room', room: publicState(room) }, stale.id);
    console.log(`[room ${code}] ${stale.name} reconnected (${stale.id})`);
    return;
  }

  const connectedCount = room.players.filter((p) => p.connected).length;
  if (connectedCount >= MAX_PLAYERS) {
    sendError(ws, 'Room full');
    return;
  }
  // Also cap total seats so the players array can't grow unbounded via joins/leaves.
  if (room.players.length >= MAX_PLAYERS) {
    sendError(ws, 'Room full');
    return;
  }

  const player = {
    id: crypto.randomUUID(),
    name,
    chips: toChips(msg.chips, room.startingChips),
    seat: room.players.length, // next free seat index
    connected: true,
    ws,
    lastSeen: Date.now(),
  };
  room.players.push(player);
  ws.roomCode = code;
  ws.playerId = player.id;

  send(ws, {
    type: 'joined',
    you: { id: player.id, name: player.name, chips: player.chips, seat: player.seat },
    room: publicState(room),
  });
  broadcast(room, { type: 'room', room: publicState(room) }, player.id);
  console.log(`[room ${code}] ${name} joined (${player.id})`);
}

function handleLeave(ws) {
  const room = roomOf(ws);
  if (!room) return;
  const idx = room.players.findIndex((p) => p.id === ws.playerId);
  if (idx === -1) return;
  const [gone] = room.players.splice(idx, 1);
  console.log(`[room ${room.code}] ${gone.name} left`);

  ws.roomCode = null;
  ws.playerId = null;

  if (room.players.length === 0) {
    rooms.delete(room.code);
    console.log(`[room ${room.code}] deleted (empty)`);
    return;
  }
  // Host migration: first remaining player becomes host so the room stays usable.
  if (room.hostId === gone.id) {
    room.hostId = room.players[0].id;
    console.log(`[room ${room.code}] host migrated to ${room.players[0].name}`);
  }
  broadcast(room, { type: 'room', room: publicState(room) });
}

function handleAction(ws, msg) {
  const room = roomOf(ws);
  const player = playerOf(room, ws);
  if (!room || !player) {
    sendError(ws, 'Join a room first');
    return;
  }
  player.lastSeen = Date.now();
  // Relay verbatim to everyone else. Server stays game-agnostic: clients
  // interpret `data` (bets, moves, dice rolls) per the active game.
  broadcast(room, { type: 'action', from: player.id, data: msg.data }, player.id);
}

function handleStartGame(ws, msg) {
  const room = roomOf(ws);
  const player = playerOf(room, ws);
  if (!room || !player) {
    sendError(ws, 'Join a room first');
    return;
  }
  if (player.id !== room.hostId) {
    sendError(ws, 'Only host can start the game');
    return;
  }
  const game = typeof msg.game === 'string' ? msg.game.trim().toLowerCase() : '';
  if (!ALLOWED_GAMES.has(game)) {
    sendError(ws, `Unknown game. Allowed: ${[...ALLOWED_GAMES].join(', ')}`);
    return;
  }
  room.game = { type: game };
  broadcast(room, { type: 'game-start', game });
  console.log(`[room ${room.code}] game started: ${game}`);
}

function handleEndGame(ws, msg) {
  const room = roomOf(ws);
  const player = playerOf(room, ws);
  if (!room || !player) {
    sendError(ws, 'Join a room first');
    return;
  }
  if (player.id !== room.hostId) {
    sendError(ws, 'Only host can end the game');
    return;
  }
  const results = Array.isArray(msg.results) ? msg.results : [];
  // Apply chip deltas. Numbers only, clamp at 0 so nobody goes negative.
  // Unknown playerIds are ignored (defensive against stale clients).
  for (const r of results) {
    if (!r || typeof r.playerId !== 'string') continue;
    const delta = Number(r.delta);
    if (!Number.isFinite(delta)) continue;
    const target = room.players.find((p) => p.id === r.playerId);
    if (!target) continue;
    target.chips = Math.max(0, Math.floor(target.chips + delta));
  }
  room.game = null;
  broadcast(room, { type: 'room', room: publicState(room) });
  broadcast(room, { type: 'game-end', results, room: publicState(room) });
  console.log(`[room ${room.code}] game ended, ${results.length} result(s) applied`);
}

function handleKick(ws, msg) {
  const room = roomOf(ws);
  const player = playerOf(room, ws);
  if (!room || !player) {
    sendError(ws, 'Join a room first');
    return;
  }
  if (player.id !== room.hostId) {
    sendError(ws, 'Only host can kick');
    return;
  }
  const targetId = msg.playerId;
  if (targetId === room.hostId) {
    sendError(ws, 'Cannot kick host');
    return;
  }
  const idx = room.players.findIndex((p) => p.id === targetId);
  if (idx === -1) {
    sendError(ws, 'Player not found');
    return;
  }
  const [victim] = room.players.splice(idx, 1);
  // 4400 = app-level "kicked". Client shows "You were removed by host".
  if (victim.ws && victim.ws.readyState === WebSocket.OPEN) {
    try {
      send(victim.ws, { type: 'kicked' });
      victim.ws.close(4400, 'kicked by host');
    } catch (_) {}
  }
  if (victim.ws) {
    victim.ws.roomCode = null;
    victim.ws.playerId = null;
  }
  broadcast(room, { type: 'room', room: publicState(room) });
  console.log(`[room ${room.code}] ${victim.name} kicked by host`);
}

function handleSetChips(ws, msg) {
  const room = roomOf(ws);
  const player = playerOf(room, ws);
  if (!room || !player) {
    sendError(ws, 'Join a room first');
    return;
  }
  if (player.id !== room.hostId) {
    sendError(ws, 'Only host can set chips');
    return;
  }
  // Host can only reset stacks in the lobby (pre-game) to avoid mid-hand abuse.
  if (room.game) {
    sendError(ws, 'Cannot change chips during a game');
    return;
  }
  const chips = Math.floor(Number(msg.chips));
  if (!Number.isFinite(chips) || chips <= 0 || chips > 1000000) {
    sendError(ws, 'Chips must be 1-1000000');
    return;
  }
  room.startingChips = chips;
  for (const p of room.players) p.chips = chips;
  broadcast(room, { type: 'room', room: publicState(room) });
  console.log(`[room ${room.code}] starting chips set to ${chips}`);
}

// ---------------------------------------------------------------------------
// WebSocket lifecycle
// ---------------------------------------------------------------------------

wss.on('connection', (ws) => {
  ws.roomCode = null;
  ws.playerId = null;
  ws.isAlive = true;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (_) {
      sendError(ws, 'Invalid JSON');
      return;
    }
    switch (msg.type) {
      case 'create':
        handleCreate(ws, msg);
        break;
      case 'join':
        handleJoin(ws, msg);
        break;
      case 'leave':
        handleLeave(ws);
        break;
      case 'action':
        handleAction(ws, msg);
        break;
      case 'start-game':
        handleStartGame(ws, msg);
        break;
      case 'end-game':
        handleEndGame(ws, msg);
        break;
      case 'kick':
        handleKick(ws, msg);
        break;
      case 'set-chips':
        handleSetChips(ws, msg);
        break;
      case 'ping':
        send(ws, { type: 'pong' });
        break;
      default:
        sendError(ws, `Unknown message type: ${msg.type}`);
    }
  });

  ws.on('close', () => {
    const room = roomOf(ws);
    if (!room) return;
    const player = room.players.find((p) => p.id === ws.playerId);
    if (!player) return;
    // Don't delete immediately: mark away so a quick refresh can reclaim the
    // seat via the reconnect path in handleJoin. Client shows a 30s countdown.
    player.connected = false;
    player.ws = null;
    player.lastSeen = Date.now();
    broadcast(room, { type: 'room', room: publicState(room) });
    console.log(`[room ${room.code}] ${player.name} disconnected (grace period)`);
    // Reap the room if everyone stays gone. 60s gives slow networks a chance;
    // check inside the timeout (not just blindly delete) in case someone came back.
    setTimeout(() => {
      const r = rooms.get(room.code);
      if (!r) return;
      const anyoneHere = r.players.some((p) => p.connected);
      if (!anyoneHere && r.players.every((p) => Date.now() - (p.lastSeen || 0) > 45000)) {
        rooms.delete(r.code);
        console.log(`[room ${r.code}] deleted after idle timeout`);
      }
    }, 60000).unref();
  });

  ws.on('error', () => {
    // close handler does the cleanup; suppress unhandled 'error' crashes
  });
});

// Heartbeat: drop dead sockets every 25s so `connected` flags stay truthful.
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      try {
        ws.terminate();
      } catch (_) {}
      return;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch (_) {}
  });
}, 25000);
heartbeat.unref();
wss.on('close', () => clearInterval(heartbeat));

// SPA fallback: any non-API GET serves the client (room links like /r/ABC123).
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
    if (err) res.status(404).send('Not found — add your frontend to public/');
  });
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`langur-burja-friends server on http://localhost:${PORT}`);
  console.log(`Share with friends: run "cloudflared tunnel --url http://localhost:${PORT}" then send them the https URL + room code.`);
});
