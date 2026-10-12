'use strict';
// Bot-vs-bot simulation with invariants. Usage: node test/sim.js [gameId ...] [--hands=N]
const games = require('../server/games');
const { make } = require('../server/lib/rng');
const { GameError } = require('../server/lib/util');

const args = process.argv.slice(2);
const HANDS = +((args.find((a) => a.startsWith('--hands=')) || '--hands=60').split('=')[1]);
const only = args.filter((a) => !a.startsWith('--'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const STEP_CAP = 5000;

function fuzzActions(mod, state, seat, rng) {
  const out = [{}, { t: 'nope' }, { t: 'play' }, { t: 'bid', n: -3 }, { t: 'bid', n: 99 }, { t: 'bid', n: 'x' }, { t: 'play', card: 'ZZ' },
    { t: 'discard' }, { t: 'draw', from: 'nowhere' }, { t: 'bet', amt: -5 }, { t: 'bet', amt: 1e12 }, { t: 'swap', a: 99, b: -1 }, { t: 'meld', cards: 'x' },
    { t: 'roll' }, { t: 'lock' }, { t: 'call' }, { t: 'raise' }, { t: 'show' }, { t: 'declare' }, { t: 'pack' }, { t: 'chaal' }, { t: 'see' }, { t: 'sideshow' }, { t: 'answer' },
    { t: 'wager', sym: 99, amt: 5 }, { t: 'wager', sym: 0, amt: -5 }, { t: 'arrange', order: [] }];
  if (mod.hiddenFor) for (const c of mod.hiddenFor(state, seat).slice(0, 3)) { out.push({ t: 'play', card: c }, { t: 'discard', card: c, cards: [c] }, { t: 'meld', cards: [c] }); }
  return [rng.pick(out), rng.pick(out)];
}

function runMatch(mod, nSeats, opts, seed, stat) {
  const rng = make(seed);
  const names = Array.from({ length: nSeats }, (_, i) => ({ name: 'P' + i, bot: true }));
  let prev = null, hand = 0, totalDelta = new Array(nSeats).fill(0);
  for (;;) {
    hand++;
    let s = mod.create({ seats: names, opts, rng, prev, hand });
    s.ev = s.ev || [];
    let lastPhase = s.phase;
    let steps = 0, lastActors = '', lastTk = s.tk;
    const shared = typeof mod.turnKey === 'function';   // game owns one shared clock (actors may shrink inside it)
    let lastWindow = shared ? String(mod.turnKey(s)) : '';
    while (!mod.over(s)) {
      if (++steps > STEP_CAP) throw new Error(`${mod.id}: stuck after ${STEP_CAP} steps (seed ${seed}) state=${JSON.stringify(s).slice(0, 900)}`);
      s.ev = [];
      const actors = mod.actors(s);
      const key = actors.join(',');
      if (!shared && key !== lastActors && s.tk === lastTk && lastActors !== '' && actors.length) throw new Error(`${mod.id}: actors changed ${lastActors} -> ${key} but tk did not (seed ${seed})`);
      if (shared) {
        const win = String(mod.turnKey(s));
        if (lastActors !== '' && lastWindow !== win && s.phase === 'bet' && key === '') throw new Error(`${mod.id}: window refreshed with nobody acting (seed ${seed})`);
        if (lastWindow !== win && lastActors !== '' && s.phase === lastPhase) throw new Error(`${mod.id}: window changed inside phase ${s.phase} (seed ${seed})`);
        if (lastActors !== '' && lastWindow === win && s.phase !== lastPhase) throw new Error(`${mod.id}: phase ${lastPhase} -> ${s.phase} kept the same clock window (seed ${seed})`);
        lastWindow = win; lastPhase = s.phase;
      }
      lastActors = key; lastTk = s.tk;
      // views must serialise, and must not leak other seats' hidden cards
      for (let seat = -1; seat < nSeats; seat++) {
        const v = JSON.stringify(mod.view(s, seat));
        if (mod.hiddenFor) for (const c of mod.hiddenFor(s, seat)) if (v.includes('"' + c + '"')) throw new Error(`${mod.id}: view for seat ${seat} leaks card ${c} (seed ${seed})`);
      }
      if (!actors.length) {
        const d = mod.tickDelay && mod.tickDelay(s);
        if (!d) throw new Error(`${mod.id}: no actors and no tickDelay in phase ${s.phase} (seed ${seed})`);
        mod.tick(s); continue;
      }
      // auto() must always be legal
      for (const seat of actors) {
        const c = clone(s); const a = mod.auto(c, seat);
        try { mod.act(c, seat, a); } catch (e) { throw new Error(`${mod.id}: auto() produced illegal action ${JSON.stringify(a)} -> ${e.message} (seed ${seed}) seat=${seat} state=${JSON.stringify(s).slice(0, 700)}`); }
      }
      // fuzz: illegal actions must be rejected with GameError and leave state untouched
      if (rng.chance(0.5)) {
        const seat = actors[0];
        for (const a of fuzzActions(mod, s, seat, rng)) {
          const before = JSON.stringify(s); const c = clone(s);
          try { mod.act(c, seat, a); /* accepted: fine if it was legal */ }
          catch (e) {
            if (!(e instanceof GameError)) throw new Error(`${mod.id}: non-GameError ${e.stack} for ${JSON.stringify(a)} (seed ${seed})`);
            if (JSON.stringify(s) !== before) throw new Error('state mutated by rejected action');
            const c2 = clone(s); try { mod.act(c2, seat, a); } catch (e2) { if (JSON.stringify(c2) !== before) throw new Error(`${mod.id}: rejected action ${JSON.stringify(a)} left partial mutation (seed ${seed})`); }
          }
        }
      }
      // wrong seat acting must be rejected by the room; here just drive bots
      const seat = actors.length > 1 && rng.chance(0.5) ? rng.pick(actors) : actors[0];
      const a = mod.bot(s, seat, rng);
      try { mod.act(s, seat, a); } catch (e) { throw new Error(`${mod.id}: bot produced illegal action ${JSON.stringify(a)} in phase ${s.phase}: ${e.message} (seed ${seed})\n${e.stack}`); }
    }
    const r = mod.result(s);
    if (!Array.isArray(r.deltas) || r.deltas.length !== nSeats) throw new Error(`${mod.id}: bad deltas ${JSON.stringify(r.deltas)}`);
    if (r.deltas.some((d) => !Number.isInteger(d))) throw new Error(`${mod.id}: non-integer delta ${JSON.stringify(r.deltas)} (seed ${seed})`);
    const sum = r.deltas.reduce((a, b) => a + b, 0);
    if (sum !== 0) throw new Error(`${mod.id}: deltas not zero-sum ${JSON.stringify(r.deltas)} (seed ${seed})`);
    r.deltas.forEach((d, i) => { totalDelta[i] += d; });
    stat.hands++; stat.steps += steps; stat.maxSteps = Math.max(stat.maxSteps, steps);
    if (mod.stats) mod.stats(s, stat);
    if (r.final || hand >= (mod.simHands || 1)) return;
    prev = s;
  }
}

let failed = 0;
for (const id of (only.length ? only : games.ORDER)) {
  const mod = games[id]; if (!mod) { console.log('skip', id); continue; }
  const stat = { hands: 0, steps: 0, maxSteps: 0 };
  const t0 = Date.now();
  try {
    const seatCounts = []; for (let n = mod.min; n <= mod.max; n++) seatCounts.push(n);
    const units = mod.units || [undefined];
    for (let i = 0; i < HANDS; i++) {
      const n = seatCounts[i % seatCounts.length];
      runMatch(mod, n, { unit: units[i % units.length] }, 1000 + i, stat);
    }
    console.log(`PASS ${id.padEnd(10)} ${stat.hands} hands, avg ${(stat.steps / stat.hands).toFixed(0)} steps, max ${stat.maxSteps}, ${Date.now() - t0}ms` + (stat.extra ? '  ' + JSON.stringify(stat.extra) : ''));
  } catch (e) { failed++; console.log(`FAIL ${id}: ${e.message}`); if (process.env.TRACE) console.log(e.stack); }
}
process.exit(failed ? 1 : 0);
