import { h, icon } from '../dom.js';
import { card } from '../cards.js';

const miniRow = (ids, won) => h('div', { class: 'kmini' + (won ? ' won' : '') }, ids.map((c) => card(c, { size: 'mini', flip: false })));

export default {
  build(ctx) {
    const v = ctx.v, ui = ctx.ui, me = ctx.seat;
    const locked = me >= 0 && v.locked[me];
    let center, actions = null, hint = null;
    if (v.phase === 'arrange' && v.me) {
      const grid = h('div', { class: 'kgrid' }, v.me.rows.map((row, ri) => h('div', { class: 'krow' },
        h('div', { class: 'klab' }, h('b', null, 'Brag ' + (ri + 1)), ctx.hints ? h('small', null, v.me.labels[ri]) : null),
        h('div', { class: 'kcards' }, row.map((id, ci) => {
          const idx = ri * 3 + ci;
          const el = card(id, { size: 'md', tap: true, sel: ui.sel === idx, dim: locked, key: 'k' + idx });
          el.setAttribute('data-tap', 1); el.setAttribute('data-key', 'k:' + idx);
          ctx.tap('k:' + idx, () => {
            if (locked) return ctx.toast('Unlock to rearrange');
            if (ui.sel == null) ui.sel = idx; else if (ui.sel === idx) ui.sel = null; else { ctx.act({ t: 'swap', a: ui.sel, b: idx }); ui.sel = null; }
            ctx.rerender();
          });
          return el;
        })))));
      center = h('div', { class: 'kwrap' },
        h('div', { class: 'pot' }, h('span', { class: 'chip o' }), h('div', null, h('small', null, v.carry ? `Pot \u00b7 ${v.carry} carried over` : 'Pot'), h('span', { class: 'num' }, v.pot))),
        grid,
        ctx.hints ? h('div', { class: 'small-note' }, 'Win two brags in a row: 1 and 2, or 2 and 3. Brag 2 counts in both, so keep your best there.') : null);
      if (locked) { hint = 'Locked in'; actions = [ctx.btn('Unlock', 'unl', () => ctx.act({ t: 'unlock' }), '')]; }
      else { hint = 'Arrange'; actions = [ctx.btn('Auto-arrange', 'auto', () => { ui.sel = null; ctx.act({ t: 'auto' }); }, '', { icon: 'wand' }), ctx.btn('Lock in', 'lock', () => ctx.act({ t: 'lock' }), 'primary')]; }
    } else {
      center = h('div', { class: 'kwrap' }, h('div', { class: 'pot' }, h('span', { class: 'chip o' }), h('div', null, h('small', null, 'Pot'), h('span', { class: 'num' }, v.pot))),
        h('div', { class: 'pill' }, v.phase === 'arrange' ? 'Waiting for the table to lock in' : 'Cards on the table'));
    }
    const ver = v.verdict; const names = (arr) => arr.map((i) => ctx.pl(i).name).join(' and ');
    let sub = null, title;
    if (ver) {
      if (ver.instant != null) sub = `${ctx.pl(ver.instant).name} holds four of a kind. Instant win.`;
      else if (!ver.winners.length) { sub = 'Nobody won two brags in a row. The pot carries over.'; title = 'Pot carries over'; }
      else sub = `${names(ver.winners)} won two brags in a row${ver.sweep ? ' and swept all three: salaami!' : ''}`;
    }
    return {
      center, actions, hint, dealer: undefined, subtitle: 'Boot ' + v.unit + (v.redeals ? ` \u00b7 redealt ${v.redeals}x` : ''),
      seatInfo: (i) => ({ tag: v.phase === 'arrange' ? (v.locked[i] ? 'locked' : 'arranging') : '', tagCls: v.locked[i] && v.phase === 'arrange' ? 'green' : '', win: ver && ver.winners.includes(i) }),
      winners: ver ? ver.winners : [], resultTitle: title, resultSub: sub,
      resultRow: (i) => {
        if (!v.all) return null; const a = v.all[i];
        return { text: ver.instant === i ? 'four of a kind' : a.labels.join(' \u00b7 '), node: h('div', { class: 'kres' }, a.rows.map((r, j) => miniRow(r, ver.wins[i][j]))) };
      },
    };
  },
};
