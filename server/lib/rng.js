'use strict';
const crypto = require('crypto');

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// make() -> crypto-backed rng. make(seed) -> deterministic (tests).
function make(seed) {
  const f = seed == null ? () => crypto.randomInt(0x100000000) / 0x100000000 : mulberry32(seed);
  const rng = {
    next: f,
    int: (n) => Math.floor(f() * n),
    pick: (a) => a[Math.floor(f() * a.length)],
    chance: (p) => f() < p,
    shuffle(a) {
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(f() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
  };
  return rng;
}

module.exports = { make };
