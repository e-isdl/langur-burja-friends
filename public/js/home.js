import { h, $, icon } from './dom.js';
import { S } from './state.js';
import { net, send, setName, connect } from './net.js';
import { card } from './cards.js';
import { toast } from './ui.js';
import { Sound } from './sound.js';

export function renderHome(container) {
  const invite = S.needName || net.wantCode;
  const name = h('input', { class: 'in', placeholder: 'Your name', maxlength: 16, autocomplete: 'nickname', value: net.name || '', 'aria-label': 'Your name' });
  const code = h('input', { class: 'in code', placeholder: 'CODE', maxlength: 6, autocapitalize: 'characters', autocomplete: 'off', 'aria-label': 'Table code' });
  const need = () => { const n = name.value.trim(); if (!n) { toast('Type your name first', true); name.focus(); return null; } setName(n); return n; };
  const create = () => { const n = need(); if (!n) return; Sound.tap(); send({ t: 'create', name: n }); };
  const join = (c) => { const n = need(); if (!n) return; const cc = (c || code.value).trim().toUpperCase(); if (cc.length < 4) { toast('Enter the table code', true); code.focus(); return; } Sound.tap(); send({ t: 'join', code: cc, name: n }); };

  const fan = h('div', { class: 'fan' }, ['TS', 'QD', 'AS', 'KH', 'JC'].map((id, i) => { const c = card(id, { size: 'lg', flip: false }); c.style.setProperty('--i', i); return c; }));
  const form = invite
    ? h('div', { class: 'form' }, h('div', { class: 'who' }, 'You are joining table ', h('b', { class: 'd', style: { letterSpacing: '.14em' } }, S.needName || net.wantCode)), name,
        h('button', { class: 'btn primary wide', onclick: () => join(S.needName || net.wantCode) }, 'Take a seat'),
        h('button', { class: 'btn ghost wide sm', onclick: () => { net.wantCode = null; S.needName = null; renderHome(container); history.replaceState(null, '', '/'); } }, 'Not this table'))
    : h('div', { class: 'form' }, name,
        h('button', { class: 'btn primary wide', onclick: create }, 'Start a table'),
        h('div', { class: 'or' }, 'or join friends'),
        h('div', { class: 'joinrow' }, code, h('button', { class: 'btn', onclick: () => join() }, 'Join')));
  container.replaceChildren(h('div', { class: 'home' }, h('div', { class: 'band' }),
    h('div', { class: 'home-left' },
      h('div', { class: 'brand' }, h('h1', null, 'Langur', h('br'), 'Burja', h('em', null, '& friends')), h('div', { class: 'tag' }, 'A table for your people. Cards, bots, no sign up.')),
      form),
    h('div', { class: 'home-right' }, fan,
      h('div', { class: 'home-games' }, h('small', null, 'Seven games on the table'),
        h('div', { class: 'home-games-list' }, ['Call Break', 'Teen Patti', 'Kitti', 'Phalas', 'Jud Patti', 'Marriage', 'In-Between'].map((n) => h('span', null, n)))))));
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') (invite ? join(S.needName || net.wantCode) : create()); });
  code.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
}
