'use strict';
// Teen Patti: 3-card poker with blind/seen play. Server-authoritative; hands are never sent to other seats.
const { newDeck } = require('../lib/cards');
const { evalBrag } = require('../lib/brag');
const { must, nextSeat } = require('../lib/util');

const bump = (s) => { s.tk++; };
const active = (s) => s.folded.map((f, i) => (f ? -1 : i)).filter((i) => i >= 0);
const nextActive = (s, from) => nextSeat(s.n, from, (i) => s.folded[i]);
const prevActive = (s, from) => { for (let k = 1; k < s.n; k++) { const i = (from - k + s.n * 2) % s.n; if (!s.folded[i]) return i; } return -1; };

const unitS = (s) => s.stake;                                    // current base stake
const amtFor = (s, seat, mult) => (s.seen[seat] ? 2 : 1) * mult;
const chaalAmt = (s, seat) => amtFor(s, seat, s.stake);
const raiseAmt = (s, seat) => (s.stake * 2 <= s.maxStake ? amtFor(s, seat, s.stake * 2) : null);

// True percentile of a 3-card hand among all 22,100 possible hands (built once, lazily).
let TABLE = null;
function strength(hand) {
  if (!TABLE) {
    const d = newDeck(); const vals = [];
    for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) for (let c = b + 1; c < 52; c++) vals.push(evalBrag([d[a], d[b], d[c]]).val);
    TABLE = vals.sort((x, y) => x - y);
  }
  const v = evalBrag(hand).val;
  let lo = 0, hi = TABLE.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (TABLE[mid] < v) lo = mid + 1; else hi = mid; }
  const below = lo; let up = lo; while (up < TABLE.length && TABLE[up] === v) up++;
  return (below + up) / 2 / TABLE.length;
}

function pay(s, seat, amt) { s.contrib[seat] += amt; s.pot += amt; }
function label(s, seat, text) { s.last[seat] = text; }

function finish(s, how, winners) {
  s.phase = 'over'; s.how = how; s.winners = winners; s.turn = -1; s.ss = null;
  if (how !== 'fold') s.revealed = active(s);
  bump(s);
}
function showdown(s, seats) {
  const vals = seats.map((i) => evalBrag(s.hands[i]).val);
  const best = Math.max(...vals);
  return seats.filter((_, k) => vals[k] === best);
}
function advanceTurn(s, from) {
  if (s.pot >= s.potLimit && active(s).length > 1) { s.ev.push({ k: 'limit' }); return finish(s, 'limit', showdown(s, active(s))); }
  s.turn = nextActive(s, from); bump(s);
}

module.exports = {
  id: 'teenpatti',
  name: 'Teen Patti',
  min: 2, max: 8,
  blurb: 'Three cards, blind or seen. Bluff, raise, or show.',
  units: [5, 10, 20, 50],
  rules: [
    'Everyone puts in the boot. Each player gets three cards, face down. You are playing blind until you look.',
    'Blind players bet the stake. Seen players bet double. Raising doubles the stake for everyone.',
    'Pack to fold. With two players left either can pay to Show and compare cards. Ties go against the player who asked.',
    'Side show: a seen player can pay to compare privately with the seen player before them. The lower hand packs.',
    'Best hand: Trail (three of a kind), Pure sequence, Sequence, Color, Pair, High card. A K Q is the top sequence, A 2 3 is second.',
    'When the pot hits the limit everyone left shows automatically.',
  ],

  create({ seats, opts, rng, prev }) {
    const n = seats.length;
    const unit = [5, 10, 20, 50].includes(+opts.unit) ? +opts.unit : 10;
    const d = rng.shuffle(newDeck());
    const dealer = prev ? (prev.dealer + 1) % n : rng.int(n);
    const s = {
      n, unit, dealer, phase: 'bet', hands: Array.from({ length: n }, (_, i) => d.slice(i * 3, i * 3 + 3)),
      seen: new Array(n).fill(false), folded: new Array(n).fill(false), contrib: new Array(n).fill(unit), pot: unit * n,
      stake: unit, maxStake: unit * 8, potLimit: unit * 80, turn: (dealer + 1) % n, ss: null, ssResult: null, winners: [], how: null,
      revealed: [], last: new Array(n).fill(''), tk: 1, ev: [{ k: 'deal' }],
    };
    return s;
  },

  actors(s) { if (s.phase === 'bet') return [s.turn]; if (s.phase === 'sideshow') return [s.ss.to]; return []; },
  turnMs() { return 25000; },
  over(s) { return s.phase === 'over'; },
  offTurn(s, seat, a) { return a.t === 'see' && s.phase === 'bet' && !s.folded[seat] && !s.seen[seat]; },
  hiddenFor(s, seat) { return s.hands.flatMap((h, i) => (i === seat || s.revealed.includes(i) || (s.phase === 'over' && s.how !== 'fold') ? [] : s.seen[i] || true ? h : [])); },

  view(s, seat) {
    const me = seat >= 0;
    const showHand = me && (s.seen[seat] || (s.phase === 'over' && s.revealed.includes(seat)));
    const myTurn = me && s.phase === 'bet' && s.turn === seat;
    const act = active(s);
    const view = {
      n: s.n, phase: s.phase, turn: s.turn, dealer: s.dealer, unit: s.unit, stake: s.stake, pot: s.pot, potLimit: s.potLimit,
      folded: s.folded, seen: s.seen, contrib: s.contrib, last: s.last,
      hand: showHand ? s.hands[seat] : null, myLabel: showHand ? evalBrag(s.hands[seat]).name : null,
      canSee: me && s.phase === 'bet' && !s.folded[seat] && !s.seen[seat],
      actions: null, ss: s.ss, ssResult: s.ssResult,
      reveal: s.phase === 'over' && s.how !== 'fold' ? s.revealed.map((i) => ({ seat: i, hand: s.hands[i], label: evalBrag(s.hands[i]).name })) : [],
      winners: s.winners, how: s.how,
    };
    if (myTurn) {
      const two = act.length === 2;
      const prev = prevActive(s, seat);
      view.actions = {
        chaal: chaalAmt(s, seat), raise: raiseAmt(s, seat), pack: true,
        show: two ? amtFor(s, seat, s.stake) : null,
        sideshow: !two && s.seen[seat] && prev >= 0 && s.seen[prev] ? chaalAmt(s, seat) : null,
        sideshowWith: prev,
      };
    }
    if (me && s.phase === 'sideshow' && s.ss.to === seat) view.ssAsk = { from: s.ss.from };
    return view;
  },

  act(s, seat, a) {
    if (a.t === 'see') { must(s.phase === 'bet' && !s.folded[seat] && !s.seen[seat], 'You already looked'); s.seen[seat] = true; s.ev.push({ k: 'see', seat }); return; }
    if (s.phase === 'sideshow') {
      must(s.ss.to === seat && a.t === 'ss' && typeof a.ok === 'boolean', 'Answer the side show request');
      const from = s.ss.from;
      if (!a.ok) { label(s, seat, 'declined'); s.ssResult = { from, to: seat, accepted: false }; s.ev.push({ k: 'ss', from, to: seat, ok: false }); s.ss = null; s.phase = 'bet'; return advanceTurn(s, from); }
      const vf = evalBrag(s.hands[from]).val, vt = evalBrag(s.hands[seat]).val;
      const loser = vt > vf ? from : vt < vf ? seat : from;                  // tie: requester packs
      s.folded[loser] = true; label(s, loser, 'packed');
      s.ssResult = { from, to: seat, accepted: true, loser };
      s.ev.push({ k: 'ss', from, to: seat, ok: true, loser });
      s.ss = null; s.phase = 'bet';
      if (active(s).length === 1) return finish(s, 'fold', active(s));
      return advanceTurn(s, from);
    }
    must(s.phase === 'bet' && s.turn === seat, 'Not your turn');
    const act = active(s);
    const clear = () => { s.ssResult = null; };
    switch (a.t) {
      case 'chaal': { clear(); const amt = chaalAmt(s, seat); pay(s, seat, amt); label(s, seat, s.seen[seat] ? 'chaal ' + amt : 'blind ' + amt); s.ev.push({ k: 'bet', seat, amt }); return advanceTurn(s, seat); }
      case 'raise': {
        const amt = raiseAmt(s, seat); must(amt !== null, 'The stake is already at the limit');
        clear(); s.stake *= 2; pay(s, seat, amt); label(s, seat, 'raised ' + amt); s.ev.push({ k: 'raise', seat, amt }); return advanceTurn(s, seat);
      }
      case 'pack': {
        clear(); s.folded[seat] = true; label(s, seat, 'packed'); s.ev.push({ k: 'pack', seat });
        if (active(s).length === 1) return finish(s, 'fold', active(s));
        return advanceTurn(s, seat);
      }
      case 'show': {
        must(act.length === 2, 'Show is only possible with two players left');
        clear(); const amt = amtFor(s, seat, s.stake); pay(s, seat, amt); s.ev.push({ k: 'show', seat, amt });
        const other = act.find((i) => i !== seat);
        const vs = evalBrag(s.hands[seat]).val, vo = evalBrag(s.hands[other]).val;
        return finish(s, 'show', [vs > vo ? seat : other]);                     // tie: requester loses
      }
      case 'sideshow': {
        must(act.length > 2, 'Use Show with two players left');
        const p = prevActive(s, seat);
        must(s.seen[seat] && p >= 0 && s.seen[p], 'Side show needs you and the player before you to have seen cards');
        clear(); const amt = chaalAmt(s, seat); pay(s, seat, amt); label(s, seat, 'side show'); s.ev.push({ k: 'bet', seat, amt });
        s.ss = { from: seat, to: p }; s.phase = 'sideshow'; bump(s); return;
      }
      default: throw new (require('../lib/util').GameError)('Unknown move');
    }
  },

  bot(s, seat, rng) {
    if (s.phase === 'sideshow') return { t: 'ss', ok: strength(s.hands[seat]) > 0.5 ? rng.chance(0.75) : rng.chance(0.15) };
    if (!s.seen[seat]) {
      if (s.stake >= s.unit * 2 || rng.chance(0.45)) return { t: 'see' };
      if (active(s).length === 2 && s.contrib[seat] >= s.unit * 8 && rng.chance(0.3)) return { t: 'show' };
      return { t: rng.chance(0.03) && raiseAmt(s, seat) ? 'raise' : 'chaal' };
    }
    const st = strength(s.hands[seat]);
    const act = active(s);
    const lvl = Math.log2(s.stake / s.unit);                 // 0..4
    const x = st + (rng.next() - 0.5) * 0.14;
    const paid = s.contrib[seat] / s.unit;
    const foldT = 0.2 + 0.12 * lvl + (act.length > 3 ? 0.06 : 0) + 0.03 * Math.max(0, paid - 5);
    const canRaise = !!raiseAmt(s, seat);
    if (act.length === 2) {
      if (x > 0.5 && rng.chance(0.5 + 0.12 * lvl)) return { t: 'show' };
      if (x < foldT && !rng.chance(0.08)) return { t: 'pack' };
      if (x > 0.9 && canRaise && lvl < 3 && rng.chance(0.3)) return { t: 'raise' };
      if (s.contrib[seat] > s.unit * 14 && x > 0.35) return { t: 'show' };
      return { t: 'chaal' };
    }
    const p = prevActive(s, seat);
    if (x > 0.45 && p >= 0 && s.seen[p] && rng.chance(0.12)) return { t: 'sideshow' };
    if (x < foldT && !rng.chance(0.06)) return { t: 'pack' };
    if (x > 0.9 && canRaise && lvl < 3 && rng.chance(0.4)) return { t: 'raise' };
    if (x > 0.6 && canRaise && lvl < 3 && rng.chance(paid >= 6 ? 0.3 : 0.08)) return { t: 'raise' };
    if (x < 0.4 && rng.chance(0.18 + 0.06 * lvl)) return { t: 'pack' };
    return { t: 'chaal' };
  },
  auto(s, seat) { return s.phase === 'sideshow' ? { t: 'ss', ok: false } : { t: 'pack' }; },

  result(s) {
    const deltas = s.contrib.map((c) => -c);
    const k = s.winners.length; const share = Math.floor(s.pot / k); let rem = s.pot - share * k;
    s.winners.forEach((w) => { deltas[w] += share + (rem-- > 0 ? 1 : 0); });
    return { deltas, summary: { winners: s.winners, how: s.how, pot: s.pot, reveal: s.how !== 'fold' ? s.revealed.map((i) => ({ seat: i, hand: s.hands[i], label: evalBrag(s.hands[i]).name })) : [] }, final: false };
  },
  resultMs() { return 8000; },
};
