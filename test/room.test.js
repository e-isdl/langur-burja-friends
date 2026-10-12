'use strict';
// Drives the real server over WebSocket: create room, start Call Break with bots, play as a human,
// drop the socket mid-game and reconnect, finish the match, check khata stays zero-sum.
const WebSocket = require('ws');
const { server } = require('../server/index');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client(port, name) {
  const c = { msgs: [], token: null, pid: null, seat: -1, view: null, room: null, result: null, handNo: 0, lastState: null };
  c.open = () => new Promise((res) => {
    c.ws = new WebSocket('ws://localhost:' + port + '/');
    c.ws.on('open', () => res());
    c.ws.on('message', (raw) => {
      const m = JSON.parse(raw); c.msgs.push(m);
      if (m.t === 'hi') { c.token = m.token; c.pid = m.pid; }
      if (m.t === 'room') c.room = m.room;
      if (m.t === 'state') { c.lastState = m; c.view = m.v; c.seat = m.seat; c.result = m.result; c.handNo = m.hand; c.act(); }
      if (m.t === 'lobby') c.inLobby = true;
    });
  });
  c.send = (o) => c.ws.send(JSON.stringify(o));
  c.act = () => {
    const m = c.lastState; if (!m || m.result || !m.actors.includes(m.seat)) return;
    const v = m.v;
    if (m.g === 'callbreak') {
      if (v.canBid) c.send({ t: 'act', a: { t: 'bid', n: 2 } });
      else if (v.legal.length) c.send({ t: 'act', a: { t: 'play', card: v.legal[0] } });
    }
  };
  return c;
}

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const a = client(port, 'Ishan'); await a.open();
  a.send({ t: 'hello' }); await sleep(50);
  a.send({ t: 'create', name: 'Ishan', test: true }); await sleep(80);
  if (!a.room) throw new Error('no room after create');
  console.log('room', a.room.code, 'host?', a.room.hostPid === a.pid);
  a.send({ t: 'pick', game: 'callbreak', opts: { unit: 5 } }); await sleep(30);
  a.send({ t: 'start', game: 'callbreak' }); await sleep(150);
  if (!a.view) throw new Error('no state after start');
  console.log('seats', a.room.seats.length, 'players', a.room.players.map((p) => p.name + (p.bot ? '(bot)' : '')).join(','));

  // Drop the connection mid-game, then come back with the token.
  await sleep(200);
  const tok = a.token; a.ws.close(); await sleep(100);
  const b = client(port, 'Ishan'); await b.open();
  b.send({ t: 'hello', token: tok }); await sleep(150);
  if (!b.view) throw new Error('reconnect did not restore the game view');
  console.log('reconnected into hand', b.handNo, 'seat', b.seat, 'phase', b.view.phase, 'hand size', b.view.hand.length);

  // Play to the end of the match (5 rounds).
  const t0 = Date.now();
  while (!b.inLobby && Date.now() - t0 < 60000) await sleep(100);
  if (!b.inLobby) throw new Error('match did not finish, stuck in ' + (b.view && b.view.phase) + ' round ' + (b.view && b.view.round));
  console.log('match finished. khata', b.room.players.map((p) => p.name + ':' + p.khata).join(' '));
  if (!b.room.players.every((p) => Number.isInteger(p.khata))) throw new Error('khata not integer');
  if (b.room.players.some((p) => p.bot)) throw new Error('temporary bots were not cleaned up');
  if (b.room.phase !== 'lobby') throw new Error('room did not return to lobby');
  console.log('ROOM TEST PASS');
  process.exit(0);
})().catch((e) => { console.error('ROOM TEST FAIL', e); process.exit(1); });
