'use strict';
// Temp: two-player multiplayer check. Host creates, friend joins by code,
// host starts langur, BOTH humans bet, both must see roll -> reveal -> result.
const WebSocket = require('ws');
const { server } = require('../server/index');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); };

function client(port) {
  const c = { msgs: [], token: null, pid: null, view: null, room: null, result: null, lastState: null };
  c.open = () => new Promise((res) => {
    c.ws = new WebSocket('ws://localhost:' + port + '/');
    c.ws.on('open', res);
    c.ws.on('message', (raw) => {
      const m = JSON.parse(raw); c.msgs.push(m);
      if (m.t === 'hi') { c.token = m.token; c.pid = m.pid; }
      if (m.t === 'room') c.room = m.room;
      if (m.t === 'state') { c.lastState = m; c.view = m.v; c.result = m.result; }
    });
  });
  c.send = (o) => c.ws.send(JSON.stringify(o));
  c.waitRoom = async (pred, ms = 8000, what = 'room') => {
    const t0 = Date.now();
    for (;;) {
      if (c.room && pred(c.room)) return c.room;
      if (Date.now() - t0 > ms) throw new Error('timeout waiting for ' + what + ' :: ' + JSON.stringify(c.room && { n: c.room.players.length, phase: c.room.phase }));
      await sleep(40);
    }
  };
  c.waitState = async (pred, ms = 25000, what = 'state') => {
    const t0 = Date.now();
    for (;;) {
      if (c.lastState && pred(c.lastState)) return c.lastState;
      if (Date.now() - t0 > ms) throw new Error('timeout waiting for ' + what);
      await sleep(40);
    }
  };
  return c;
}

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const a = client(port), b = client(port);

  // host creates
  await a.open(); a.send({ t: 'hello' }); await sleep(60);
  a.send({ t: 'create', name: 'Ishan' });
  await a.waitRoom((r) => r.code && r.players.length === 1, 5000, 'created');
  const code = a.room.code;
  console.log('room code:', code);

  // friend joins the way the /r/CODE link does: hello with code + name
  await b.open(); b.send({ t: 'hello', code, name: 'Riya' });
  await b.waitRoom((r) => r.code === code && r.players.length === 2, 5000, 'friend joined (b)');
  await a.waitRoom((r) => r.players.length === 2, 5000, 'friend joined (a sees b)');
  console.log('both in lobby:', a.room.players.map((p) => p.name).join(','));

  // host adds a bot, picks langur, deals
  a.send({ t: 'addbot' });
  await a.waitRoom((r) => r.players.length === 3, 5000, 'bot added');
  a.send({ t: 'pick', game: 'langur', opts: { unit: 10 } });
  a.send({ t: 'start', game: 'langur' });
  await a.waitState((m) => m.v && m.v.phase === 'bet', 8000, 'bet (a)');
  await b.waitState((m) => m.v && m.v.phase === 'bet', 8000, 'bet (b)');
  console.log('both see betting');

  // both humans bet; bot bets on its own
  a.send({ t: 'act', a: { t: 'bet', sym: 0, stake: 5 } });
  b.send({ t: 'act', a: { t: 'bet', sym: 2, stake: 10 } });
  await a.waitState((m) => m.v && m.v.phase === 'roll', 15000, 'roll (a)');
  await b.waitState((m) => m.v && m.v.phase === 'roll', 15000, 'roll (b)');
  console.log('both see roll');
  await a.waitState((m) => m.v && m.v.phase === 'reveal', 15000, 'reveal (a)');
  await b.waitState((m) => m.v && m.v.phase === 'reveal', 15000, 'reveal (b)');
  console.log('both see reveal');
  await a.waitState((m) => !!m.result, 15000, 'result (a)');
  await b.waitState((m) => !!m.result, 15000, 'result (b)');
  assert(JSON.stringify(a.lastState.result.deltas) === JSON.stringify(b.lastState.result.deltas), 'same result both sides: ' + JSON.stringify([a.lastState.result.deltas, b.lastState.result.deltas]));
  const sum = a.lastState.result.deltas.reduce((x, y) => x + y, 0);
  assert(sum === 0, 'zero-sum');
  console.log('MP2 PASS deltas', JSON.stringify(a.lastState.result.deltas));

  // guest tries host-only action: must be rejected, not crash
  const errsBefore = b.msgs.filter((m) => m.t === 'error').length;
  b.send({ t: 'start', game: 'langur' });
  await sleep(250);
  const errs = b.msgs.filter((m) => m.t === 'error').length;
  assert(errs > errsBefore, 'guest deal rejected cleanly');

  a.ws.close(); b.ws.close(); server.close();
  process.exit(0);
})().catch((e) => { console.error('MP2 FAIL', e); process.exit(1); });
