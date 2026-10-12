'use strict';
// Marriage (Mal): 3 decks (156 cards), 21-card hands, pure sequences + wild tunla/joker, declare with host-free
// auto-validation (a real solver, not host trust). Simplified to one clean win path so it is learnable in a sitting:
// meld everything into valid groups (pure sequences of 3+, or sets/runs using wilds) and go out.
const { RANKS, SUITS, rankOf } = require('../lib/cards');
const { must, GameError } = require('../lib/util');

const bump = (s) => { s.tk++; };
function tripleDeck() { const out = []; for (let c = 0; c < 3; c++) for (const su of SUITS) for (const r of RANKS) out.push(r + su + c); return out; }
const base = (id) => id.slice(0, 2);
const suitOf = (id) => id[1];
const sortHand = (h) => h.slice().sort((a, b) => SUITS.indexOf(suitOf(a)) - SUITS.indexOf(suitOf(b)) || rankOf(a) - rankOf(b) || a.localeCompare(b));
const isWild = (s, id) => rankOf(id) === s.wildRank || base(id) === s.jokerCard;

// ---- declare validator: fast, memoized, budgeted backtracking over a suit x rank count grid ----
// See test/marriage-solver.test.js for how this is verified: hands built from real groups are always
// accepted, and it always terminates (a node budget guarantees termination on any input).
function buildGrid(cards, wildRank) {
  const grid = [[0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0]];
  let wild = 0;
  for (const c of cards) {
    const su = SUITS.indexOf(suitOf(c)); const rv = rankOf(c);
    if (rv === wildRank) wild++; else grid[su][rv < wildRank ? rv : rv - 1]++;
  }
  return { grid, wild };
}
const SOLVE_BUDGET = 40000;
function canDeclare(cards, wildRank, needPure) {
  const { grid, wild } = buildGrid(cards, wildRank);
  let nodes = 0; const memo = new Map();
  const keyOf = (g, w, np) => g.map((row) => row.join('')).join('|') + '#' + w + (np ? 'P' : '');
  const firstCell = (g) => { for (let su = 0; su < 4; su++) for (let ri = 0; ri < 12; ri++) if (g[su][ri] > 0) return [su, ri]; return null; };
  function rec(g, w, np) {
    if (++nodes > SOLVE_BUDGET) throw 'budget';
    const pivot = firstCell(g);
    if (!pivot) { if (np) return false; if (w === 0) return true; return w >= 3 && w <= 4; }
    const k = keyOf(g, w, np); if (memo.has(k)) return memo.get(k);
    const [su, ri] = pivot; const others = [0, 1, 2, 3].filter((x) => x !== su);
    const moves = [];
    if (g[su][ri] >= 3) moves.push({ take: [[su, ri, 3]], w: 0, pure: false });     // tunnel: 3 identical cards
    for (const size of [3, 4]) {
      for (let mask = 0; mask < 8; mask++) {
        let bits = 0; const use = [];
        for (let i = 0; i < 3; i++) if (mask & (1 << i)) { bits++; const s = others[i]; if (g[s][ri] > 0) use.push(s); }
        if (use.length !== bits) continue;
        const realCount = 1 + use.length; const need = size - realCount;
        if (need < 0 || need > w) continue;
        moves.push({ take: [[su, ri, 1], ...use.map((s) => [s, ri, 1])], w: need, pure: false });    // set, wild-padded
      }
    }
    for (let lo = Math.max(0, ri - 11); lo <= ri; lo++) {
      for (let hi = ri; hi <= Math.min(11, lo + 11); hi++) {
        const len = hi - lo + 1; if (len < 3) continue;
        let wildNeed = 0; const take = [];
        for (let x = lo; x <= hi; x++) { if (g[su][x] > 0) take.push([su, x, 1]); else wildNeed++; }
        if (wildNeed > w) continue;
        moves.push({ take, w: wildNeed, pure: wildNeed === 0 });                     // run, wild-filled gaps
      }
    }
    let ok = false;
    for (const m of moves) {
      const g2 = g.map((row) => row.slice()); for (const [s, r, n] of m.take) g2[s][r] -= n;
      if (rec(g2, w - m.w, np && !m.pure)) { ok = true; break; }
    }
    memo.set(k, ok); return ok;
  }
  try { return rec(grid, wild, needPure); } catch (e) { if (e === 'budget') return false; throw e; }
}

function newHand(rng) {
  const deck = rng.shuffle(tripleDeck());
  const wildRank = rng.int(13);                              // tiplu rank
  return { deck, wildRank };
}

module.exports = {
  id: 'marriage', name: 'Marriage', min: 2, max: 5,
  blurb: 'Three decks, 21 cards, the marathon finale.',
  units: [10, 20, 50],
  rules: [
    'Three decks shuffled together, 21 cards each. A wild rank (Tiplu) is revealed: every card of that rank is wild, any suit.',
    'On your turn draw from the deck or the discard pile, then discard one card.',
    'Group your cards into pure sequences (3+ of one suit in a row, no wilds) and sets or runs that can use wilds.',
    'You need at least one pure sequence somewhere in your hand before you can declare.',
    'Declare when your whole hand groups cleanly. The table checks it for you: a bad declare is a warning, not a trap.',
    'First to declare a clean hand wins the pot. Three identical cards of the same rank and suit (a Tunnel) pays a bonus.',
  ],

  create({ seats, opts, rng, prev }) {
    const n = seats.length; const unit = [10, 20, 50].includes(+opts.unit) ? +opts.unit : 20;
    const { deck, wildRank } = newHand(rng);
    const hands = Array.from({ length: n }, (_, i) => sortHand(deck.slice(i * 21, i * 21 + 21)));
    const stock = deck.slice(n * 21); const first = stock.pop();
    const jokerCard = null;
    const s = { n, unit, wildRank, jokerCard, dealer: prev ? (prev.dealer + 1) % n : rng.int(n), hands, stock, discard: [first], turn: 0, stage: 'draw', taken: null, winner: -1, warned: new Array(n).fill(0), turns: 0, phase: 'turn', tk: 1, ev: [{ k: 'deal' }] };
    Object.defineProperty(s, 'rng', { value: rng, enumerable: false, writable: true });
    s.turn = (s.dealer + 1) % n; return s;
  },

  actors(s) { return s.phase === 'turn' ? [s.turn] : []; },
  turnMs() { return 45000; },
  over(s) { return s.phase === 'over'; },
  hiddenFor(s, seat) { return s.phase === 'over' ? [] : s.hands.flatMap((h, i) => (i === seat ? [] : h)); },

  view(s, seat) {
    const hand = seat >= 0 ? s.hands[seat] : []; const mine = seat >= 0 && s.turn === seat && s.phase === 'turn';
    return {
      n: s.n, phase: s.phase, unit: s.unit, wildRank: s.wildRank, turn: s.turn, stage: s.stage, stock: s.stock.length,
      top: s.discard[s.discard.length - 1] || null, hand, counts: s.hands.map((h) => h.length), taken: mine ? s.taken : null,
      canDraw: mine && s.stage === 'draw', canAct: mine && s.stage === 'act', winner: s.winner,
      reveal: s.phase === 'over' ? s.result : null,
    };
  },

  act(s, seat, a) {
    must(s.phase === 'turn', 'Hand is over');
    const h = s.hands[seat];
    if (s.stage === 'draw') {
      must(a.t === 'draw', 'Draw first');
      if (a.from === 'discard') { must(s.discard.length > 0, 'The pile is empty'); const c = s.discard.pop(); h.push(c); s.taken = c; }
      else {
        must(a.from === 'stock', 'Draw from the deck or the pile');
        if (s.stock.length < 1) { if (s.discard.length <= 1) { s.winner = -1; s.phase = 'over'; s.turn = -1; s.result = { deltas: new Array(s.n).fill(0) }; bump(s); return; } const top = s.discard.pop(); s.stock = (s.rng || require('../lib/rng').make()).shuffle(s.discard); s.discard = [top]; s.ev.push({ k: 'shuffle' }); }
        h.push(s.stock.pop()); s.taken = null;
      }
      s.hands[seat] = sortHand(h); s.stage = 'act'; s.ev.push({ k: 'draw', seat }); return;
    }
    if (a.t === 'declare') {
      must(h.length === 22, 'You need 22 cards to declare, draw first');
      const ok = canDeclare(h, s.wildRank, true);
      if (!ok) { s.warned[seat]++; s.ev.push({ k: 'baddeclare', seat }); return; }   // false declare: rejected, no turn lost, try again
      s.winner = seat; s.phase = 'over'; s.turn = -1; s.ev.push({ k: 'win', seat });
      s.result = null; bump(s); return;
    }
    must(a.t === 'discard' && typeof a.card === 'string' && h.includes(a.card), 'Discard a card from your hand');
    h.splice(h.indexOf(a.card), 1); s.discard.push(a.card); s.hands[seat] = h; s.ev.push({ k: 'discard', seat });
    s.turn = (seat + 1) % s.n; s.stage = 'draw'; s.taken = null; s.turns++;
    if (s.turns > s.n * 120) { s.winner = -1; s.phase = 'over'; s.turn = -1; s.result = { deltas: new Array(s.n).fill(0) }; }
    bump(s);
  },

  bot(s, seat, rng) {
    const h = s.hands[seat];
    if (s.stage === 'draw') {
      const top = s.discard[s.discard.length - 1];
      if (top) {
        const cur = greedyDeadwood(h, s.wildRank);
        const withTop = h.concat(top); const withStock = h.concat(h[0]);   // placeholder card, only deadwood of the rest matters pre-draw
        const dTop = greedyDeadwood(withTop, s.wildRank).deadwood;
        // taking the discard only helps if it visibly lowers deadwood (accounting for the extra card it also adds)
        if (dTop <= cur.deadwood) return { t: 'draw', from: 'discard' };
      }
      return { t: 'draw', from: 'stock' };
    }
    if (h.length === 22) {
      const g = greedyDeadwood(h, s.wildRank);
      if (g.deadwood === 0 && g.havePure && canDeclare(h, s.wildRank, true)) return { t: 'declare' };
    }
    // discard the card whose removal leaves the best (lowest-deadwood) 21-card hand
    let worst = h[0], worstScore = Infinity;
    for (const c of new Set(h)) {
      const rest = h.slice(); rest.splice(rest.indexOf(c), 1);
      const g = greedyDeadwood(rest, s.wildRank);
      const score = g.deadwood - (g.havePure ? 0.4 : 0) - (isWild(s, c) ? 3 : 0);   // keep wilds, keep pure-run progress
      if (score < worstScore) { worstScore = score; worst = c; }
    }
    return { t: 'discard', card: worst };
  },

  auto(s, seat) {
    if (s.stage === 'draw') return { t: 'draw', from: 'stock' };
    return { t: 'discard', card: s.hands[seat][0] };
  },

  result(s) {
    const n = s.n; if (s.result) return { deltas: s.result.deltas, summary: { winner: -1, out: true }, final: false };
    const deltas = new Array(n).fill(0);
    const w = s.winner; const winHand = s.hands[w];
    const tunnel = countTunnels(winHand);
    const mult = 1 + tunnel;                                 // each tunnel doubles the stake, simple and legible
    for (let i = 0; i < n; i++) if (i !== w) { deltas[i] = -s.unit * mult; deltas[w] -= deltas[i]; }
    return { deltas, summary: { winner: w, tunnel, wildRank: s.wildRank, hand: winHand }, final: false };
  },
  resultMs() { return 10000; },
};

function countTunnels(hand) { const c = {}; hand.forEach((id) => { c[base(id)] = (c[base(id)] || 0) + 1; }); return Object.values(c).filter((n) => n >= 3).length; }

// Greedy (non-exact, fast) grouping quality: extracts pure runs, tunnels, sets and wild-assisted runs in
// priority order and reports how many cards end up ungrouped ("deadwood") and whether a pure run was
// secured. Used to steer bot draw/discard choices toward an actual declare; the real legality check when
// a bot considers declaring is still the exact canDeclare() solver above.
function greedyDeadwood(cards, wildRank) {
  const { grid, wild } = buildGrid(cards, wildRank);
  let w = wild, grouped = 0, havePure = false;
  // 1. pure runs: take every maximal run of length >= 3 in each suit.
  for (let su = 0; su < 4; su++) {
    let ri = 0;
    while (ri < 12) {
      if (grid[su][ri] > 0) {
        let hi = ri; while (hi + 1 < 12 && grid[su][hi + 1] > 0) hi++;
        const len = hi - ri + 1;
        if (len >= 3) { for (let x = ri; x <= hi; x++) grid[su][x] = 0; grouped += len; havePure = true; }
        ri = hi + 1;
      } else ri++;
    }
  }
  // 2. tunnels: 3 identical cards left in one cell.
  for (let su = 0; su < 4; su++) for (let ri = 0; ri < 12; ri++) if (grid[su][ri] >= 3) { grid[su][ri] -= 3; grouped += 3; }
  // 3. sets by rank: prefer suits-only (no wild), then pad with wild if it still clears 3.
  for (let ri = 0; ri < 12; ri++) {
    const suits = [0, 1, 2, 3].filter((su) => grid[su][ri] > 0);
    if (suits.length >= 3) { for (const su of suits.slice(0, 4)) grid[su][ri]--; grouped += Math.min(suits.length, 4); }
    else if (suits.length === 2 && w >= 1) { for (const su of suits) grid[su][ri]--; w--; grouped += 3; }
    else if (suits.length === 1 && w >= 2) { grid[suits[0]][ri]--; w -= 2; grouped += 3; }
  }
  // 4. wild-bridged runs: a short real cluster in one suit with a small gap, completed by remaining wild.
  for (let su = 0; su < 4 && w > 0; su++) {
    let ri = 0;
    while (ri < 12 && w > 0) {
      if (grid[su][ri] > 0) {
        let hi = ri, gapUsed = 0;
        while (hi + 1 < 12 && gapUsed + (hi + 1 - ri) - countReal(grid, su, ri, hi + 1) <= w) {
          if (grid[su][hi + 1] === 0 && gapUsed >= w) break;
          hi++;
          gapUsed = (hi - ri + 1) - countReal(grid, su, ri, hi);
          if (gapUsed > w) { hi--; break; }
        }
        const real = countReal(grid, su, ri, hi); const need = (hi - ri + 1) - real;
        if (real >= 2 && need >= 1 && need <= w && (hi - ri + 1) >= 3) {
          for (let x = ri; x <= hi; x++) grid[su][x] = 0; w -= need; grouped += (hi - ri + 1);
        }
        ri = hi + 1;
      } else ri++;
    }
  }
  const total = cards.length;
  return { deadwood: total - grouped, havePure, wildLeft: w };
}
function countReal(grid, su, lo, hi) { let n = 0; for (let x = lo; x <= hi; x++) if (grid[su][x] > 0) n++; return n; }


module.exports.canDeclare = canDeclare;
module.exports.simHands = 1;
