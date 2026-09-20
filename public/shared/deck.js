/* ============================================================
   Langur Burja & Friends — shared/deck.js
   window.DeckLib — cards, Teen Patti eval, Rummy eval,
   Phalas totals, cardHTML helper. No dependencies.
   ============================================================ */
(function () {
  'use strict';

  var RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  var SUITS = ['S', 'H', 'D', 'C']; // Spades Hearts Diamonds Clubs
  var SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' };
  var SUIT_ORDER = { S: 4, H: 3, D: 2, C: 1 }; // S > H > D > C
  var RANK_VALUE = { A: 14, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13 };

  function cardValue(rank) {
    return RANK_VALUE[rank] != null ? RANK_VALUE[rank] : 0;
  }

  function phalasValue(rank) {
    if (rank === 'J') return 0;
    if (rank === 'Q' || rank === 'K') return 10;
    if (rank === 'A') return 1;
    var n = parseInt(rank, 10);
    return isFinite(n) ? n : 0;
  }

  function makeId() {
    return 'c' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  }

  function secureRand(n) {
    // uniform int in [0, n)
    try {
      if (window.crypto && window.crypto.getRandomValues && n > 0) {
        var range = 0xFFFFFFFF;
        var limit = range - (range % n);
        var arr = new Uint32Array(1);
        do {
          window.crypto.getRandomValues(arr);
        } while (arr[0] >= limit);
        return arr[0] % n;
      }
    } catch (e) {}
    return Math.floor(Math.random() * n);
  }

  // ---------------- Deck ----------------
  function Deck(opts) {
    opts = opts || {};
    var decks = opts.decks || 1;
    this.cards = [];
    for (var d = 0; d < decks; d++) {
      for (var s = 0; s < SUITS.length; s++) {
        for (var r = 0; r < RANKS.length; r++) {
          this.cards.push({ rank: RANKS[r], suit: SUITS[s], id: makeId() });
        }
      }
    }
    this.shuffle();
  }

  Deck.prototype.shuffle = function () {
    var a = this.cards;
    for (var i = a.length - 1; i > 0; i--) {
      var j = secureRand(i + 1);
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return this;
  };

  Deck.prototype.draw = function () {
    return this.cards.length ? this.cards.pop() : null;
  };

  Deck.prototype.drawMany = function (n) {
    var out = [];
    for (var i = 0; i < n; i++) {
      var c = this.draw();
      if (!c) break;
      out.push(c);
    }
    return out;
  };

  Deck.prototype.remaining = function () { return this.cards.length; };

  Deck.prototype.reshuffle = function (discards) {
    if (discards && discards.length) {
      for (var i = 0; i < discards.length; i++) this.cards.push(discards[i]);
    }
    return this.shuffle();
  };

  // ---------------- Teen Patti (3 cards) ----------------
  // rank: 1 Trail (best) … 6 High Card. 7 = invalid.
  // A-2-3 counts as the HIGHEST pure/sequence (Desi rule).
  function isA23(ranks) {
    return ranks.indexOf('A') !== -1 && ranks.indexOf('2') !== -1 && ranks.indexOf('3') !== -1;
  }

  function isSequence(vals) {
    var s = vals.slice().sort(function (a, b) { return a - b; });
    if (s[0] === 2 && s[1] === 3 && s[2] === 14) return { straight: true, high: 15, a23: true }; // A-2-3
    if (s[1] === s[0] + 1 && s[2] === s[1] + 1) return { straight: true, high: s[2], a23: false };
    return { straight: false };
  }

  function evaluatePoker3(cards3) {
    if (!cards3 || cards3.length !== 3) {
      return { rank: 7, name: 'Invalid', tiebreak: [], isA23Pure: false };
    }
    var ranks = [cards3[0].rank, cards3[1].rank, cards3[2].rank];
    var suits = [cards3[0].suit, cards3[1].suit, cards3[2].suit];
    var vals = ranks.map(cardValue);
    var flush = (suits[0] === suits[1] && suits[1] === suits[2]);
    var seq = isSequence(vals);

    // Trail
    if (ranks[0] === ranks[1] && ranks[1] === ranks[2]) {
      return { rank: 1, name: 'Trail', tiebreak: [cardValue(ranks[0])], isA23Pure: false };
    }
    // Pure sequence (straight flush)
    if (flush && seq.straight) {
      return { rank: 2, name: 'Pure Sequence', tiebreak: [seq.high], isA23Pure: !!seq.a23 };
    }
    // Sequence
    if (seq.straight) {
      return { rank: 3, name: 'Sequence', tiebreak: [seq.high], isA23Pure: false };
    }
    // Flush
    if (flush) {
      var desc = vals.slice().sort(function (a, b) { return b - a; });
      return { rank: 4, name: 'Flush', tiebreak: desc, isA23Pure: false };
    }
    // Pair
    if (ranks[0] === ranks[1] || ranks[1] === ranks[2] || ranks[0] === ranks[2]) {
      var pairVal, kicker;
      if (ranks[0] === ranks[1]) { pairVal = cardValue(ranks[0]); kicker = cardValue(ranks[2]); }
      else if (ranks[1] === ranks[2]) { pairVal = cardValue(ranks[1]); kicker = cardValue(ranks[0]); }
      else { pairVal = cardValue(ranks[0]); kicker = cardValue(ranks[1]); }
      return { rank: 5, name: 'Pair', tiebreak: [pairVal, kicker], isA23Pure: false };
    }
    // High card
    var hi = vals.slice().sort(function (a, b) { return b - a; });
    return { rank: 6, name: 'High Card', tiebreak: hi, isA23Pure: false };
  }

  // compareHands(a, b) -> 1 if a wins, -1 if b wins, 0 tie.
  // Accepts raw 3-card arrays OR evaluated {rank, tiebreak} objects.
  function toEval(h) {
    if (h && typeof h.rank === 'number' && Array.isArray(h.tiebreak)) return h;
    return evaluatePoker3(h);
  }

  function compareHands(a, b) {
    var ea = toEval(a);
    var eb = toEval(b);
    if (ea.rank < eb.rank) return 1;
    if (ea.rank > eb.rank) return -1;
    var ta = ea.tiebreak || [];
    var tb = eb.tiebreak || [];
    var n = Math.max(ta.length, tb.length);
    for (var i = 0; i < n; i++) {
      var va = ta[i] || 0;
      var vb = tb[i] || 0;
      if (va > vb) return 1;
      if (va < vb) return -1;
    }
    // final tiebreak: suit order of highest card (S>H>D>C)
    // BUGFIX: previously returned 0 (tie) — now compares best suit when raw cards given.
    try {
      var ca = Array.isArray(a) ? a : null;
      var cb = Array.isArray(b) ? b : null;
      if (ca && cb && ca.length === 3 && cb.length === 3) {
        var key = function (c) { return (cardValue(c.rank) * 10) + (SUIT_ORDER[c.suit] || 0); };
        var sa = ca.map(key).sort(function (x, y) { return y - x; });
        var sb = cb.map(key).sort(function (x, y) { return y - x; });
        for (var k = 0; k < 3; k++) {
          if (sa[k] > sb[k]) return 1;
          if (sa[k] < sb[k]) return -1;
        }
      }
    } catch (e) {}
    return 0;
  }

  // ---------------- Rummy ----------------
  // Finds sets (3+ same rank) and runs (3+ same-suit consecutive, A low or high).
  // Returns { groups:[{type:'set'|'run', cards:[]}], remaining:[], deadwood:number }
  function evaluateRummy(cards) {
    cards = (cards || []).slice();
    var groups = [];
    var used = {};
    function mark(c) { used[c.id] = true; }

    // 1) sets: group by rank
    var byRank = {};
    cards.forEach(function (c) {
      (byRank[c.rank] = byRank[c.rank] || []).push(c);
    });
    Object.keys(byRank).forEach(function (rank) {
      var pile = byRank[rank].filter(function (c) { return !used[c.id]; });
      if (pile.length >= 3) {
        // cap sets at 4 (one per suit); extras stay in hand
        var set = pile.slice(0, 4);
        set.forEach(mark);
        groups.push({ type: 'set', cards: set });
      }
    });

    // 2) runs: group remaining by suit, sort, find 3+ consecutive
    var bySuit = {};
    cards.forEach(function (c) {
      if (used[c.id]) return;
      (bySuit[c.suit] = bySuit[c.suit] || []).push(c);
    });
    Object.keys(bySuit).forEach(function (suit) {
      var pile = bySuit[suit].slice().sort(function (a, b) { return cardValue(a.rank) - cardValue(b.rank); });
      // handle Ace-high run (Q-K-A): treat A as 15 for detection
      var run = [];
      var prev = -100;
      for (var i = 0; i < pile.length; i++) {
        var v = cardValue(pile[i].rank);
        if (v === prev + 1) { run.push(pile[i]); }
        else if (v === prev) { /* duplicate rank same suit — skip */ }
        else {
          if (run.length >= 3) { run.forEach(mark); groups.push({ type: 'run', cards: run.slice() }); }
          run = [pile[i]];
        }
        prev = v;
      }
      if (run.length >= 3) { run.forEach(mark); groups.push({ type: 'run', cards: run.slice() }); }
      // Q-K-A special: if no run found but Q,K,A present (unused), meld them
      var hasQ = pile.some(function (c) { return c.rank === 'Q' && !used[c.id]; });
      var hasK = pile.some(function (c) { return c.rank === 'K' && !used[c.id]; });
      var hasA = pile.some(function (c) { return c.rank === 'A' && !used[c.id]; });
      if (hasQ && hasK && hasA) {
        var qa = pile.filter(function (c) { return (c.rank === 'Q' || c.rank === 'K' || c.rank === 'A') && !used[c.id]; }).slice(0, 3);
        if (qa.length === 3) { qa.forEach(mark); groups.push({ type: 'run', cards: qa }); }
      }
    });

    var remaining = cards.filter(function (c) { return !used[c.id]; });
    var deadwood = remaining.reduce(function (sum, c) { return sum + phalasValue(c.rank); }, 0);
    return { groups: groups, remaining: remaining, deadwood: deadwood };
  }

  // ---------------- Phalas ----------------
  // J=0, Q=10, K=10, A=1, numbers face value.
  function handTotalPhalas(cards) {
    return (cards || []).reduce(function (sum, c) {
      return sum + phalasValue(c.rank);
    }, 0);
  }

  // ---------------- cardHTML ----------------
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // cardHTML(card, faceDown) -> div string, red/black, unicode suit
  function cardHTML(card, faceDown) {
    if (faceDown) {
      return '<div class="lb-card lb-face-down" aria-label="Face down card">' +
        '<div class="lb-card-back">🐒</div></div>';
    }
    var sym = SUIT_SYMBOL[card.suit] || card.suit;
    var red = (card.suit === 'H' || card.suit === 'D');
    return '<div class="lb-card ' + (red ? 'lb-red' : 'lb-black') + '" data-card="' + esc(card.id || '') + '">' +
      '<div class="lb-corner lb-tl"><span class="lb-rank">' + esc(card.rank) + '</span>' +
      '<span class="lb-suit">' + sym + '</span></div>' +
      '<div class="lb-pip">' + sym + '</div>' +
      '<div class="lb-corner lb-br"><span class="lb-rank">' + esc(card.rank) + '</span>' +
      '<span class="lb-suit">' + sym + '</span></div></div>';
  }

  window.DeckLib = {
    RANKS: RANKS,
    SUITS: SUITS,
    SUIT_SYMBOL: SUIT_SYMBOL,
    SUIT_ORDER: SUIT_ORDER,
    Deck: Deck,
    cardValue: cardValue,
    phalasValue: phalasValue,
    suitOrder: function (suit) { return SUIT_ORDER[suit] || 0; },
    evaluatePoker3: evaluatePoker3,
    compareHands: compareHands,
    evaluateRummy: evaluateRummy,
    handTotalPhalas: handTotalPhalas,
    cardHTML: cardHTML
  };
})();
