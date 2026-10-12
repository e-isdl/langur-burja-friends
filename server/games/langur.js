'use strict';
// Langur Burja: six dice, six symbols. Bet one symbol with a stake of 5/10/15.
// 2+ dice on your symbol wins (bonus scaled by matches x stake); 0-1 loses the stake.
// Server rolls the dice (authoritative); clients render the 3D bowl + settle grid.
// Zero-sum: winners split the losers' stakes plus any carried pot, pro-rata by
// (matches x stake). No winners: the whole pot carries to the next hand.
const { must } = require('../lib/util');

const STAKES = [5, 10, 15];
const NSYM = 6;
const bump = (s) => { s.tk++; };

function startRoll(s) {
  const rng = s.rng || require('../lib/rng').make();
  s.faces = Array.from({ length: 6 }, () => rng.int(NSYM));
  s.counts = [0, 0, 0, 0, 0, 0];
  s.faces.forEach((f) => { s.counts[f]++; });
  s.phase = 'roll';
  s.turn = -1;
  s.ev.push({ k: 'roll' });
  bump(s);
}

// Simultaneous betting: the round opens for 20s and everyone picks at once.
// The roll starts the moment every seat has bet (or sat out); stragglers are
// auto-bet by the room's timeout on that same shared clock.
function allPlaced(s) { return s.bets.every((b) => !!b); }
function startIfDone(s) { if (s.phase === 'bet' && allPlaced(s)) startRoll(s); }

function settleReveal(s) {
  const winners = [];
  s.order.forEach((seat) => {
    const b = s.bets[seat];
    if (!b || b.out) return;
    if (s.counts[b.sym] >= 2) winners.push(seat);
  });
  const sweepSeat = winners.length === 1 && s.counts[s.bets[winners[0]].sym] === 6 ? winners[0] : -1;
  s.verdict = { winners, counts: s.counts.slice(), sweep: sweepSeat, noContest: winners.length === 0 };
  s.phase = 'reveal';
  s.ev.push({ k: 'show' });
  bump(s);
}

module.exports = {
  id: 'langur', name: 'Langur Burja', min: 2, max: 8,
  blurb: 'Six dice, six symbols. Need 2+ of your symbol to win.',
  units: STAKES,
  rules: [
    'Everyone has 20 seconds to pick one symbol and a stake of 5, 10 or 15. Undo is allowed until the clock runs out.',
    'The server shakes six dice in the bowl and throws them. Wherever they land counts.',
    'KEY RULE: 1 match does NOT win. You need 2 or more dice on your symbol.',
    '2 matches pays 2x your stake, 3 pays 3x, up to 6 pays 6x. Scaled from the losing stakes, so big wins shrink when everyone wins.',
    '0 or 1 match: you lose your stake. Nobody wins: the whole pot carries to the next hand.',
  ],

  // Per-seat carry (like Kitti): unreturned stakes persist on the seat that
  // paid them, so every hand stays exactly zero-sum. Winners consume only
  // their own row; sitters keep theirs for the next hand.
  create({ seats, opts, rng, prev }) {
    const n = seats.length;
    const unit = STAKES.includes(+opts.unit) ? +opts.unit : 10;
    const dealer = prev && Number.isInteger(prev.dealer) ? (prev.dealer + 1) % n : rng.int(n);
    const order = Array.from({ length: n }, (_, k) => (dealer + 1 + k) % n);
    const carry = prev && Array.isArray(prev.nextCarry) && prev.nextCarry.length === n
      ? prev.nextCarry.map((c) => (Number.isInteger(c) && c > 0 ? c : 0))
      : new Array(n).fill(0);
  const s = {
    n, unit, dealer, order, idx: 0, turn: -1,
      bets: new Array(n).fill(null), faces: null, counts: null, verdict: null,
      carry, pot: carry.reduce((a, b) => a + b, 0), nextCarry: null, phase: 'bet', tk: 1, ev: [{ k: 'ante' }],
    };
    Object.defineProperty(s, 'rng', { value: rng, enumerable: false, writable: true });
    return s;
  },

  // Total chips a seat has in this hand's pot: carried + current stake.
  contrib(s, seat) {
    const b = s.bets[seat];
    return s.carry[seat] + (b && !b.out ? b.stake : 0);
  },

  actors(s) {
    if (s.phase !== 'bet') return [];
    const out = [];
    for (let i = 0; i < s.n; i++) if (!s.bets[i]) out.push(i);
    return out;
  },
  turnMs() { return 20000; },                                  // one shared 20s betting window
  turnKey(s) { return s.phase === 'bet' ? 'bet' : s.phase + ':' + s.tk; },   // deadline never resets on a bet
  tickDelay(s) {
    if (s.phase === 'roll') return 7000;    // bowl shake + throw + tumble + settle on clients
    if (s.phase === 'reveal') return 3500;
    return 0;
  },
  over(s) { return s.phase === 'over'; },
  // Simultaneous betting: let bots settle in over a second or two instead of
  // locking their picks instantly, so the table reads what everyone is doing.
  botThink(s, seat, rng) { return 3000 + (rng ? rng.int(3000) : 1500); },
  hiddenFor() { return []; },                 // views mask other seats' picks during betting

  view(s, seat) {
    const open = s.phase !== 'bet';
    const bets = s.bets.map((b, i) => {
      if (!b) return null;
      if (i === seat || open) return b;
      return b.out ? { out: true } : { placed: true };   // hide other picks while betting
    });
    const mine = seat >= 0 && s.phase === 'bet' && !s.bets[seat];
    return {
      n: s.n, phase: s.phase, unit: s.unit, stakes: STAKES.slice(),
      pot: s.pot, carry: s.carry.reduce((a, b) => a + b, 0), turn: s.turn, idx: s.idx,
      placed: s.bets.filter((b) => !!b).length,
      bets, me: seat >= 0 ? s.bets[seat] : null,
      faces: open && s.phase !== 'roll' ? s.faces : null,
      counts: open && s.phase !== 'roll' ? s.counts : null,
      verdict: s.phase === 'reveal' || s.phase === 'over' ? s.verdict : null,
      canBet: mine, canSit: mine,
      symNames: ['Jhandi', 'Burja', 'Itta', 'Hukum', 'Chidi', 'Paan'],
    };
  },

  act(s, seat, a) {
    must(s.phase === 'bet', 'Betting is over');
    must(a && typeof a.t === 'string', 'Bet a symbol or sit out');
    if (a.t === 'undo') {
      const b = s.bets[seat];
      must(b, 'You have not bet yet');
      if (!b.out) s.pot -= b.stake;
      s.bets[seat] = null;
      s.ev.push({ k: 'undo', seat });
      return;
    }
    must(!s.bets[seat], 'You already bet. Undo it first.');
    if (a.t === 'sit') {
      s.bets[seat] = { out: true };
      s.ev.push({ k: 'pack', seat });
      startIfDone(s);
      return;
    }
    must(a.t === 'bet', 'Bet a symbol or sit out');
    must(Number.isInteger(a.sym) && a.sym >= 0 && a.sym < NSYM, 'Pick one of the 6 symbols');
    must(STAKES.includes(a.stake), 'Stake must be 5, 10 or 15');
    s.bets[seat] = { sym: a.sym, stake: a.stake };
    s.pot += a.stake;
    s.ev.push({ k: 'bet', seat, amt: a.stake });
    startIfDone(s);
  },
  // Undo arrives off-actor: you already hold a bet, so you are not in actors().
  offTurn(s, seat, a) {
    return s.phase === 'bet' && !!a && a.t === 'undo' && !!s.bets[seat];
  },

  tick(s) {
    if (s.phase === 'roll') { settleReveal(s); return; }
    if (s.phase === 'reveal') { s.phase = 'over'; bump(s); return; }
  },

  bot(s, seat, rng) {
    const r = rng || s.rng;
    if (r && r.chance(0.07)) return { t: 'sit' };
    const sym = r ? r.int(NSYM) : (seat * 2 + s.idx) % NSYM;
    const stake = r ? r.pick(STAKES) : STAKES[0];
    return { t: 'bet', sym, stake };
  },
  auto(s, seat) {
    // Timeout fallback: a modest bet so the table keeps moving.
    const r = s.rng;
    if (r) return { t: 'bet', sym: r.int(NSYM), stake: STAKES[0] };
    return { t: 'bet', sym: seat % NSYM, stake: STAKES[0] };
  },

  result(s) {
    const n = s.n;
    // Per-seat contribution: carried chips + this hand's stake.
    const contrib = Array.from({ length: n }, (_, seat) =>
      s.carry[seat] + (s.bets[seat] && !s.bets[seat].out ? s.bets[seat].stake : 0));
    const pot = contrib.reduce((a, b) => a + b, 0);
    const summary = { faces: s.faces, counts: s.counts, verdict: s.verdict, pot, carried: false };
    if (!s.verdict || !s.verdict.winners.length) {
      // Nobody wins (or everybody sat out): every seat's chips carry, nobody pays.
      s.nextCarry = contrib.slice();
      return { deltas: new Array(n).fill(0), summary: Object.assign(summary, { carried: true, carry: pot }), final: false };
    }
    const w = s.verdict.winners;
    const wSet = new Set(w);
    // Winners consume their own rows; sitters keep theirs for next hand.
    // Bonus pool = losing bettors' rows only, so deltas always sum to zero.
    const nextCarry = new Array(n).fill(0);
    const losersPool = contrib.reduce((sum, c, seat) =>
      (!wSet.has(seat) && s.bets[seat] && !s.bets[seat].out) ? sum + c : sum, 0);
    for (let seat = 0; seat < n; seat++) {
      if (!wSet.has(seat) && (!s.bets[seat] || s.bets[seat].out)) nextCarry[seat] = contrib[seat];
    }
    const weights = w.map((seat) => s.counts[s.bets[seat].sym] * s.bets[seat].stake);
    const wTotal = weights.reduce((a, b) => a + b, 0);
    const bonus = new Array(w.length).fill(0);
    if (wTotal > 0 && losersPool > 0) {
      let given = 0;
      const order = w.map((_, k) => k).sort((x, y) => weights[y] - weights[x]);
      order.forEach((k, rank) => {
        const share = rank === order.length - 1
          ? losersPool - given
          : Math.floor((losersPool * weights[k]) / wTotal);
        bonus[k] = share;
        given += share;
      });
    }
    const deltas = new Array(n).fill(0);
    for (let seat = 0; seat < n; seat++) {
      const k = w.indexOf(seat);
      if (k >= 0) deltas[seat] = bonus[k];
      else if (s.bets[seat] && !s.bets[seat].out) deltas[seat] = -contrib[seat];
    }
    s.nextCarry = nextCarry;
    return { deltas, summary, final: false };
  },
  resultMs() { return 14000; },
};
