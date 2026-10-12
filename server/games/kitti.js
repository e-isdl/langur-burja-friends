'use strict';
// Kitti: nine cards arranged into three brags. Win two brags in a row (1+2 or 2+3). No winner: pot carries.
const { newDeck, rankOf } = require('../lib/cards');
const { evalBrag } = require('../lib/brag');
const { must } = require('../lib/util');

const bump = (s) => { s.tk++; };
const rows = (h) => [h.slice(0, 3), h.slice(3, 6), h.slice(6, 9)];
const val = (row) => evalBrag(row, { kitti: true });

function rankCounts(h) { const c = {}; h.forEach((id) => { c[id[0]] = (c[id[0]] || 0) + 1; }); return c; }
const fourKind = (h) => Object.values(rankCounts(h)).some((n) => n >= 4);
const fourPairs = (h) => Object.values(rankCounts(h)).reduce((a, n) => a + Math.floor(n / 2), 0) >= 4;

// Best arrangement: brag 2 is in every winning pair, so it matters most.
function bestArrangement(h) {
  let best = null, bestScore = -1;
  const idx = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  for (let a = 0; a < 9; a++) for (let b = a + 1; b < 9; b++) for (let c = b + 1; c < 9; c++) {
    const r0 = [h[a], h[b], h[c]]; const rest = idx.filter((i) => i !== a && i !== b && i !== c);
    for (let d = 0; d < 6; d++) for (let e = d + 1; e < 6; e++) for (let f = e + 1; f < 6; f++) {
      const r1 = [h[rest[d]], h[rest[e]], h[rest[f]]]; const r2 = rest.filter((_, k) => k !== d && k !== e && k !== f).map((i) => h[i]);
      const v0 = val(r0).val / 1e6, v1 = val(r1).val / 1e6, v2 = val(r2).val / 1e6;
      const score = 3 * v1 + 2 * Math.max(v0, v2) + 0.6 * Math.min(v0, v2);
      if (score > bestScore) { bestScore = score; best = [...r0, ...r1, ...r2]; }
    }
  }
  return best;
}

function dealAll(rng, n) {
  for (let tries = 0; ; tries++) {
    const d = rng.shuffle(newDeck());
    const hands = Array.from({ length: n }, (_, i) => d.slice(i * 9, i * 9 + 9));
    if (tries >= 3 || !hands.some(fourPairs)) return { hands, redeals: tries };
  }
}

function settle(s) {
  const n = s.n; const V = [0, 1, 2].map((j) => s.hands.map((h) => val(rows(h)[j]).val));
  const best = V.map((col) => Math.max(...col));
  const wins = s.hands.map((_, i) => [0, 1, 2].map((j) => V[j][i] === best[j]));
  const winners = [];
  wins.forEach((w, i) => { if ((w[0] && w[1]) || (w[1] && w[2])) winners.push(i); });
  s.verdict = { wins, winners, sweep: winners.length === 1 && wins[winners[0]].every(Boolean), instant: null };
  s.phase = 'over'; bump(s);
}

module.exports = {
  id: 'kitti', name: 'Kitti', min: 2, max: 5,
  blurb: 'Nine cards, three brags. Win two in a row.',
  units: [5, 10, 20, 50],
  rules: [
    'Everyone antes the boot and gets nine cards. Arrange them into three brags of three cards. You have 45 seconds.',
    'Brags are compared row against row: everyone\'s Brag 1 against Brag 1, and so on.',
    'To win the pot you must win two brags in a row: 1 and 2, or 2 and 3. Winning 1 and 3 is not enough. Brag 2 is in every winning pair, so guard it.',
    'Best brag: Kitti (2 3 5 of mixed suits), Trail, Pure sequence, Sequence, Color, Pair, High card.',
    'Nobody wins? The pot carries into the next hand and grows. Win all three brags alone for a salaami bonus from every player.',
    'Four of a kind in your nine cards wins the pot on the spot. Four pairs forces a redeal.',
  ],

  create({ seats, opts, rng, prev }) {
    const n = seats.length; const unit = [5, 10, 20, 50].includes(+opts.unit) ? +opts.unit : 10;
    const { hands, redeals } = dealAll(rng, n);
    const carry = prev && prev.nextCarry ? prev.nextCarry.slice() : new Array(n).fill(0);
    const s = { n, unit, dealer: prev ? (prev.dealer + 1) % n : rng.int(n), hands, locked: new Array(n).fill(false), carry, contrib: carry.map((c) => c + unit), phase: 'arrange', verdict: null, nextCarry: null, redeals, tk: 1, ev: [{ k: 'deal' }] };
    const inst = hands.map((h, i) => (fourKind(h) ? i : -1)).filter((i) => i >= 0);
    if (inst.length) {                                                       // instant win: highest rank of four
      const rk = (i) => Math.max(...Object.entries(rankCounts(hands[i])).filter(([, c]) => c >= 4).map(([r]) => 'AKQJT98765432'.length - 'AKQJT98765432'.indexOf(r)));
      const w = inst.sort((a, b) => rk(b) - rk(a))[0];
      s.verdict = { wins: hands.map(() => [false, false, false]), winners: [w], sweep: false, instant: w }; s.phase = 'over';
    }
    return s;
  },

  actors(s) { return s.phase === 'arrange' ? s.locked.map((l, i) => (l ? -1 : i)).filter((i) => i >= 0) : []; },
  turnMs() { return 45000; },
  over(s) { return s.phase === 'over'; },
  hiddenFor(s, seat) { return s.phase === 'over' ? [] : s.hands.flatMap((h, i) => (i === seat ? [] : h)); },

  view(s, seat) {
    const over = s.phase === 'over';
    const mine = seat >= 0 ? s.hands[seat] : null;
    const pot = s.contrib.reduce((a, b) => a + b, 0);
    return {
      n: s.n, phase: s.phase, unit: s.unit, pot, carry: s.carry.reduce((a, b) => a + b, 0), locked: s.locked, redeals: s.redeals,
      me: mine ? { rows: rows(mine), labels: rows(mine).map((r) => val(r).name) } : null,
      all: over ? s.hands.map((h) => ({ rows: rows(h), labels: rows(h).map((r) => val(r).name) })) : null,
      verdict: over ? s.verdict : null,
    };
  },

  act(s, seat, a) {
    must(s.phase === 'arrange', 'Arranging is over');
    const h = s.hands[seat];
    switch (a.t) {
      case 'swap': {
        must(!s.locked[seat], 'Unlock to rearrange');
        must(Number.isInteger(a.a) && Number.isInteger(a.b) && a.a >= 0 && a.a < 9 && a.b >= 0 && a.b < 9, 'Pick two of your cards');
        [h[a.a], h[a.b]] = [h[a.b], h[a.a]]; s.ev.push({ k: 'play' }); return;
      }
      case 'auto': { must(!s.locked[seat], 'Unlock first'); s.hands[seat] = bestArrangement(h); s.ev.push({ k: 'shuffle' }); return; }
      case 'autolock': { if (!s.locked[seat]) s.hands[seat] = bestArrangement(h); s.locked[seat] = true; break; }
      case 'lock': { s.locked[seat] = true; s.ev.push({ k: 'lock', seat }); break; }
      case 'unlock': { must(s.locked[seat], 'Not locked'); s.locked[seat] = false; return; }
      default: throw new (require('../lib/util').GameError)('Unknown move');
    }
    if (s.locked.every(Boolean)) settle(s); else bump(s);
  },
  bot(s, seat) { return { t: 'autolock' }; },
  auto(s, seat) { return { t: 'autolock' }; },

  result(s) {
    const n = s.n; const pot = s.contrib.reduce((a, b) => a + b, 0); const w = s.verdict.winners;
    const summary = { verdict: s.verdict, pot, hands: s.hands.map((h) => ({ rows: rows(h), labels: rows(h).map((r) => val(r).name) })), carried: false };
    if (!w.length) { s.nextCarry = s.contrib.slice(); return { deltas: new Array(n).fill(0), summary: Object.assign(summary, { carried: true }), final: false }; }
    const deltas = s.contrib.map((c) => -c);
    const share = Math.floor(pot / w.length); let rem = pot - share * w.length;
    w.forEach((i) => { deltas[i] += share + (rem-- > 0 ? 1 : 0); });
    if (s.verdict.sweep) { const bonus = Math.max(1, Math.floor(s.unit / 2)); for (let i = 0; i < n; i++) if (i !== w[0]) { deltas[i] -= bonus; deltas[w[0]] += bonus; } summary.salaami = bonus; }
    s.nextCarry = null;
    return { deltas, summary, final: false };
  },
  resultMs(s) { return 12000; },
};
