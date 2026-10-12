'use strict';
// 3-card hand evaluation shared by Teen Patti and Kitti.
const { rankOf, suitOf } = require('./cards');

const CAT = { HIGH: 1, PAIR: 2, COLOR: 3, SEQ: 4, PURE: 5, TRAIL: 6, KITTI: 7 };
const NAMES = { 1: 'High card', 2: 'Pair', 3: 'Color', 4: 'Sequence', 5: 'Pure sequence', 6: 'Trail', 7: 'Kitti' };

// Sequence strength: AKQ top, then A23, then KQJ ... 432. Doubled so A23 fits between.
function seqStrength(r) {
  const s = r.slice().sort((a, b) => a - b);
  if (s[0] === 0 && s[1] === 1 && s[2] === 12) return 23;          // A-2-3
  if (s[1] === s[0] + 1 && s[2] === s[1] + 1) return s[2] * 2;      // normal, AKQ = 24
  return 0;
}

function evalBrag(cards, opts = {}) {
  const r = cards.map(rankOf);
  const su = cards.map(suitOf);
  const flush = su[0] === su[1] && su[1] === su[2];
  const desc = r.slice().sort((a, b) => b - a);
  const seq = seqStrength(r);
  let cat, tb;
  if (opts.kitti && !flush && desc[0] === 3 && desc[1] === 1 && desc[2] === 0) { cat = CAT.KITTI; tb = [0, 0, 0]; } // 5,3,2
  else if (desc[0] === desc[2]) { cat = CAT.TRAIL; tb = [desc[0], 0, 0]; }
  else if (seq && flush) { cat = CAT.PURE; tb = [seq, 0, 0]; }
  else if (seq) { cat = CAT.SEQ; tb = [seq, 0, 0]; }
  else if (flush) { cat = CAT.COLOR; tb = desc; }
  else if (desc[0] === desc[1] || desc[1] === desc[2]) {
    const pair = desc[1]; const kick = desc[0] === desc[1] ? desc[2] : desc[0];
    cat = CAT.PAIR; tb = [pair, kick, 0];
  } else { cat = CAT.HIGH; tb = desc; }
  return { cat, val: cat * 1e6 + tb[0] * 1e4 + tb[1] * 100 + tb[2], name: NAMES[cat] };
}

module.exports = { CAT, NAMES, evalBrag };
