'use strict';
// Jud Patti: seven cards, lay pairs and sets (joker rank is wild), first to empty their hand wins.
const { newDeck, rankOf, RANKS } = require('../lib/cards');
const { must, GameError } = require('../lib/util');

const bump = (s) => { s.tk++; };
const wild = (s, id) => id[0] === s.joker;
const sortHand = (s, h) => h.slice().sort((a, b) => (wild(s, b) - wild(s, a)) || rankOf(a) - rankOf(b) || a.localeCompare(b));

function validGroup(s, cards) {
  if (cards.length < 2 || cards.length > 4) return false;
  const nat = cards.filter((c) => !wild(s, c));
  return nat.every((c) => c[0] === nat[0][0]);
}
// Suggested groups for the UI and bots: natural sets first, then wild-assisted pairs.
function suggest(s, hand) {
  const w = hand.filter((c) => wild(s, c)); const nat = hand.filter((c) => !wild(s, c));
  const by = {}; nat.forEach((c) => { (by[c[0]] = by[c[0]] || []).push(c); });
  const groups = []; const leftover = [];
  for (const g of Object.values(by)) { if (g.length >= 2) groups.push(g); else leftover.push(g[0]); }
  const wl = w.slice();
  leftover.sort((a, b) => rankOf(b) - rankOf(a));
  while (wl.length && leftover.length) groups.push([leftover.shift(), wl.shift()]);
  if (wl.length >= 2) groups.push(wl.splice(0, 2));
  return groups;
}
function refill(s) {
  if (s.stock.length) return true;
  if (s.discard.length <= 1) return false;
  const top = s.discard.pop(); s.stock = (s.rng || require('../lib/rng').make()).shuffle(s.discard); s.discard = [top]; s.ev.push({ k: 'shuffle' }); return true;
}
function win(s, seat) { s.winner = seat; s.phase = 'over'; s.turn = -1; s.ev.push({ k: 'win', seat }); bump(s); }
function nextTurn(s, from) {
  s.turn = (from + 1) % s.n; s.stage = 'draw'; s.taken = null; s.laid = false; s.turns++; bump(s);
  if (s.turns > s.n * 45) { s.winner = -1; s.phase = 'over'; s.turn = -1; s.ev.push({ k: 'stalemate' }); }   // nobody can finish: call it a draw
}

module.exports = {
  id: 'judpatti', name: 'Jud Patti', min: 2, max: 5,
  blurb: 'Pair up, set down, empty your hand first.',
  units: [5, 10, 20, 50],
  rules: [
    'Seven cards each. One rank is the joker for the whole hand: every card of that rank is wild.',
    'On your turn draw from the deck or take the top of the discard pile. Then you may lay down one pair or set (2 to 4 cards of one rank; jokers fill in).',
    'End your turn by discarding one card. You cannot discard the card you just took from the pile.',
    'First player with no cards wins. Empty your hand by laying down, or by discarding your last card.',
    'Win without laying a joker and it pays double.',
  ],

  create({ seats, opts, rng, prev }) {
    const n = seats.length; const unit = [5, 10, 20, 50].includes(+opts.unit) ? +opts.unit : 10;
    const d = rng.shuffle(newDeck()); const joker = RANKS[rng.int(13)];
    const s = { n, unit, joker, dealer: prev ? (prev.dealer + 1) % n : rng.int(n), hands: [], stock: [], discard: [], melds: Array.from({ length: n }, () => []), wildUsed: new Array(n).fill(false), turn: 0, stage: 'draw', taken: null, winner: -1, turns: 0, laid: false, phase: 'turn', tk: 1, ev: [{ k: 'deal' }] };
    Object.defineProperty(s, 'rng', { value: rng, enumerable: false, writable: true });
    s.hands = Array.from({ length: n }, (_, i) => sortHand(s, d.slice(i * 7, i * 7 + 7)));
    s.stock = d.slice(n * 7); s.discard = [s.stock.pop()];
    s.turn = (s.dealer + 1) % n; return s;
  },

  actors(s) { return s.phase === 'turn' ? [s.turn] : []; },
  turnMs() { return 40000; },
  over(s) { return s.phase === 'over'; },
  hiddenFor(s, seat) { return s.phase === 'over' ? [] : s.hands.flatMap((h, i) => (i === seat ? [] : h)); },

  view(s, seat) {
    const hand = seat >= 0 ? s.hands[seat] : []; const mine = seat >= 0 && s.turn === seat && s.phase === 'turn';
    return {
      n: s.n, phase: s.phase, unit: s.unit, joker: s.joker, turn: s.turn, stage: s.stage, stock: s.stock.length, top: s.discard[s.discard.length - 1] || null, discardCount: s.discard.length,
      hand, counts: s.hands.map((h) => h.length), melds: s.melds, wildIn: hand.filter((c) => wild(s, c)),
      hints: mine && s.stage === 'act' && !s.laid ? suggest(s, hand) : [], laid: s.laid, noDiscard: mine ? s.taken : null, winner: s.winner,
      reveal: s.phase === 'over' ? s.hands : null,
    };
  },

  act(s, seat, a) {
    must(s.phase === 'turn', 'Hand is over');
    const h = s.hands[seat];
    if (s.stage === 'draw') {
      must(a.t === 'draw', 'Draw first');
      if (a.from === 'discard') { must(s.discard.length > 0, 'The pile is empty'); const c = s.discard.pop(); h.push(c); s.taken = c; s.ev.push({ k: 'draw', seat, pile: true }); }
      else {
        must(a.from === 'stock', 'Draw from the deck or the pile');
        if (!refill(s)) { s.winner = -1; s.phase = 'over'; s.turn = -1; bump(s); return; }
        h.push(s.stock.pop()); s.taken = null; s.ev.push({ k: 'draw', seat });
      }
      s.hands[seat] = sortHand(s, h); s.stage = 'act'; return;
    }
    if (a.t === 'meld') {
      must(!s.laid, 'One set per turn. Discard to finish your turn.');
      must(Array.isArray(a.cards) && new Set(a.cards).size === a.cards.length, 'Pick the cards for the set');
      must(a.cards.every((c) => typeof c === 'string' && h.includes(c)), 'You do not hold those cards');
      must(validGroup(s, a.cards), 'A set is 2 to 4 cards of one rank, jokers can fill in');
      a.cards.forEach((c) => h.splice(h.indexOf(c), 1));
      s.laid = true; s.melds[seat].push(a.cards.slice()); if (a.cards.some((c) => wild(s, c))) s.wildUsed[seat] = true;
      s.ev.push({ k: 'meld', seat }); if (!h.length) return win(s, seat); return;
    }
    must(a.t === 'discard' && typeof a.card === 'string' && h.includes(a.card), 'Discard a card from your hand');
    must(a.card !== s.taken || h.length === 1, 'You cannot discard the card you just took');
    h.splice(h.indexOf(a.card), 1); s.discard.push(a.card); s.ev.push({ k: 'discard', seat });
    if (!h.length) return win(s, seat);
    nextTurn(s, seat);
  },

  bot(s, seat, rng) {
    const h = s.hands[seat];
    if (s.stage === 'draw') {
      const top = s.discard[s.discard.length - 1];
      if (top && (wild(s, top) || h.some((c) => c[0] === top[0]))) return { t: 'draw', from: 'discard' };
      return { t: 'draw', from: 'stock' };
    }
    const g = s.laid ? null : suggest(s, h).sort((a, b) => b.length - a.length)[0];
    if (g) return { t: 'meld', cards: g };
    const singles = h.filter((c) => c !== s.taken);
    const pool = singles.length ? singles : h;
    const nonWild = pool.filter((c) => !wild(s, c));
    const cand = nonWild.length ? nonWild : pool;
    const pick = (h.length <= 3 || rng.chance(0.25)) ? rng.pick(cand) : cand.slice().sort((a, b) => rankOf(b) - rankOf(a))[0];
    return { t: 'discard', card: pick };
  },
  auto(s, seat) {
    if (s.stage === 'draw') return { t: 'draw', from: 'stock' };
    const h = s.hands[seat].filter((c) => c !== s.taken); const pool = h.length ? h : s.hands[seat];
    return { t: 'discard', card: pool.slice().sort((a, b) => (wild(s, a) - wild(s, b)) || rankOf(b) - rankOf(a))[0] };
  },

  result(s) {
    const n = s.n; const deltas = new Array(n).fill(0);
    if (s.winner >= 0) { const m = s.wildUsed[s.winner] ? 1 : 2; deltas[s.winner] = s.unit * m * (n - 1); for (let i = 0; i < n; i++) if (i !== s.winner) deltas[i] = -s.unit * m; }
    return { deltas, summary: { winner: s.winner, pure: s.winner >= 0 && !s.wildUsed[s.winner], joker: s.joker, reveal: s.hands }, final: false };
  },
  resultMs() { return 8000; },
};
module.exports.suggest = suggest;
