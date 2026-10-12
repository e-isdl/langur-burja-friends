'use strict';
// Langur Burja: one shared 20s betting clock for the whole table, undo while
// the clock runs, roll when everyone is in, 7s roll window, zero-sum payouts.
// Part 1 is a pure module test (deterministic), part 2 drives a real room
// over WebSocket (clock behaviour, undo off-actor, timing, ledger).
const WebSocket = require('ws');
const { server } = require('../server/index');
const langur = require('../server/games/langur');
const { make } = require('../server/lib/rng');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (cond, msg) => { if (!cond) throw new Error('ASSERT: ' + msg); };

/* ---------------- part 1: module ---------------- */
function moduleTest() {
  const seats = [{ name: 'A', bot: false }, { name: 'B', bot: false }, { name: 'C', bot: true }];
  const s = langur.create({ seats, opts: { unit: 10 }, rng: make(7), hand: 1 });
  s.ev = [];
  assert(langur.turnMs() === 20000, 'shared clock is 20s');
  const w0 = langur.turnKey(s);
  assert(w0 === 'bet', 'one betting window for everyone');
  const pot0 = s.pot;

  langur.act(s, 0, { t: 'bet', sym: 2, stake: 10 });
  assert(s.pot === pot0 + 10, 'pot grew by the stake');
  assert(langur.turnKey(s) === w0, 'clock window does not reset when someone bets');
  assert(langur.actors(s).join(',') === '1,2', 'actors shrink inside the same window, got ' + langur.actors(s));
  assert(langur.offTurn(s, 0, { t: 'undo' }) === true, 'undo is an off-turn act while you hold a bet');

  langur.act(s, 0, { t: 'undo' });
  assert(s.pot === pot0, 'undo returns the stake');
  assert(s.bets[0] === null, 'undo clears the bet');
  assert(langur.offTurn(s, 0, { t: 'undo' }) === false, 'nothing to undo');
  let threw = null; try { langur.act(s, 0, { t: 'undo' }); } catch (e) { threw = e; }
  assert(threw && /not bet/i.test(threw.message), 'undo without a bet rejected: ' + (threw && threw.message));

  langur.act(s, 0, { t: 'bet', sym: 1, stake: 5 });
  threw = null; try { langur.act(s, 0, { t: 'bet', sym: 3, stake: 5 }); } catch (e) { threw = e; }
  assert(threw && /Undo/i.test(threw.message), 'double bet rejected, undo instead');

  langur.act(s, 1, { t: 'bet', sym: 0, stake: 15 });
  langur.act(s, 2, { t: 'sit' });
  assert(s.phase === 'roll', 'roll starts the moment every seat is in');
  assert(langur.turnKey(s) !== w0, 'phase change opens a new clock window');
  assert(langur.actors(s).length === 0, 'nobody to act during the roll');
  assert(langur.tickDelay(s) === 7000, 'roll window is 7s, got ' + langur.tickDelay(s));
  assert(langur.view(s, 0).faces === null, 'faces stay hidden while rolling');

  langur.tick(s);                                   // roll -> reveal
  assert(s.phase === 'reveal' && s.verdict, 'reveal computed');
  assert(Array.isArray(langur.view(s, 0).faces), 'faces visible after reveal');
  const r = langur.result(s);
  const sum = r.deltas.reduce((a, b) => a + b, 0);
  assert(sum === 0, 'deltas zero-sum, got ' + JSON.stringify(r.deltas));
  console.log('module: window, undo, roll timing, zero-sum ok');
}

/* ---------------- part 2: real room over WebSocket ---------------- */
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
  c.waitState = async (pred, ms = 30000, what = 'state') => {
    const t0 = Date.now();
    for (;;) {
      if (c.lastState && pred(c.lastState)) return c.lastState;
      if (Date.now() - t0 > ms) throw new Error('timeout waiting for ' + what + ' (phase ' + (c.view && c.view.phase) + ')');
      await sleep(40);
    }
  };
  return c;
}

async function roomTest() {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const a = client(port), b = client(port);
  await a.open(); a.send({ t: 'hello' }); await sleep(50);
  a.send({ t: 'create', name: 'Ishan' }); await sleep(80);        // real timers: no test/fast mode
  assert(a.room, 'room created');
  await b.open(); b.send({ t: 'hello' }); await sleep(40);
  b.send({ t: 'join', code: a.room.code, name: 'Riya' }); await sleep(80);
  assert(b.room && b.room.code === a.room.code, 'second player joined');
  a.send({ t: 'addbot' }); a.send({ t: 'addbot' }); await sleep(80);
  a.send({ t: 'pick', game: 'langur', opts: { unit: 10 } }); await sleep(40);
  a.send({ t: 'start', game: 'langur' });

  // 1) one shared 20s clock arrives with the hand
  const s1 = await a.waitState((m) => m.v && m.v.phase === 'bet', 8000, 'bet phase');
  assert(s1.deadline, 'deadline present during betting');
  const win = s1.deadline - s1.now;
  assert(win >= 18000 && win <= 21500, 'betting window is 20s, got ' + win + 'ms');
  assert(s1.v.canBet === true, 'I can bet straight away (no turn queue)');
  assert(s1.v.n === 4, '4 seats at the table, got ' + s1.v.n);

  // 2) betting must NOT restart or extend the clock (B is still deciding)
  a.send({ t: 'act', a: { t: 'bet', sym: 3, stake: 10 } });
  const s2 = await a.waitState((m) => m.v && m.v.me && m.v.me.sym === 3, 5000, 'bet placed');
  assert(s2.deadline === s1.deadline, 'clock did not reset when I bet (' + s1.deadline + ' vs ' + s2.deadline + ')');
  assert(s2.v.canBet === false, 'cannot double-bet');
  assert(s2.v.placed >= 1, 'placed counter advanced');

  // 3) undo arrives off-actor (I already hold a bet) and fully reverts it
  a.send({ t: 'act', a: { t: 'undo' } });
  const s3 = await a.waitState((m) => m.v && !m.v.me, 5000, 'undo');
  assert(s3.v.canBet === true, 'can bet again after undo');
  assert(s3.deadline === s1.deadline, 'clock still untouched after undo');

  const errsBefore = a.msgs.filter((m) => m.t === 'error').length;
  a.send({ t: 'act', a: { t: 'undo' } });                          // nothing to undo: rejected cleanly
  await sleep(200);
  const newErrs = a.msgs.filter((m) => m.t === 'error').slice(errsBefore);
  assert(newErrs.length === 1 && /not bet/i.test(newErrs[0].message), 'undo without a bet rejected: ' + JSON.stringify(newErrs));
  assert(a.lastState.v.canBet, 'view unchanged after the rejected undo');
  console.log('undo over ws ok');

  // re-bet, then bring the second human in; bots come in on their own
  a.send({ t: 'act', a: { t: 'bet', sym: 0, stake: 5 } });
  await a.waitState((m) => m.v && m.v.me && m.v.me.sym === 0, 5000, 're-bet');
  b.send({ t: 'act', a: { t: 'bet', sym: 2, stake: 10 } });
  await b.waitState((m) => m.v && m.v.me && m.v.me.sym === 2, 5000, 'second player bet');

  // 4) roll starts as soon as every seat is in, with no per-turn deadline
  const tAllIn = Date.now();
  await a.waitState((m) => m.v && m.v.phase === 'roll', 10000, 'roll');
  const betDur = Date.now() - tAllIn;
  assert(!a.lastState.deadline, 'no per-turn deadline while the bowl rolls');
  assert(betDur <= 6000, 'roll right after the humans are in (bots act fast), got ' + betDur + 'ms');
  console.log('all placed after', betDur + 'ms');

  // 5) the roll gets a full animation window, then reveals
  const tRoll = Date.now();
  await a.waitState((m) => m.v && m.v.phase === 'reveal', 15000, 'reveal');
  const rollDur = Date.now() - tRoll;
  assert(rollDur >= 6000 && rollDur <= 9500, 'roll window ~7s, got ' + rollDur + 'ms');
  console.log('roll window', rollDur + 'ms');
  const sRev = a.lastState;
  assert(Array.isArray(sRev.v.faces) && sRev.v.faces.length === 6, 'faces revealed');
  assert(sRev.v.verdict && sRev.v.verdict.counts, 'verdict computed');

  // 6) result lands zero-sum on the ledger
  await a.waitState((m) => !!m.result, 15000, 'result');
  const res = a.lastState.result;
  assert(res.deltas.reduce((x, y) => x + y, 0) === 0, 'deltas zero-sum, got ' + JSON.stringify(res.deltas));
  await sleep(300);
  const kh = b.room ? b.room.players.map((p) => p.khata) : [];
  assert(kh.length && kh.every((k) => Number.isInteger(k)), 'khata integers ' + JSON.stringify(kh));
  console.log('deltas', JSON.stringify(res.deltas), 'khata', JSON.stringify(kh));

  a.ws.close(); b.ws.close();
  server.close();
}

(async () => {
  moduleTest();
  await roomTest();
  console.log('LANGUR TEST PASS');
  process.exit(0);
})().catch((e) => { console.error('LANGUR TEST FAIL', e); process.exit(1); });
