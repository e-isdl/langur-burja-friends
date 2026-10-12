import { h, $, icon, initials, fmt, cls, PALETTE } from './dom.js';
import { S, me, isHost } from './state.js';
import { Sound } from './sound.js';
import { send } from './net.js';

export function toast(msg, bad = false) {
  let box = $('.toasts'); if (!box) { box = h('div', { class: 'toasts' }); document.body.append(box); }
  if ([...box.children].some((c) => c.textContent === msg && !c.classList.contains('out'))) return;
  const t = h('div', { class: 'toast' + (bad ? ' bad' : '') }, msg); box.append(t);
  if (bad) Sound.error();
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 260); }, 2600);
}

export function sheet(title, body, { onClose } = {}) {
  const layer = $('#layer');
  const scrim = h('div', { class: 'scrim' });
  const close = () => { scrim.remove(); box.remove(); onClose && onClose(); };
  scrim.addEventListener('click', close);
  const box = h('div', { class: 'sheet', role: 'dialog' }, h('div', { class: 'grab' }), title ? h('h2', null, title) : null, body);
  layer.append(scrim, box);
  return close;
}

export const color = (p) => PALETTE[(p && p.color != null ? p.color : 0) % PALETTE.length];
export function avatar(p, size) {
  return h('div', { class: 'av', style: { '--c': color(p) } }, h('span', null, initials(p ? p.name : '?')));
}
export function ringEl(durMs, elapsedMs) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'ring'); svg.setAttribute('viewBox', '0 0 48 48');
  const bg = document.createElementNS(svg.namespaceURI, 'circle'); bg.setAttribute('class', 'bg'); bg.setAttribute('cx', 24); bg.setAttribute('cy', 24); bg.setAttribute('r', 21.5); bg.setAttribute('pathLength', 100);
  const c = document.createElementNS(svg.namespaceURI, 'circle'); c.setAttribute('cx', 24); c.setAttribute('cy', 24); c.setAttribute('r', 21.5); c.setAttribute('pathLength', 100);
  svg.style.setProperty('--dur', durMs + 'ms'); svg.style.setProperty('--delay', -elapsedMs + 'ms');
  svg.append(bg, c); return svg;
}

export function confetti(n = 70) {
  const box = h('div', { class: 'confetti' });
  const cols = ['#e3b657', '#c8452f', '#3aa477', '#f4ecdc', '#d9a441', '#b0553a'];
  for (let i = 0; i < n; i++) {
    const p = h('i'); p.style.left = Math.random() * 100 + '%'; p.style.background = cols[i % cols.length];
    p.style.setProperty('--dx', (Math.random() * 160 - 80) + 'px'); p.style.setProperty('--rot', (Math.random() * 900 - 450) + 'deg');
    p.style.animationDuration = 1.6 + Math.random() * 1.6 + 's'; p.style.animationDelay = Math.random() * 0.4 + 's';
    p.style.width = 6 + Math.random() * 6 + 'px'; box.append(p);
  }
  document.body.append(box); setTimeout(() => box.remove(), 4200);
}

// ----- khata (ledger) -----
export function khataText() {
  const ps = S.room.players.filter((p) => !p.bot).sort((a, b) => b.khata - a.khata);
  const lines = ps.map((p) => `${p.name}: ${fmt(p.khata) || '0'}`);
  const last = ps[ps.length - 1];
  const foot = ps.length > 1 && last.khata < 0 ? `\n${last.name} buys the chiya \u2615` : '';
  return `Khata after ${S.room.hands} hands (table ${S.room.code})\n${lines.join('\n')}${foot}`;
}
export function openKhata() {
  const ps = S.room.players.filter((p) => !p.bot).sort((a, b) => b.khata - a.khata);
  const rows = ps.map((p) => h('div', { class: 'row' + (p.left ? ' left' : '') }, h('div', { class: 'av', style: { '--c': color(p) } }, initials(p.name)), h('div', { class: 'nm' }, p.name + (p.left ? ' (left)' : '')), h('div', { class: 'v num ' + cls(p.khata) }, fmt(p.khata) || '0')));
  const body = h('div', null,
    h('p', { style: { opacity: .75, marginBottom: '8px' } }, S.room.hands ? `${S.room.hands} hands played at this table. Bots are not on the ledger.` : 'Nothing on the ledger yet. Wins and losses from every game land here.'),
    h('div', { class: 'khata' }, rows),
    h('div', { style: { display: 'flex', gap: '10px' } },
      h('a', { class: 'btn primary', style: { flex: 1, textDecoration: 'none' }, href: 'https://wa.me/?text=' + encodeURIComponent(khataText()), target: '_blank', rel: 'noopener' }, icon('wa'), 'Share'),
      h('button', { class: 'btn', onclick: () => { navigator.clipboard && navigator.clipboard.writeText(khataText()); toast('Copied'); } }, icon('copy'), 'Copy')));
  sheet('Khata', body);
}

export function openRules(info) {
  if (!info) return;
  sheet(info.name, h('div', null, h('p', { style: { marginBottom: '12px', color: 'var(--muted)' } }, info.blurb), h('ul', null, (info.rules || []).map((r) => h('li', null, r)))));
}

export function openSettings() {
  const row = (label, key, desc) => {
    const b = h('button', { class: 'btn' + (S.settings[key] ? ' primary' : ''), style: { minWidth: '84px' } }, S.settings[key] ? 'On' : 'Off');
    b.onclick = () => { S.settings[key] = !S.settings[key]; b.className = 'btn' + (S.settings[key] ? ' primary' : ''); b.textContent = S.settings[key] ? 'On' : 'Off'; import('./state.js').then((m) => m.saveSettings()); window.dispatchEvent(new Event('lbf-settings')); };
    return h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0' } }, h('div', { style: { flex: 1 } }, h('b', null, label), h('div', { style: { color: 'var(--muted)', fontSize: '.85rem' } }, desc)), b);
  };
  const snd = h('button', { class: 'btn' + (!Sound.muted ? ' primary' : ''), style: { minWidth: '84px' } }, Sound.muted ? 'Off' : 'On');
  snd.onclick = () => { Sound.setMuted(!Sound.muted); snd.className = 'btn' + (!Sound.muted ? ' primary' : ''); snd.textContent = Sound.muted ? 'Off' : 'On'; if (!Sound.muted) Sound.tap(); window.dispatchEvent(new Event('lbf-settings')); };
  sheet('Settings', h('div', null,
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0' } }, h('div', { style: { flex: 1 } }, h('b', null, 'Sound'), h('div', { style: { color: 'var(--muted)', fontSize: '.85rem' } }, 'Card snaps, chips, chimes')), snd),
    row('Four-colour suits', 'fourColor', 'Diamonds blue, clubs green. Easier to read fast.'),
    row('Hand hints', 'hints', 'Show hand names and what you can do')));
}

const REACTS = [['fire', '\uD83D\uDD25'], ['clap', '\uD83D\uDC4F'], ['haha', '\uD83D\uDE02'], ['oh', '\uD83D\uDE2E'], ['sad', '\uD83D\uDE22'], ['chiya', '\u2615'], ['jaldi', '\u23F0']];
export const REACT_EMOJI = Object.fromEntries(REACTS);
export function reactBar(anchor) {
  const bar = h('div', { class: 'reactbar' }, REACTS.map(([k, e]) => h('button', { onclick: () => { send({ t: 'react', e: k }); bar.remove(); } }, e)));
  anchor.append(bar);
  const off = (ev) => { if (!bar.contains(ev.target)) { bar.remove(); document.removeEventListener('pointerdown', off, true); } };
  setTimeout(() => document.addEventListener('pointerdown', off, true), 0);
}

// ----- desktop side rail: persistent roster + khata + quick actions, shown only on wide screens (CSS) -----
export function rosterRail(opts) {
  const R = S.room; if (!R) return h('div', { class: 'rail' });
  const ps = R.players.filter((p) => !p.left);
  const rows = ps.map((p) => {
    const acting = opts.actingPid === p.pid;
    return h('div', { class: 'rr-row' + (acting ? ' acting' : '') + (p.pid === S.pid ? ' me' : '') },
      h('div', { class: 'av', style: { '--c': color(p) } }, initials(p.name), p.pid === R.hostPid ? h('div', { class: 'rr-crown' }, icon('crown')) : null),
      h('div', { class: 'rr-txt' }, h('div', { class: 'rr-nm' }, p.name), h('div', { class: 'rr-sub' }, p.bot ? 'Bot' : (p.online ? (acting ? 'Playing now' : 'Online') : 'Offline'))),
      h('div', { class: 'rr-kh num ' + cls(p.khata) }, p.bot ? '' : (fmt(p.khata) || '0')));
  });
  const quick = (label, ic, fn) => h('button', { class: 'rr-quick', onclick: fn }, icon(ic), label);
  return h('div', { class: 'rail' },
    h('div', { class: 'rr-head' }, h('b', null, 'At the table'), h('span', null, ps.filter((p) => !p.bot).length + ' friends')),
    h('div', { class: 'rr-list' }, rows),
    h('div', { class: 'rr-quicks' },
      quick('Invite', 'share', () => opts.onInvite ? opts.onInvite() : null),
      quick('Khata', 'book', () => openKhata()),
      opts.onRules ? quick('Rules', 'info', opts.onRules) : null,
      quick('Settings', 'vol', () => openSettings())));
}
