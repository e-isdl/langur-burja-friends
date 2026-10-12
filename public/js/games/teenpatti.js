import { h, icon, fmt } from '../dom.js';
import { card, back, handMetrics } from '../cards.js';

export default {
  build(ctx) {
    const v = ctx.v, ui = ctx.ui, me = ctx.seat;
    const folded = me >= 0 && v.folded[me];
    // ---- center
    const ssMsg = v.ssResult ? (v.ssResult.accepted ? `${ctx.pl(v.ssResult.to).name} accepted a side show. ${ctx.pl(v.ssResult.loser).name}'s hand was lower and packed.` : `${ctx.pl(v.ssResult.to).name} declined the side show.`) : null;
    const center = h('div', { class: 'tpwrap' },
      h('div', { class: 'pot' }, h('span', { class: 'chip o' }), h('div', null, h('small', null, 'Pot'), h('span', { class: 'num' }, v.pot))),
      h('div', { class: 'pill' }, 'Blind ', h('b', { class: 'num' }, v.stake), ' \u00b7 Seen ', h('b', { class: 'num' }, v.stake * 2)),
      v.phase === 'sideshow' ? h('div', { class: 'pill gold' }, `${ctx.pl(v.ss.from).name} asks ${ctx.pl(v.ss.to).name} for a side show`) : null,
      ssMsg ? h('div', { class: 'pill' }, ssMsg) : null,
      v.phase === 'bet' && ctx.pl(v.turn) && !ctx.myTurn ? h('div', { class: 'small-note' }, ctx.pl(v.turn).name + ' to act') : null);

    // ---- my cards
    let hand = null;
    if (me >= 0) {
      const seen = !!v.hand; const first = seen && !ui.shown; if (seen) ui.shown = true;
      const m = handMetrics(3, { cw: innerWidth >= 900 ? 92 : 84, pad: 60 });
      hand = h('div', { class: 'tphand', style: { '--hcw': m.cw + 'px' } },
        (v.hand || [0, 1, 2]).map((c, i) => {
          const el = seen ? card(c, { size: 'xl', dim: folded }) : back({ size: 'xl', flip: 'b' + i });
          el.style.setProperty('--cw', m.cw + 'px'); if (first) el.classList.add('reveal'); return el;
        }),
        seen && ctx.hints && v.myLabel ? h('div', { class: 'pill gold tplabel' }, v.myLabel) : null,
        folded ? h('div', { class: 'pill tplabel' }, 'You packed') : null);
    }
    // ---- actions
    let actions = null, hint = null;
    const A = v.actions;
    if (me >= 0 && !folded && v.phase !== 'over') {
      const btns = [];
      if (v.ssAsk) {
        hint = 'Side show?';
        btns.push(ctx.btn('Decline', 'ssn', () => ctx.act({ t: 'ss', ok: false }), 'danger'), ctx.btn('Accept', 'ssy', () => ctx.act({ t: 'ss', ok: true }), 'good'));
      } else {
        if (v.canSee) btns.push(ctx.btn('See cards', 'see', () => ctx.act({ t: 'see' }), A ? '' : 'primary', { icon: 'eye' }));
        if (A) {
          hint = 'Your turn';
          btns.push(ctx.btn('Pack', 'pack', () => ctx.act({ t: 'pack' }), 'danger'));
          btns.push(ctx.btn(`Chaal ${A.chaal}`, 'chaal', () => ctx.act({ t: 'chaal' }), 'primary'));
          if (A.raise) btns.push(ctx.btn(`Raise ${A.raise}`, 'raise', () => ctx.act({ t: 'raise' }), 'good'));
          if (A.show) btns.push(ctx.btn(`Show ${A.show}`, 'show', () => ctx.act({ t: 'show' }), 'good'));
          if (A.sideshow) btns.push(ctx.btn(`Side show ${A.sideshow}`, 'ss', () => ctx.act({ t: 'sideshow' }), ''));
        }
      }
      actions = btns.length ? btns : null;
    }
    return {
      center, hand, actions, hint, dealer: v.dealer, subtitle: 'Boot ' + v.unit + ' \u00b7 hand ' + ctx.msg.hand,
      idle: !A && me >= 0 && !folded && !v.canSee ? '' : '',
      seatInfo: (i) => ({ tag: v.folded[i] ? 'packed' : (v.last[i] || ''), tagCls: v.folded[i] ? '' : (v.last[i] && /raise/.test(v.last[i]) ? 'gold' : ''), out: v.folded[i], win: v.winners.includes(i) }),
      winners: v.winners,
      resultTitle: undefined,
      resultSub: v.how === 'fold' ? 'Everyone else packed' : v.how === 'show' ? 'Decided by a show' : v.how === 'limit' ? 'Pot limit reached. Cards on the table.' : null,
      resultRow: (i) => {
        const r = v.reveal.find((x) => x.seat === i);
        if (r) return { text: r.label, cards: r.hand.map((c) => card(c, { size: 'mini', flip: false })) };
        if (v.winners.includes(i)) return { text: 'took the pot' };
        return v.folded[i] ? { text: 'packed' } : null;
      },
    };
  },
};
