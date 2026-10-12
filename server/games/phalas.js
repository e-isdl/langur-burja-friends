'use strict';
// Phalas (Dhumbal): five cards, dump same-rank sets, keep your total low, call Show when you think you are lowest.
const { newDeck, rankOf } = require('../lib/cards');
const { must, GameError } = require('../lib/util');

const bump = (s) => { s.tk++; };
const pts = (id) => { const r = rankOf(id); return r === 12 ? 1 : r >= 9 ? 10 : r + 2; };   // A=1, 2-10 face, J Q K = 10
const total = (h) => h.reduce((a, c) => a + pts(c), 0);
const sortHand = (h) => h.slice().sort((a, b) => rankOf(a) - rankOf(b));

function startTurn(s, seat) { s.turn = seat; s.stage = 'discard'; s.take = s.pile.length ? s.pile[s.pile.length - 1].slice() : []; bump(s); }
function nextSeat(s) { return (s.turn + 1) % s.n; }
function refill(s) { return s.stock.length > 0; }             // deck empty ends the hand: lowest total wins
function finishShow(s, caller) {
  const tots = s.hands.map(total); s.totals = tots;
  const others = tots.map((t, i) => (i === caller ? Infinity : t)); const minOther = Math.min(...others);
  s.caller = caller;
  if (caller >= 0 && tots[caller] < minOther) { s.outcome = 'won'; s.winners = [caller]; }
  else if (caller >= 0) { s.outcome = 'caught'; s.winners = others.map((t, i) => (t === minOther ? i : -1)).filter((i) => i >= 0); }
  else { const m = Math.min(...tots); s.outcome = 'stock'; s.winners = tots.map((t, i) => (t === m ? i : -1)).filter((i) => i >= 0); }
  s.phase = 'over'; s.turn = -1; bump(s);
}

module.exports = {
  id: 'phalas', name: 'Phalas', min: 2, max: 6,
  blurb: 'Dump sets, stay low, call Show. Dhumbal rules.',
  units: [5, 10, 20, 50],
  rules: [
    'Five cards each. Ace is 1, 2 to 10 are face value, Jack Queen King are 10. Lowest total wins.',
    'On your turn discard one card, or several cards of the same rank together. Then draw: the top card of the deck, or one card from the set the previous player just discarded.',
    'Think you are lowest? Call Show at the start of your turn, before you discard. Everyone reveals.',
    'Strictly lowest: you win one unit from every other player. Anyone tied or lower catches you: you pay that unit times the number of opponents to the lowest hand.',
    'If the deck runs dry the lowest hand wins a unit from each player.',
  ],

  create({ seats, opts, rng, prev }) {
    const n = seats.length; const unit = [5, 10, 20, 50].includes(+opts.unit) ? +opts.unit : 10;
    const d = rng.shuffle(newDeck());
    const hands = Array.from({ length: n }, (_, i) => sortHand(d.slice(i * 5, i * 5 + 5)));
    const stock = d.slice(n * 5); const first = stock.pop();
    const dealer = prev ? (prev.dealer + 1) % n : rng.int(n);
    const s = { n, unit, dealer, hands, stock, pile: [[first]], turn: 0, stage: 'discard', take: [], phase: 'turn', caller: -1, totals: null, outcome: null, winners: [], tk: 0, ev: [{ k: 'deal' }] };
    Object.defineProperty(s, 'rng', { value: rng, enumerable: false, writable: true });
    startTurn(s, (dealer + 1) % n); return s;
  },

  actors(s) { return s.phase === 'turn' ? [s.turn] : []; },
  turnMs() { return 40000; },
  over(s) { return s.phase === 'over'; },
  hiddenFor(s, seat) { return s.phase === 'over' ? [] : s.hands.flatMap((h, i) => (i === seat ? [] : h)); },

  view(s, seat) {
    const over = s.phase === 'over'; const mine = seat >= 0 && s.turn === seat && s.phase === 'turn';
    return {
      n: s.n, phase: s.phase, unit: s.unit, turn: s.turn, stage: s.stage, stock: s.stock.length, pile: s.pile[s.pile.length - 1] || [], pileCount: s.pile.flat().length,
      take: mine && s.stage === 'draw' ? s.take : [], hand: seat >= 0 ? s.hands[seat] : [], total: seat >= 0 ? total(s.hands[seat]) : null,
      counts: s.hands.map((h) => h.length), canShow: mine && s.stage === 'discard',
      reveal: over ? s.hands.map((h, i) => ({ hand: h, total: s.totals[i] })) : null, caller: s.caller, outcome: s.outcome, winners: s.winners,
    };
  },

  act(s, seat, a) {
    must(s.phase === 'turn', 'Hand is over');
    const h = s.hands[seat];
    if (s.stage === 'discard') {
      if (a.t === 'show') { s.ev.push({ k: 'show', seat }); return finishShow(s, seat); }
      must(a.t === 'discard' && Array.isArray(a.cards) && a.cards.length >= 1 && a.cards.length <= 5, 'Discard one card, or a set of the same rank');
      must(new Set(a.cards).size === a.cards.length, 'Pick each card once');
      must(a.cards.every((c) => typeof c === 'string' && h.includes(c)), 'You do not hold those cards');
      must(a.cards.every((c) => c[0] === a.cards[0][0]), 'A set must be the same rank');
      a.cards.forEach((c) => h.splice(h.indexOf(c), 1));
      s.pile.push(a.cards.slice()); s.stage = 'draw'; s.ev.push({ k: 'discard', seat, n: a.cards.length }); bump(s); return;
    }
    must(a.t === 'draw', 'Draw a card');
    if (a.from === 'pile') {
      must(typeof a.card === 'string' && s.take.includes(a.card), 'Take one card from the set just discarded');
      const grp = s.pile[s.pile.length - 2]; grp.splice(grp.indexOf(a.card), 1); if (!grp.length) s.pile.splice(s.pile.length - 2, 1);
      h.push(a.card);
    } else {
      must(a.from === 'stock', 'Draw from the deck or the pile');
      if (!refill(s)) { s.ev.push({ k: 'draw', seat }); return finishShow(s, -1); }
      h.push(s.stock.pop());
    }
    s.hands[seat] = sortHand(h); s.ev.push({ k: 'draw', seat });
    startTurn(s, nextSeat(s));
  },

  bot(s, seat, rng) {
    const h = s.hands[seat];
    if (s.stage === 'discard') {
      const t = total(h);
      const oppEst = Math.min(...s.hands.map((x, i) => (i === seat ? 99 : x.length * 4.6)));
      if (t <= 6 || (t <= 10 && t + 3 < oppEst && rng.chance(0.75)) || (t <= 14 && t + 6 < oppEst && rng.chance(0.3))) return { t: 'show' };
      const by = {}; h.forEach((c) => { (by[c[0]] = by[c[0]] || []).push(c); });
      let best = null, bv = -1;
      for (const g of Object.values(by)) { const v = g.length * pts(g[0]); if (v > bv || (v === bv && best && g.length > best.length)) { bv = v; best = g; } }
      return { t: 'discard', cards: best };
    }
    const top = s.take;
    if (top.length) {
      const cand = top.slice().sort((a, b) => pts(a) - pts(b))[0];
      const hi = Math.max(...h.map(pts)); const matches = h.some((c) => c[0] === cand[0]);
      if (pts(cand) <= 3 || (matches && pts(cand) < hi) || (pts(cand) < hi - 4)) return { t: 'draw', from: 'pile', card: cand };
    }
    return { t: 'draw', from: 'stock' };
  },
  auto(s, seat) {
    if (s.stage === 'discard') { const h = s.hands[seat]; const c = h.slice().sort((a, b) => pts(b) - pts(a))[0]; return { t: 'discard', cards: [c] }; }
    return { t: 'draw', from: 'stock' };
  },

  result(s) {
    const n = s.n; const u = s.unit; const deltas = new Array(n).fill(0);
    if (s.outcome === 'won') { deltas[s.caller] += u * (n - 1); for (let i = 0; i < n; i++) if (i !== s.caller) deltas[i] -= u; }
    else if (s.outcome === 'caught') { const pay = u * (n - 1); deltas[s.caller] -= pay; const w = s.winners; const share = Math.floor(pay / w.length); let rem = pay - share * w.length; w.forEach((i) => { deltas[i] += share + (rem-- > 0 ? 1 : 0); }); }
    else {
      const w = s.winners; const pot = u * (n - w.length); const share = Math.floor(pot / w.length); let rem = pot - share * w.length;
      for (let i = 0; i < n; i++) { if (w.includes(i)) deltas[i] += share + (rem-- > 0 ? 1 : 0); else deltas[i] -= u; }
    }
    return { deltas, summary: { outcome: s.outcome, caller: s.caller, winners: s.winners, totals: s.totals, reveal: s.hands.map((h, i) => ({ hand: h, total: s.totals[i] })) }, final: false };
  },
  resultMs() { return 9000; },
};
