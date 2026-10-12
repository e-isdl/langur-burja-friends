import { h, $, icon, flipRender, delegateTap, initials, fmt, cls } from './dom.js';
import { S, me, player, isHost, gameInfo } from './state.js';
import { send } from './net.js';
import { Sound } from './sound.js';
import { toast, sheet, color, ringEl, confetti, openKhata, openRules, openSettings, reactBar, REACT_EMOJI, rosterRail } from './ui.js';
import { back as backCard } from './cards.js';
import { openInvite } from './lobby.js';

export const games = {};
export const registerGame = (id, mod) => { games[id] = mod; };

let root = null, last = null, lastHand = -1, handlers = {}, bubbles = {}, resultShown = -1, wasMyTurn = false, mounted = false, dealAnimHand = -1;
let feed = [], feedTimer = null;

export function mountTable(container) {
  root = h('div', { class: 'tbl' }); container.replaceChildren(root); mounted = true;
  delegateTap(root, '[data-tap]', (el) => { const fn = handlers[el.dataset.key]; if (fn) { Sound.tap(); fn(el); } });
  window.addEventListener('lbf-settings', rerender);
}
export function unmountTable() { mounted = false; root = null; last = null; lastHand = -1; feed = []; clearTimeout(feedTimer); window.removeEventListener('lbf-settings', rerender); }
export const tableMounted = () => mounted;
function rerender() { if (mounted && last) updateTable(last, true); }

export function showBubble(pid, e) { bubbles[pid] = { e, t: Date.now() }; if (mounted && last) updateTable(last, true); Sound.react(); }

function makeCtx(msg) {
  const seat = msg.seat;
  const ctx = {
    msg, v: msg.v, seat, n: msg.seatPids.length, actors: msg.actors, spectator: seat < 0, myTurn: seat >= 0 && msg.actors.includes(seat),
    result: msg.result, info: gameInfo(msg.g), ui: S.ui, hints: S.settings.hints,
    pl: (i) => player(msg.seatPids[i]),
    act: (a) => { if (send({ t: 'act', a })) { const t = actToast(a); if (t) toast(t); } },
    toast, rerender: () => updateTable(last, true),
    tap(key, fn) { handlers[key] = fn; return key; },
    btn(label, key, fn, kind = '', extra = {}) {
      handlers[key] = fn;
      return h('button', Object.assign({ class: 'btn ' + kind, 'data-tap': 1, 'data-key': key, disabled: extra.disabled || null }, extra.attrs || {}), extra.icon ? icon(extra.icon) : null, label);
    },
    elapsed: msg.deadline ? Math.max(0, msg.turnMs - Math.max(0, msg.deadline - msg.now)) : 0,
  };
  return ctx;
}

// Seat layout: opponents on an arc across the top, me in the dock.
function seatPos(k, m) {
  const t = (k + 0.5) / m, th = Math.PI - t * Math.PI;
  const wide = innerWidth >= 900;
  return { x: 50 + (wide ? 41 : 40) * Math.cos(th), y: (wide ? 66 : 64) - (wide ? 52 : 46) * Math.sin(th) };
}

function buildSeat(ctx, out, i, pos) {
  const p = ctx.pl(i); const info = (out.seatInfo && out.seatInfo(i)) || {};
  const acting = ctx.actors.includes(i) && !ctx.result;
  const away = p && !p.bot && (p.auto || !p.online);
  const b = bubbles[p && p.pid]; const live = b && Date.now() - b.t < 2400;
  const el = h('div', { class: ['seat', acting ? 'acting' : '', info.out ? 'out' : '', away ? 'away' : '', info.win ? 'win' : '', info.cls || ''].join(' '), 'data-anchor': 'seat-' + i, 'data-pid': p && p.pid, style: { '--x': pos.x, '--y': pos.y, '--c': color(p) } },
    h('div', { class: 'av' }, acting && ctx.msg.deadline && p && !p.bot ? ringEl(ctx.msg.turnMs, ctx.elapsed) : (acting ? ringEl(0, 0) : null), h('span', null, initials(p ? p.name : '?')),
      p && p.bot ? h('div', { class: 'badge bot' }, icon('bot')) : null,
      out.dealer === i ? h('div', { class: 'badge dealer' }, 'D') : null),
    h('div', { class: 'nm' }, p ? p.name : '?'),
    h('div', { class: 'kh num ' + cls(p ? p.khata : 0) }, p && !p.bot ? (fmt(p.khata) || '0') : 'bot'),
    info.cards ? h('div', { class: 'cards' }, Array.from({ length: Math.min(info.cards, 9) }, () => backCard({ size: 'mini' }))) : null,
    h('div', { class: 'tag ' + (info.tagCls || '') }, info.tag || ''),
    live ? h('div', { class: 'bubble', style: { 'animation-delay': -(Date.now() - b.t) + 'ms' } }, REACT_EMOJI[b.e] || '') : null);
  return el;
}

function meRow(ctx, out) {
  const p = ctx.pl(ctx.seat); if (!p) return null;
  const acting = ctx.myTurn && !ctx.result;
  const b = bubbles[p.pid]; const live = b && Date.now() - b.t < 2400;
  return h('div', { class: 'me-row' + (acting ? ' acting' : '') },
    h('div', { class: 'av', style: { '--c': color(p), position: 'relative' } }, acting && ctx.msg.deadline ? ringEl(ctx.msg.turnMs, ctx.elapsed) : null, h('span', null, initials(p.name)),
      live ? h('div', { class: 'bubble', style: { 'animation-delay': -(Date.now() - b.t) + 'ms', top: '-8px' } }, REACT_EMOJI[b.e] || '') : null),
    h('div', null, h('div', { class: 'nm' }, p.name), h('div', { class: 'kh num ' + cls(p.khata) }, 'Khata ' + (fmt(p.khata) || '0'))),
    h('div', { class: 'grow' }),
    acting ? h('div', { class: 'hint' }, out.hint || 'Your turn') : (out.idle ? h('div', { class: 'hint calm' }, out.idle) : null),
    h('button', { class: 'icon-btn', 'data-tap': 1, 'data-key': 'react', 'aria-label': 'React' }, icon('smile')));
}

function resultCard(ctx, out) {
  const r = ctx.result, v = ctx.v; const md = ctx.seat >= 0 ? r.deltas[ctx.seat] : 0;
  const title = out.resultTitle || (ctx.spectator ? 'Hand over' : md > 0 ? 'You won ' + md : md < 0 ? 'You lost ' + Math.abs(md) : 'All square');
  const rows = r.deltas.map((d, i) => ({ i, d })).sort((a, b) => b.d - a.d).map(({ i, d }) => {
    const p = ctx.pl(i); const ex = out.resultRow ? out.resultRow(i) : null;
    return h('div', { class: 'row' + (i === ctx.seat ? ' me' : '') + (out.winners && out.winners.includes(i) ? ' won' : '') }, h('div', { class: 'av', style: { '--c': color(p) } }, initials(p ? p.name : '?')),
      h('div', { class: 'nm' }, p ? p.name : '?', ex && ex.text ? h('div', { class: 'extra' }, ex.text) : null),
      ex && ex.cards ? h('div', { class: 'cards' }, ex.cards) : null,
      h('div', { class: 'dl num ' + cls(d) }, d === 0 ? (r.final || out.showZero ? '0' : '') : fmt(d)),
      ex && ex.node ? h('div', { class: 'blk' }, ex.node) : null);
  });
  const foot = h('div', { class: 'foot' }, h('div', { class: 'bar', style: { '--dur': r.nextIn + 'ms', '--delay': '0ms' } }, h('i')),
    r.final ? h('span', { style: { color: 'var(--muted)', fontSize: '.85rem' } }, 'Back to the lobby soon') : (isHost() ? ctx.btn('Deal now', 'next', () => { if (send({ t: 'next' })) toast('Dealing the next hand'); }, 'primary sm') : h('span', { style: { color: 'var(--muted)', fontSize: '.85rem' } }, 'Next hand starting')));
  return h('div', { class: 'result' }, h('h3', null, title), out.resultSub ? h('div', { class: 'sub' }, out.resultSub) : null, out.resultExtra || null, h('div', { class: 'rows' }, rows), foot);
}

const RANKS = { A: 'Ace', K: 'King', Q: 'Queen', J: 'Jack', T: '10' };
const SUITS = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
function cardLabel(id) {
  if (!id || typeof id !== 'string') return 'a card';
  const r = RANKS[id.slice(0, -1)] || id.slice(0, -1), s = SUITS[id.slice(-1)];
  return s ? `${r} of ${s}` : r;
}
function actToast(a) {
  switch (a && a.t) {
    case 'play': return a.card ? `You played the ${cardLabel(a.card)}` : null;
    case 'chaal': return 'You bet';
    case 'raise': return 'You raised the stake';
    case 'pack': return 'You packed';
    case 'see': return 'You looked at your cards';
    case 'show': return 'You asked for a show';
    case 'sideshow': return 'You asked for a side show';
    case 'ss': return a.ok ? 'You accepted the side show' : 'You declined the side show';
    case 'bid': return `You called ${a.n}`;
    case 'bet': return a.amt > 0 ? `You bet ${fmt(a.amt)}` : 'You passed';
    case 'draw': return a.from === 'discard' || a.from === 'pile' ? 'You picked from the pile' : 'You drew a card';
    case 'discard': { const c = a.cards || (a.card ? [a.card] : []); return c.length > 1 ? `You laid ${c.length} cards` : 'You discarded a card'; }
    case 'meld': case 'lay': { const c = a.cards || []; return c.length > 1 ? `You laid ${c.length} cards` : 'You laid down your cards'; }
    case 'lock': return 'You locked your cards';
    case 'unlock': return 'You unlocked your cards';
    case 'auto': return 'You auto-arranged your cards';
    case 'swap': return 'You swapped two cards';
    case 'ace': return a.v === 'hi' ? 'You chose ace high' : 'You chose ace low';
    case 'declare': return 'You declared';
    default: return null;
  }
}
function feedText(e, ctx) {
  const nm = (i) => { const p = i != null && i >= 0 ? ctx.pl(i) : null; return p ? p.name : 'Someone'; };
  const mine = (i) => i != null && i === ctx.seat;
  switch (e.k) {
    case 'bid': return mine(e.seat) ? null : `${nm(e.seat)} called ${e.n}`;
    case 'play': return !e.card || mine(e.seat) ? null : `${nm(e.seat)} played the ${cardLabel(e.card)}`;
    case 'trick': return e.winner === ctx.seat ? 'You took the trick' : `${nm(e.winner)} took the trick`;
    case 'bet': return mine(e.seat) ? null : (e.amt > 0 ? `${nm(e.seat)} bet ${fmt(e.amt)}` : `${nm(e.seat)} is in`);
    case 'raise': return mine(e.seat) ? null : `${nm(e.seat)} raised the stake`;
    case 'pack': return mine(e.seat) ? null : `${nm(e.seat)} packed`;
    case 'see': return mine(e.seat) ? null : `${nm(e.seat)} looked at their cards`;
    case 'show': return mine(e.seat) ? null : `${nm(e.seat)} asked for a show`;
    case 'ss': return mine(e.from) || mine(e.to) ? null : `${nm(e.from)} asked ${nm(e.to)} for a side show${e.ok === false ? ', declined' : ''}`;
    case 'draw': return mine(e.seat) ? null : `${nm(e.seat)} drew a card`;
    case 'discard': return mine(e.seat) ? null : (e.n > 1 ? `${nm(e.seat)} laid ${e.n} cards` : `${nm(e.seat)} discarded a card`);
    case 'meld': return mine(e.seat) ? null : `${nm(e.seat)} laid down a set`;
    case 'lock': return mine(e.seat) ? null : `${nm(e.seat)} locked their cards`;
    case 'undo': return mine(e.seat) ? null : `${nm(e.seat)} took their bet back`;
    case 'win': return mine(e.seat) ? null : `${nm(e.seat)} wins the hand`;
    case 'deal': return 'Cards are out';
    case 'shuffle': return 'The deck is shuffled';
    case 'roll': return 'The bowl is rolling';
    case 'limit': return 'The pot hit its limit';
    case 'stalemate': return 'Nobody could finish. It is a draw';
    case 'baddeclare': return mine(e.seat) ? null : `${nm(e.seat)} could not declare yet`;
    default: return null;
  }
}
function pushFeed(evs, ctx) {
  for (const e of evs) { const t = feedText(e, ctx); if (t) feed.push({ t, at: Date.now() }); }
  while (feed.length > 6) feed.shift();
}
function feedEl() {
  const now = Date.now();
  const live = feed.filter((x) => now - x.at < 9000).slice(-2).reverse();
  if (!live.length) return null;
  return h('div', { class: 'feed' }, live.map((x) => h('div', { class: 'fl', style: { animationDelay: Math.max(-400, -(now - x.at)) + 'ms' } }, x.t)));
}

function eventsSound(evs, out) {
  if (out.onEvents && out.onEvents(evs) === false) return;
  const seen = new Set();
  for (const e of evs) {
    const k = e.k; if (seen.has(k)) continue; seen.add(k);
    if (k === 'deal') Sound.deal();
    else if (['play', 'discard', 'draw', 'trick', 'pile', 'lay', 'meld'].includes(k)) Sound.card();
    else if (['bet', 'raise', 'ante', 'chip', 'pay'].includes(k)) Sound.chip();
    else if (['bid', 'see', 'show', 'ss', 'pack', 'lock'].includes(k)) Sound.tap();
    else if (k === 'roll') Sound.dice();
    else if (k === 'shuffle') Sound.shuffle();
  }
}

export function updateTable(msg, quiet = false) {
  if (!mounted) return;
  const game = games[msg.g]; if (!game) { root.replaceChildren(h('div', { class: 'waiting' }, 'This game is not available in this build.')); return; }
  if (msg.hand !== lastHand) { S.ui = {}; lastHand = msg.hand; resultShown = -1; feed = []; }
  const prev = last; last = msg; handlers = {};
  const ctx = makeCtx(msg); ctx.ui = S.ui;
  if (!quiet && msg.evs && msg.evs.length) pushFeed(msg.evs, ctx);
  const out = game.build(ctx);
  handlers.react = () => { const dock = $('.dock', root); dock && reactBar(dock); };
  handlers.menu = () => openMenu(ctx);
  handlers.khata = () => openKhata();

  // opponents
  const seatIdx = []; for (let k = 1; k < ctx.n; k++) seatIdx.push(ctx.seat >= 0 ? (ctx.seat + k) % ctx.n : k - 1);
  if (ctx.seat < 0) seatIdx.push(ctx.n - 1);
  const m = seatIdx.length;
  const seatsEl = h('div', { class: 'seats' + (m >= 5 ? ' dense' : '') }, seatIdx.map((i, k) => buildSeat(ctx, out, i, seatPos(k, m))));
  const center = h('div', { class: 'center' }, out.center);
  const stage = h('div', { class: 'stage' }, h('div', { class: 'mat' }), center, seatsEl);
  const g = ctx.info;
  const tbar = h('div', { class: 'tbar' },
    h('button', { class: 'icon-btn', 'data-tap': 1, 'data-key': 'menu', 'aria-label': 'Menu' }, icon('back')),
    h('div', { class: 'ttl' }, h('b', null, g ? g.name : msg.g), h('small', null, out.subtitle || ('Hand ' + msg.hand))),
    h('button', { class: 'icon-btn', 'data-tap': 1, 'data-key': 'khata', 'aria-label': 'Khata' }, icon('book')));
  const meP = ctx.pl(ctx.seat);
  if (out.hand && msg.hand !== dealAnimHand) { out.hand.classList.add('deal-in'); }
  dealAnimHand = msg.hand;
  const dock = h('div', { class: 'dock' },
    feedEl(),
    meP && meP.auto && !ctx.result ? h('div', { class: 'autopilot' }, 'Autopilot is playing for you. Make any move to take over.') : null,
    ctx.spectator ? spectatorBar(ctx) : meRow(ctx, out),
    out.hand || null,
    out.actions ? h('div', { class: 'actions' }, out.actions) : null);
  const result = ctx.result ? resultCard(ctx, out) : null;
  const actingPid = ctx.actors.length === 1 && !ctx.result ? (ctx.pl(ctx.actors[0]) || {}).pid : null;
  const rail = rosterRail({ actingPid, onInvite: () => openInvite(), onRules: () => openRules(g) });

  flipRender(root, () => root.replaceChildren(...[tbar, stage, dock, rail, result].filter(Boolean)));

  clearTimeout(feedTimer);
  if (feed.length) feedTimer = setTimeout(() => rerender(), 9100);

  if (!quiet) {
    if (msg.evs && msg.evs.length) eventsSound(msg.evs, out);
    const mine = ctx.myTurn && !ctx.result;
    if (mine && !wasMyTurn) { Sound.turn(); Sound.vibe(25); flashTitle(); }
    wasMyTurn = mine;
    if (ctx.result && resultShown !== msg.hand) {
      resultShown = msg.hand;
      const md = ctx.seat >= 0 ? ctx.result.deltas[ctx.seat] : 0;
      if (md > 0) { Sound.win(); confetti(); } else if (md < 0) Sound.lose();
    }
  }
}

function spectatorBar(ctx) {
  const bots = []; for (let i = 0; i < ctx.n; i++) { const p = ctx.pl(i); if (p && p.bot) bots.push(i); }
  return h('div', { class: 'me-row' }, h('div', { class: 'grow' }, h('b', null, 'You are watching'), h('div', { class: 'kh' }, bots.length ? 'Take a bot\u2019s seat to join the hand' : 'You can sit in when the next game starts')),
    bots.slice(0, 2).map((i) => ctx.btn('Sit as ' + ctx.pl(i).name, 'sit' + i, () => { if (send({ t: 'sit', seat: i })) toast('You joined the hand'); }, 'primary sm')));
}

let titleTimer = null; const baseTitle = document.title;
function flashTitle() {
  if (document.visibilityState === 'visible') return;
  clearInterval(titleTimer); let on = false;
  titleTimer = setInterval(() => { document.title = (on = !on) ? 'Your turn!' : baseTitle; if (document.visibilityState === 'visible') { clearInterval(titleTimer); document.title = baseTitle; } }, 900);
}

function openMenu(ctx) {
  let close; const item = (label, ic, fn, kind = '') => h('button', { class: 'btn wide ' + kind, style: { justifyContent: 'flex-start', marginBottom: '8px' }, onclick: () => { close(); fn(); } }, icon(ic), label);
  const body = h('div', null,
    item('How to play', 'info', () => openRules(gameInfo(ctx.msg.g))),
    item('Khata', 'book', () => openKhata()),
    item('Invite friends', 'share', () => openInvite()),
    item('Settings', 'vol', () => openSettings()),
    isHost() ? item('End table for everyone', 'x', () => { if (confirm('End the table and go back to the lobby?')) send({ t: 'end' }); }, 'danger') : null,
    item('Leave table', 'back', () => { if (confirm('Leave the table? A bot will take your seat.')) send({ t: 'leave' }); }));
  close = sheet(null, body);
}
