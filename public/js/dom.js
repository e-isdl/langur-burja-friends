// Tiny DOM helpers + FLIP animation. No framework.
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const SVGNS = 'http://www.w3.org/2000/svg';

export function h(tag, attrs, ...kids) {
  const svg = tag === 'svg' || tag.startsWith('svg:');
  const el = svg ? document.createElementNS(SVGNS, tag.replace('svg:', '')) : document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'style' && typeof v === 'object') for (const s in v) el.style.setProperty(s, v[s]);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  add(el, kids);
  return el;
}
function add(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) add(el, k);
    else el.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
}
export const icon = (name, cls = '') => {
  const s = document.createElementNS(SVGNS, 'svg'); s.setAttribute('class', 'ic ' + cls);
  const u = document.createElementNS(SVGNS, 'use'); u.setAttribute('href', '#i-' + name); s.append(u); return s;
};

// Tap that survives re-rendering: matches by data-id/data attributes rather than node identity.
export function delegateTap(root, selector, fn) {
  let down = null;
  root.addEventListener('pointerdown', (e) => {
    const t = e.target.closest(selector); if (!t || !root.contains(t)) return;
    down = { key: keyOf(t), x: e.clientX, y: e.clientY, t: performance.now() };
  }, { passive: true });
  root.addEventListener('pointerup', (e) => {
    if (!down) return; const d = down; down = null;
    if (Math.abs(e.clientX - d.x) > 14 || Math.abs(e.clientY - d.y) > 14) return;
    let el = document.elementFromPoint(e.clientX, e.clientY);
    el = el && el.closest(selector);
    if (!el || !root.contains(el) || keyOf(el) !== d.key) { const alt = root.querySelector(`${selector}[data-key="${cssq(d.key)}"]`); if (!alt) return; el = alt; }
    fn(el, e);
  });
  root.addEventListener('pointercancel', () => { down = null; });
}
const keyOf = (el) => el.dataset.key || el.dataset.id || el.id || el.textContent;
const cssq = (s) => String(s).replace(/"/g, '\\"');

// FLIP: elements with data-flip glide from where they were to where they are now.
// Elements that are new can declare data-from="<anchor>" to fly in from [data-anchor="<anchor>"].
export function flipRender(root, build, opts = {}) {
  const first = new Map();
  if (!opts.skip) root.querySelectorAll('[data-flip]').forEach((el) => first.set(el.dataset.flip, el.getBoundingClientRect()));
  build();
  if (opts.skip || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const stagger = opts.stagger || 0; let n = 0;
  root.querySelectorAll('[data-flip]').forEach((el) => {
    const l = el.getBoundingClientRect(); const f = first.get(el.dataset.flip);
    if (f) {
      const dx = f.left - l.left, dy = f.top - l.top;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) el.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0 0' }], { duration: opts.dur || 340, easing: 'cubic-bezier(.22,.9,.3,1)' });
    } else if (el.dataset.from) {
      const a = root.querySelector(`[data-anchor="${el.dataset.from}"]`) || document.querySelector(`[data-anchor="${el.dataset.from}"]`);
      if (a) {
        const r = a.getBoundingClientRect();
        const dx = r.left + r.width / 2 - (l.left + l.width / 2), dy = r.top + r.height / 2 - (l.top + l.height / 2);
        el.animate([{ translate: `${dx}px ${dy}px`, scale: '.5', opacity: 0.2 }, { translate: '0 0', scale: '1', opacity: 1 }], { duration: (opts.dur || 380) + 0, delay: (n++) * stagger, easing: 'cubic-bezier(.22,.9,.3,1)', fill: 'backwards' });
      }
    }
  });
}

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const fmt = (n) => (n > 0 ? '+' : n < 0 ? '\u2212' : '') + Math.abs(n).toLocaleString('en-US');
export const cls = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
export const initials = (name) => (name || '?').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const PALETTE = ['#e0a526', '#c8452f', '#3aa477', '#6f8df0', '#c4488a', '#f2803a', '#3bb8c4', '#9a6be0', '#a9b93a', '#c98d5a'];
