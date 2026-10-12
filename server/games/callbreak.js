'use strict';
// Call Break: 4 players, spades are trump, bid the tricks you will take, 5 rounds.
const { newDeck, rankOf, suitOf } = require('../lib/cards');
const { GameError, must } = require('../lib/util');

const ROUNDS = 5;
const SUIT_ORDER = 'SHCD';
const val = (id) => rankOf(id);
const bump = (s) => { s.tk++; };

function sortHand(h) {
  return h.slice().sort((a, b) => SUIT_ORDER.indexOf(suitOf(a)) - SUIT_ORDER.indexOf(suitOf(b)) || val(b) - val(a));
}
function deal(rng) {
  for (;;) {
    const d = rng.shuffle(newDeck());
    const hands = [0, 1, 2, 3].map((i) => d.slice(i * 13, i * 13 + 13));
    if (hands.every((h) => h.some((c) => suitOf(c) === 'S'))) return { hands: hands.map(sortHand), redeals: 0 };
  }
}

// Which trick card currently wins?
function winnerOf(trick) {
  const led = suitOf(trick[0].card);
  let best = trick[0];
  for (const t of trick.slice(1)) {
    const a = suitOf(t.card), b = suitOf(best.card);
    if (a === 'S' && b !== 'S') best = t;
    else if (a === b && val(t.card) > val(best.card)) best = t;
  }
  return best.seat;
}

function legalCards(hand, trick) {
  if (!trick.length) return hand.slice();
  const led = suitOf(trick[0].card);
  const cur = trick.find((t) => t.seat === winnerOf(trick)).card;
  const ofLed = hand.filter((c) => suitOf(c) === led);
  const spades = hand.filter((c) => suitOf(c) === 'S');
  if (ofLed.length) {
    if (suitOf(cur) === led) { const higher = ofLed.filter((c) => val(c) > val(cur)); return higher.length ? higher : ofLed; }
    return ofLed;                      // a spade already cut this trick; any card of the led suit is fine
  }
  if (spades.length) {
    if (suitOf(cur) === 'S') { const higher = spades.filter((c) => val(c) > val(cur)); return higher.length ? higher : spades; }
    return spades;
  }
  return hand.slice();
}

function scoreOf(bid, won) { return won >= bid ? bid * 10 + (won - bid) : -bid * 10; }   // tenths
const totalsOf = (s) => [0, 1, 2, 3].map((i) => s.scores.reduce((a, r) => a + r[i], 0));

function estimateBid(hand, rng) {
  const by = { S: [], H: [], D: [], C: [] };
  hand.forEach((c) => by[suitOf(c)].push(val(c)));
  let est = 0;
  const sp = by.S.slice().sort((a, b) => b - a);
  for (const r of sp) { if (r === 12) est += 1; else if (r === 11 && sp.length >= 2) est += 0.9; else if (r === 10 && sp.length >= 3) est += 0.7; else if (r === 9 && sp.length >= 4) est += 0.5; }
  if (sp.length > 4) est += (sp.length - 4) * 0.8;
  for (const s of 'HDC') {
    const r = by[s].slice().sort((a, b) => b - a);
    if (r[0] === 12) est += 1;
    if (r.includes(11) && r.length >= 2) est += r[0] === 12 ? 0.9 : 0.55;
    if (r.includes(10) && r.length >= 3 && r.includes(11)) est += 0.3;
    if (sp.length >= 3) { if (r.length === 0) est += 0.8; else if (r.length === 1 && r[0] < 12) est += 0.4; }
  }
  let b = Math.round(est * 1.2 + 0.3);
  if (rng && rng.chance(0.15)) b += rng.chance(0.5) ? 1 : -1;
  return Math.max(1, Math.min(8, b));
}

module.exports = {
  id: 'callbreak',
  name: 'Call Break',
  min: 4, max: 4,
  blurb: 'Bid your tricks, spades trump. Four players, five rounds.',
  units: [1, 5, 10, 20],
  rules: [
    'Four players, 13 cards each. Spades are always trump.',
    'Bid how many tricks you will win (1 to 13). Then play 13 tricks.',
    'You must follow the suit led. If you cannot, you must play a spade. You must play a higher card than the current winner whenever you can.',
    'Make your bid or more: you score the bid plus 0.1 for each extra trick. Miss it: you lose the bid.',
    'After five rounds the highest total wins. Khata settles by score difference from the table average.',
  ],

  create({ seats, opts, rng, prev }) {
    const unit = [1, 5, 10, 20].includes(+opts.unit) ? +opts.unit : 5;
    const round = prev ? prev.round + 1 : 1;
    const dealer = prev ? (prev.dealer + 1) % 4 : rng.int(4);
    const { hands } = deal(rng);
    const first = (dealer + 1) % 4;
    return {
      n: 4, unit, round, dealer, phase: 'bid', hands, bids: [null, null, null, null], won: [0, 0, 0, 0],
      turn: first, lead: first, trick: [], lastTrick: null, scores: prev ? prev.scores.map((r) => r.slice()) : [],
      tk: 1, ev: [{ k: 'deal' }],
    };
  },

  actors(s) { return s.phase === 'bid' || s.phase === 'play' ? [s.turn] : []; },
  turnMs(s) { return s.phase === 'bid' ? 30000 : 25000; },
  tickDelay(s) { return s.phase === 'trickEnd' ? 1500 : 0; },
  over(s) { return s.phase === 'over'; },

  view(s, seat) {
    const hand = seat >= 0 ? s.hands[seat] : [];
    const mine = seat >= 0 && s.turn === seat;
    const totals = totalsOf(s);
    return {
      n: 4, phase: s.phase, round: s.round, rounds: ROUNDS, dealer: s.dealer, turn: s.turn, unit: s.unit,
      bids: s.bids, won: s.won, scores: s.scores, totals,
      trick: s.trick, lastTrick: s.lastTrick, trickWinner: s.phase === 'trickEnd' ? winnerOf(s.trick) : null,
      hand, counts: s.hands.map((h) => h.length),
      legal: mine && s.phase === 'play' ? legalCards(hand, s.trick) : [],
      canBid: mine && s.phase === 'bid',
      suggest: mine && s.phase === 'bid' ? estimateBid(hand, null) : null,
    };
  },

  act(s, seat, a) {
    if (s.phase === 'bid') {
      must(a.t === 'bid' && Number.isInteger(a.n) && a.n >= 1 && a.n <= 13, 'Bid a number from 1 to 13');
      s.bids[seat] = a.n; s.ev.push({ k: 'bid', seat, n: a.n });
      if (s.bids.every((b) => b !== null)) { s.phase = 'play'; s.turn = s.lead; }
      else s.turn = (seat + 1) % 4;
      bump(s); return;
    }
    must(s.phase === 'play' && a.t === 'play' && typeof a.card === 'string', 'Play a card');
    const hand = s.hands[seat];
    must(hand.includes(a.card), 'You do not hold that card');
    must(legalCards(hand, s.trick).includes(a.card), 'That card is not allowed right now');
    hand.splice(hand.indexOf(a.card), 1);
    s.trick.push({ seat, card: a.card });
    s.ev.push({ k: 'play', seat, card: a.card });
    if (s.trick.length === 4) { s.phase = 'trickEnd'; s.turn = -1; }
    else s.turn = (seat + 1) % 4;
    bump(s);
  },

  tick(s) {
    if (s.phase !== 'trickEnd') return;
    const w = winnerOf(s.trick);
    s.won[w]++;
    s.lastTrick = { cards: s.trick, winner: w };
    s.ev.push({ k: 'trick', winner: w });
    s.trick = [];
    if (s.hands.every((h) => h.length === 0)) {
      s.scores.push([0, 1, 2, 3].map((i) => scoreOf(s.bids[i], s.won[i])));
      s.phase = 'over'; s.turn = -1;
    } else { s.phase = 'play'; s.turn = w; s.lead = w; }
    bump(s);
  },

  bot(s, seat, rng) {
    const hand = s.hands[seat];
    if (s.phase === 'bid') return { t: 'bid', n: estimateBid(hand, rng) };
    const legal = legalCards(hand, s.trick);
    const need = s.bids[seat] - s.won[seat];
    const asc = (a, b) => val(a) - val(b);
    if (!s.trick.length) {
      const nonS = legal.filter((c) => suitOf(c) !== 'S');
      if (need > 0) {
        const hi = nonS.slice().sort((a, b) => val(b) - val(a))[0];
        if (hi && val(hi) >= 11) return { t: 'play', card: hi };
        if (need > 2 && legal.some((c) => suitOf(c) === 'S')) return { t: 'play', card: legal.filter((c) => suitOf(c) === 'S').sort((a, b) => val(b) - val(a))[0] };
        return { t: 'play', card: (nonS.length ? nonS : legal).slice().sort(asc)[0] };
      }
      return { t: 'play', card: (nonS.length ? nonS : legal).slice().sort(asc)[0] };
    }
    const cur = winnerOf(s.trick);
    const curCard = s.trick.find((t) => t.seat === cur).card;
    const beats = (c) => { const t = s.trick.concat([{ seat, card: c }]); return winnerOf(t) === seat; };
    const winners = legal.filter(beats).sort(asc);
    const losers = legal.filter((c) => !beats(c)).sort(asc);
    const lastToPlay = s.trick.length === 3;
    if (need > 0) {
      if (winners.length) return { t: 'play', card: lastToPlay || winners.length === 1 ? winners[0] : winners[Math.min(winners.length - 1, rng.chance(0.3) ? 1 : 0)] };
      return { t: 'play', card: legal.slice().sort(asc)[0] };
    }
    if (losers.length) return { t: 'play', card: losers[losers.length - 1] };
    return { t: 'play', card: legal.slice().sort(asc)[0] };
  },

  auto(s, seat) {
    if (s.phase === 'bid') return { t: 'bid', n: estimateBid(s.hands[seat], null) };
    const legal = legalCards(s.hands[seat], s.trick);
    return { t: 'play', card: legal.slice().sort((a, b) => val(a) - val(b))[0] };
  },

  result(s) {
    const totals = totalsOf(s);
    const last = s.scores[s.scores.length - 1];
    const summary = { round: s.round, rounds: ROUNDS, roundScores: last, totals, bids: s.bids.slice(), won: s.won.slice() };
    if (s.round < ROUNDS) return { deltas: [0, 0, 0, 0], summary, final: false };
    const mean = totals.reduce((a, b) => a + b, 0) / 4;
    const deltas = totals.map((t) => Math.round(((t - mean) * s.unit) / 10));
    const resid = -deltas.reduce((a, b) => a + b, 0);
    if (resid) deltas[totals.indexOf(Math.max(...totals))] += resid;
    return { deltas, summary, final: true };
  },
  resultMs(s) { return s.round < ROUNDS ? 7000 : 14000; },
};
module.exports.hiddenFor = (s, seat) => s.hands.flatMap((h, i) => (i === seat ? [] : h));
module.exports.simHands = 5;
