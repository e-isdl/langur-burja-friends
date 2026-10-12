'use strict';
// In-Between (Acey-Deucey): two cards are dealt, bet that the third lands strictly between them.
const { newDeck, rankOf } = require('../lib/cards');
const { must } = require('../lib/util');

const bump = (s) => { s.tk++; };
const rv = (id) => rankOf(id) + 2;                       // 2..14 (Ace high by default)

function startTurn(s) {
  if (s.deck.length < 8) s.deck = shuffleFresh(s);
  const seat = s.order[s.idx];
  const a = s.deck.pop(), b = s.deck.pop();
  s.cards = [a, b].sort((x, y) => rankOf(x) - rankOf(y));
  s.third = null; s.res = null; s.ace = null; s.side = null; s.turn = seat;
  const [lo, hi] = [rankOf(s.cards[0]), rankOf(s.cards[1])];
  if (lo === hi) s.phase = 'bet';                         // a pair: bet higher or lower
  else if (s.cards.some((c) => c[0] === 'A')) s.phase = 'ace';
  else if (hi - lo === 1) { s.phase = 'reveal'; s.res = { kind: 'nogap' }; }
  else s.phase = 'bet';
  s.ev.push({ k: 'deal' });
  bump(s);
}
function shuffleFresh(s) { return (s.rng || require('../lib/rng').make()).shuffle(newDeck()); }

function bounds(s) {                                       // effective low/high after ace choice
  const [a, b] = s.cards.map(rv);
  let lo = Math.min(a, b), hi = Math.max(a, b);
  if (s.ace) { const ai = s.cards.findIndex((c) => c[0] === 'A'); const other = rv(s.cards[1 - ai]); const av = s.ace === 'lo' ? 1 : 14; lo = Math.min(av, other); hi = Math.max(av, other); }
  return { lo, hi };
}
function odds(s) {
  const { lo, hi } = bounds(s); const seen = s.cards;
  const unseen = 52 - 2; const between = (hi - lo - 1) * 4;
  const isPair = lo === hi;
  if (isPair) { const above = (14 - hi) * 4, below = (lo - 2) * 4; return { pair: true, hi: above / unseen, lo: below / unseen, post: 2 / unseen }; }
  return { pair: false, win: Math.max(0, between) / unseen, post: 6 / unseen, gap: hi - lo - 1 };
}

module.exports = {
  id: 'inbetween', name: 'In-Between', min: 2, max: 8,
  blurb: 'Two cards, one gap. Bet the third lands between.',
  units: [5, 10, 20, 50],
  rules: [
    'Everyone antes into the pot. On your turn two cards are dealt face up.',
    'Bet any amount up to the pot that the third card lands strictly between them, or pass.',
    'Win: you take your bet from the pot. Miss: your bet goes into the pot. Hit a post (same rank as either card) and you pay double.',
    'Two of a kind: bet the third is higher or lower. Three of a kind costs you double.',
    'An Ace can be low or high. You choose before betting. Cards one rank apart leave no gap, so your turn passes.',
    'The hand ends when everyone has had a turn or the pot is empty. Whatever is left in the pot is split back evenly.',
  ],

  create({ seats, opts, rng, prev }) {
    const n = seats.length; const unit = [5, 10, 20, 50].includes(+opts.unit) ? +opts.unit : 10;
    const dealer = prev ? (prev.dealer + 1) % n : rng.int(n);
    const order = Array.from({ length: n }, (_, k) => (dealer + 1 + k) % n);
    const s = { n, unit, dealer, order, idx: 0, pot: unit * n, net: new Array(n).fill(-unit), deck: rng.shuffle(newDeck()), cards: [], third: null, res: null, ace: null, side: null, phase: 'bet', turn: order[0], log: [], tk: 1, ev: [] };
    Object.defineProperty(s, 'rng', { value: rng, enumerable: false, writable: true });
    startTurn(s); return s;
  },

  actors(s) { return s.phase === 'bet' || s.phase === 'ace' ? [s.turn] : []; },
  turnMs() { return 30000; },
  tickDelay(s) { return s.phase === 'reveal' ? (s.res && s.res.kind === 'nogap' ? 1700 : 2300) : 0; },
  over(s) { return s.phase === 'over'; },
  hiddenFor() { return []; },

  view(s, seat) {
    const mine = seat >= 0 && s.turn === seat && (s.phase === 'bet' || s.phase === 'ace');
    return { n: s.n, phase: s.phase, unit: s.unit, pot: s.pot, turn: s.turn, cards: s.cards, third: s.third, res: s.res, ace: s.ace, order: s.order, idx: s.idx, net: s.net,
      odds: mine && s.phase === 'bet' ? odds(s) : null, canBet: mine && s.phase === 'bet', canAce: mine && s.phase === 'ace' };
  },

  act(s, seat, a) {
    if (s.phase === 'ace') {
      must(a.t === 'ace' && (a.v === 'lo' || a.v === 'hi'), 'Choose the Ace high or low');
      s.ace = a.v; s.phase = 'bet'; bump(s); return;
    }
    must(s.phase === 'bet' && a.t === 'bet' && Number.isInteger(a.amt), 'Place a bet or pass');
    must(a.amt >= 0 && a.amt <= s.pot, 'Bet between 0 and the pot');
    const { lo, hi } = bounds(s); const pair = lo === hi;
    if (a.amt > 0 && pair) must(a.side === 'hi' || a.side === 'lo', 'Higher or lower?');
    if (a.amt === 0) { s.res = { kind: 'pass', amt: 0 }; s.phase = 'reveal'; bump(s); return; }
    s.third = s.deck.pop(); const t = rv(s.third); const amt = a.amt;
    let kind, delta;
    if (pair) {
      if (t === lo) { kind = 'post'; delta = -2 * amt; }
      else if ((a.side === 'hi' && t > hi) || (a.side === 'lo' && t < lo)) { kind = 'win'; delta = amt; }
      else { kind = 'lose'; delta = -amt; }
    } else if (t > lo && t < hi) { kind = 'win'; delta = amt; }
    else if (t === lo || t === hi) { kind = 'post'; delta = -2 * amt; }
    else { kind = 'lose'; delta = -amt; }
    s.net[seat] += delta; s.pot -= delta;                  // winning drains the pot, losing feeds it
    s.res = { kind, amt, delta, side: a.side || null };
    s.ev.push({ k: kind === 'win' ? 'win' : 'bet', seat, amt }); s.phase = 'reveal'; bump(s);
  },

  tick(s) {
    if (s.phase !== 'reveal') return;
    s.idx++;
    if (s.pot <= 0 || s.idx >= s.order.length) { s.phase = 'over'; s.turn = -1; s.third = s.third; bump(s); return; }
    startTurn(s);
  },

  bot(s, seat, rng) {
    if (s.phase === 'ace') { const o = s.cards[0][0] === 'A' ? rv(s.cards[1]) : rv(s.cards[0]); return { t: 'ace', v: o <= 7 ? 'hi' : 'lo' }; }
    const od = odds(s); const unit = s.unit;
    if (od.pair) { const side = od.hi >= od.lo ? 'hi' : 'lo'; const p = Math.max(od.hi, od.lo); const ev = 2 * p - 1 - od.post; return ev > 0.05 ? { t: 'bet', amt: Math.max(1, Math.min(s.pot, Math.round(s.pot * 0.3))), side } : { t: 'bet', amt: 0 }; }
    const ev = 2 * od.win - 1 - od.post;
    if (ev > 0.04) { const frac = Math.min(0.9, 0.25 + ev * 1.6); return { t: 'bet', amt: Math.max(1, Math.min(s.pot, Math.round(s.pot * frac / unit) * unit || 1)) }; }
    if (ev > -0.1 && rng.chance(0.2)) return { t: 'bet', amt: Math.max(1, Math.min(s.pot, unit)) };
    return { t: 'bet', amt: 0 };
  },
  auto(s) { return s.phase === 'ace' ? { t: 'ace', v: 'hi' } : { t: 'bet', amt: 0 }; },

  result(s) {
    const n = s.n; const deltas = s.net.slice();
    const share = Math.floor(s.pot / n); let rem = s.pot - share * n;
    for (let i = 0; i < n; i++) deltas[i] += share + (rem-- > 0 ? 1 : 0);
    return { deltas, summary: { pot: s.pot }, final: false };
  },
  resultMs() { return 7000; },
};
