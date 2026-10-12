'use strict';
class GameError extends Error {}
const must = (cond, msg) => { if (!cond) throw new GameError(msg); };
const clone = (o) => JSON.parse(JSON.stringify(o));
const sum = (a) => a.reduce((x, y) => x + y, 0);
// Rotate seat index forward, skipping seats where skip(i) is true. Returns -1 if none.
function nextSeat(n, from, skip = () => false) {
  for (let k = 1; k <= n; k++) { const i = (from + k) % n; if (!skip(i)) return i; }
  return -1;
}
module.exports = { GameError, must, clone, sum, nextSeat };
