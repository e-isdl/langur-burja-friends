import { h, $, icon, initials, fmt, cls, delegateTap } from './dom.js';
import { S, isHost, player, gameInfo } from './state.js';
import { send } from './net.js';
import { Sound } from './sound.js';
import { toast, sheet, color, openKhata, openRules, openSettings, rosterRail } from './ui.js';
import { emblem } from './emblems.js';

const link = () => location.origin + '/r/' + S.room.code;
// Clipboard API needs a secure context (localhost/https). LAN http:// gets
// the textarea fallback, and if that fails too the link is shown copyable.
export async function copyLink() {
  const url = link();
  try { await navigator.clipboard.writeText(url); return toast('Link copied'); } catch (_) {}
  try {
    const ta = document.createElement('textarea');
    ta.value = url; ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta); ta.select();
    if (document.execCommand('copy')) { ta.remove(); return toast('Link copied'); }
    ta.remove();
  } catch (_) {}
  sheet('Invite link', h('div', { style: { textAlign: 'center' } },
    h('p', { style: { color: 'var(--muted)', marginBottom: '10px' } }, 'Copy this link and send it to friends.'),
    h('input', { class: 'in code', value: url, readonly: true, style: { width: '100%' }, onclick: (e) => e.target.select() })));
}
export function openInvite() {
  const text = `Join my table on Langur Burja & Friends. Code ${S.room.code}\n${link()}`;
  const body = h('div', { style: { textAlign: 'center' } },
    h('div', { class: 'codechip', style: { display: 'inline-flex', margin: '4px 0 14px', transform: 'rotate(-1deg)' } }, h('div', null, h('small', null, 'Table code'), h('b', null, S.room.code))),
    h('p', { style: { color: 'var(--muted)', marginBottom: '16px' } }, 'Send the link. Friends tap it, type a name, and they are in. No sign up.'),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
      h('a', { class: 'btn primary wide', style: { textDecoration: 'none' }, href: 'https://wa.me/?text=' + encodeURIComponent(text), target: '_blank', rel: 'noopener' }, icon('wa'), 'Send on WhatsApp'),
      h('button', { class: 'btn wide', onclick: () => copyLink() }, icon('copy'), 'Copy link'),
      navigator.share ? h('button', { class: 'btn wide', onclick: () => navigator.share({ title: 'Langur Burja & Friends', text, url: link() }).catch(() => {}) }, icon('share'), 'More options') : null));
  sheet('Invite friends', body);
}

function seatPositions(k) {
  if (k <= 5) return Array.from({ length: k }, (_, i) => ({ x: 12 + 76 * (i + 0.5) / k, y: 30 + 26 * Math.sin(Math.PI * (i + 0.5) / k) * 0 + (k > 3 ? 4 : 0) }));
  const top = Math.ceil(k / 2), bot = k - top; const out = [];
  for (let i = 0; i < top; i++) out.push({ x: 10 + 80 * (i + 0.5) / top, y: 22 });
  for (let i = 0; i < bot; i++) out.push({ x: 10 + 80 * (i + 0.5) / bot, y: 72 });
  return out;
}

export function renderLobby(container) {
  const R = S.room; if (!R) return;
  const host = isHost();
  const ps = R.players.filter((p) => !p.left);
  const pick = R.pick || { game: S.catalog[0] && S.catalog[0].id, opts: {} };
  const g = gameInfo(pick.game) || S.catalog[0];
  if (!g) { container.replaceChildren(h('div', { class: 'waiting' }, 'Loading games\u2026')); return; }
  const unit = pick.opts && pick.opts.unit ? pick.opts.unit : (g.units ? g.units[Math.min(1, g.units.length - 1)] : null);
  const bots = ps.filter((p) => p.bot).length;
  const needBots = Math.max(0, g.min - ps.length);
  const tooMany = ps.length > g.max;

  const shown = Math.max(ps.length + (host && ps.length < 8 ? 1 : 0), 2);
  const pos = seatPositions(Math.min(shown, 8));
  const seatEls = ps.map((p, i) => h('div', { class: 'seat', 'data-tap': 1, 'data-key': 'seat:' + p.pid, style: { '--x': pos[i].x, '--y': pos[i].y, '--c': color(p) } },
    h('div', { class: 'av' }, h('span', null, initials(p.name)), p.pid === R.hostPid ? h('div', { class: 'badge' }, icon('crown')) : (p.bot ? h('div', { class: 'badge bot' }, icon('bot')) : null)),
    h('div', { class: 'nm' }, p.pid === S.pid ? p.name + ' (you)' : p.name),
    h('div', { class: 'kh num ' + cls(p.khata) }, p.bot ? 'bot' : (fmt(p.khata) || '0')),
    !p.bot && !p.online ? h('div', { class: 'tag' }, 'offline') : null));
  if (ps.length < 8 && pos[ps.length]) {
    seatEls.push(h('div', { class: 'seat empty-seat', 'data-tap': 1, 'data-key': 'addseat', style: { '--x': pos[ps.length].x, '--y': pos[ps.length].y } },
      h('div', { class: 'av' }, icon('plus')), h('div', { class: 'nm' }, host ? 'Add a bot' : 'Invite')));
  }
  const seatsEl = h('div', { class: 'seats' + (ps.length >= 5 ? ' dense' : '') }, seatEls);

  const center = h('div', { class: 'center' },
    h('div', { html: emblem(g.id).replace('class="emb"', 'class="emb" style="width:64px;height:64px"') }),
    h('div', { class: 'big' }, g.name),
    h('div', { class: 'small' }, tooMany ? `Too many players. ${g.name} seats ${g.max}.` : `${ps.length} at the table${needBots ? `, ${needBots} bot${needBots > 1 ? 's' : ''} will join` : ''}`));
  if (tooMany) center.lastChild.style.color = '#e88a7a';

  const handlers = {};
  const tiles = S.catalog.map((c) => h('button', { class: 'tile' + (c.id === g.id ? ' on' : ''), 'data-tap': 1, 'data-key': 'tile:' + c.id, 'aria-pressed': c.id === g.id },
    h('div', { html: emblem(c.id) }), h('b', null, c.name), h('small', null, c.min === c.max ? c.min + ' players' : c.min + ' to ' + c.max)));

  const unitEls = g.units ? g.units.map((u) => h('button', { class: 'u' + (u === unit ? ' on' : ''), 'data-tap': 1, 'data-key': 'unit:' + u, disabled: !host || null }, u)) : [];
  const info = h('div', { class: 'pickinfo' },
    h('div', { class: 'txt' }, h('b', null, g.name), h('p', null, g.blurb)),
    g.units ? h('div', { class: 'units', title: 'Stake per point / boot' }, unitEls) : null,
    h('button', { class: 'icon-btn', 'data-tap': 1, 'data-key': 'rules', 'aria-label': 'How to play' }, icon('info')));

  const dealBtn = host
    ? h('button', { class: 'btn primary wide', 'data-tap': 1, 'data-key': 'deal', disabled: tooMany || null }, 'Deal ' + g.name)
    : h('div', { class: 'waiting' }, 'Waiting for ' + ((player(R.hostPid) || {}).name || 'the host') + ' to deal');

  const top = h('div', { class: 'top' },
    h('button', { class: 'icon-btn', 'data-tap': 1, 'data-key': 'leave', 'aria-label': 'Leave table' }, icon('back')),
    h('button', { class: 'codechip', 'data-tap': 1, 'data-key': 'invite', 'aria-label': 'Invite' }, h('div', null, h('small', null, 'Table code'), h('b', null, R.code)), icon('share')),
    h('button', { class: 'icon-btn', 'data-tap': 1, 'data-key': 'khata', 'aria-label': 'Khata' }, icon('book')),
    h('button', { class: 'icon-btn', 'data-tap': 1, 'data-key': 'settings', 'aria-label': 'Settings' }, icon('vol')));

  const rail = rosterRail({ onInvite: () => openInvite(), onRules: () => openRules(g) });
  const lobby = h('div', { class: 'lobby' }, top,
    h('div', { class: 'stage' }, h('div', { class: 'mat' }), center, seatsEl),
    h('div', { class: 'panel' }, h('div', { class: 'shelf' }, tiles), info, dealBtn), rail);
  container.replaceChildren(lobby);
  const shelf = $('.shelf', lobby); const on = $('.tile.on', shelf); if (on && S.ui.shelfScroll == null) on.scrollIntoView({ inline: 'center', block: 'nearest' }); else if (S.ui.shelfScroll != null) shelf.scrollLeft = S.ui.shelfScroll;
  shelf.addEventListener('scroll', () => { S.ui.shelfScroll = shelf.scrollLeft; }, { passive: true });

  const act = {
    leave: () => { if (confirm('Leave this table?') && send({ t: 'leave' })) toast('Leaving the table'); },
    invite: () => openInvite(), khata: () => openKhata(), settings: () => openSettings(), rules: () => openRules(g),
    addseat: () => { if (host) { if (send({ t: 'addbot' })) toast('A bot joined the table'); } else openInvite(); },
    deal: () => { if (send({ t: 'start', game: g.id, opts: { unit } })) toast('Starting ' + g.name); },
  };
  delegateTap(lobby, '[data-tap]', (el) => {
    const k = el.dataset.key; Sound.tap();
    if (act[k]) return act[k]();
    if (k.startsWith('tile:')) { if (!host) return toast('Only the host picks the game'); const id = k.slice(5); const c = gameInfo(id); if (send({ t: 'pick', game: id, opts: c.units ? { unit: c.units[Math.min(1, c.units.length - 1)] } : {} })) toast('Picked ' + c.name); return; }
    if (k.startsWith('unit:')) { const u = +k.slice(5); if (send({ t: 'pick', game: g.id, opts: { unit: u } })) toast('Stake set to ' + u); return; }
    if (k.startsWith('seat:')) {
      const p = player(k.slice(5)); if (!p || !host || p.pid === S.pid) return;
      let close; const body = h('div', null, h('button', { class: 'btn danger wide', onclick: () => { close(); if (send(p.bot ? { t: 'rmbot', pid: p.pid } : { t: 'kick', pid: p.pid })) toast(p.name + ' was removed from the table'); } }, p.bot ? 'Remove ' + p.name : 'Remove ' + p.name + ' from the table'));
      close = sheet(p.name, body);
    }
  });
}
