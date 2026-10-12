import { h } from './dom.js';
const SVGNS = 'http://www.w3.org/2000/svg';
function suit(s, cls) {
  const svg = document.createElementNS(SVGNS, 'svg'); svg.setAttribute('class', cls);
  const u = document.createElementNS(SVGNS, 'use'); u.setAttribute('href', '#s-' + s); svg.append(u); return svg;
}
export const rankLabel = (id) => (id[0] === 'T' ? '10' : id[0]);
export const SUIT_GLYPH = { S: '\u2660', H: '\u2665', D: '\u2666', C: '\u2663' };

// o: { size, sel, dim, hint, wild, good, bad, from, pt, flip, tap, key }
export function card(id, o = {}) {
  const size = o.size || 'md';
  const c = ['card', size];
  ['sel', 'dim', 'hint', 'wild', 'good', 'bad', 'tap'].forEach((k) => { if (o[k]) c.push(k); });
  const el = h('div', { class: c.join(' '), 'data-id': id, 'data-s': id[1], 'data-flip': o.flip === false ? null : (o.flipId || id), 'data-from': o.from || null, 'data-pt': o.pt != null ? o.pt : null, 'data-key': o.key || id, role: 'img', 'aria-label': rankLabel(id) + ' of ' + { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' }[id[1]] },
    h('b', { class: 'rk' + (id[0] === 'T' ? ' ten' : '') }, rankLabel(id)), suit(id[1], 's1'), suit(id[1], 's2'));
  return el;
}
let backN = 0;
export function back(o = {}) {
  return h('div', { class: 'card back ' + (o.size || 'md'), 'data-flip': o.flip ? o.flip : null, 'data-from': o.from || null });
}

// Compute a hand row that always fits the screen.
export function handMetrics(n, opts = {}) {
  const wide = innerWidth >= 900;
  const avail = Math.min(innerWidth, 900) - (opts.pad || 30);
  let cw = opts.cw || (wide ? 78 : 64);
  if (!opts.cw) { if (n > 16) cw = wide ? 56 : 42; else if (n > 12) cw = wide ? 64 : 48; else if (n > 9) cw = wide ? 70 : 56; else if (n > 7) cw = wide ? 74 : 60; }
  const step = n > 1 ? Math.min(cw * 0.86, (avail - cw) / (n - 1)) : 0;
  return { cw, ov: n > 1 ? Math.round(step - cw) : 0 };
}
export function handRow(ids, o = {}) {
  const n = ids.length; const m = handMetrics(n, o);
  const el = h('div', { class: 'hand' + (o.fan === false || n > 10 ? '' : ' fan'), style: { '--hcw': m.cw + 'px', '--ov': m.ov + 'px', '--mid': (n - 1) / 2 } });
  ids.forEach((id, i) => { const c = o.make ? o.make(id, i) : card(id, { size: 'lg', tap: true }); c.style.setProperty('--i', i); el.append(c); });
  return el;
}
