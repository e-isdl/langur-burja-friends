'use strict';
// Card ids are 2 chars: rank + suit. Rank 'T' = 10. Multi-deck games append a copy digit ('AS0','AS1').
const RANKS = '23456789TJQKA';
const SUITS = 'SHDC';
const rankOf = (id) => RANKS.indexOf(id[0]);   // 0..12, Ace = 12
const suitOf = (id) => id[1];
const base = (id) => id.slice(0, 2);
const isRed = (id) => id[1] === 'H' || id[1] === 'D';

function newDeck(copies = 1) {
  const out = [];
  for (let c = 0; c < copies; c++)
    for (const s of SUITS)
      for (const r of RANKS) out.push(copies === 1 ? r + s : r + s + c);
  return out;
}

// Sort by suit (S H D C) then rank ascending, or rank-major.
function sortHand(hand, by = 'suit') {
  const sv = (id) => SUITS.indexOf(suitOf(id));
  return hand.slice().sort((a, b) =>
    by === 'suit' ? sv(a) - sv(b) || rankOf(a) - rankOf(b) : rankOf(a) - rankOf(b) || sv(a) - sv(b));
}

module.exports = { RANKS, SUITS, rankOf, suitOf, base, isRed, newDeck, sortHand };
