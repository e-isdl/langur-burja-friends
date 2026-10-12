import { h } from '../dom.js';
import { card, back } from '../cards.js';

const RVAL = '23456789TJQKA';
const rankName = (i) => (RVAL[i] === 'T' ? '10' : RVAL[i]);

export default {
  build(ctx) {
    const v = ctx.v, ui = ctx.ui, me = ctx.seat;
    ui.sel = (ui.sel || []).filter((c) => v.hand.includes(c));
    const myDraw = ctx.myTurn && v.stage === 'draw'; const myAct = ctx.myTurn && v.stage === 'act';
    const turnP = ctx.pl(v.turn);
    const stock = h('div', { class: 'phstock', 'data-tap': 1, 'data-key': 'stock' }, back({ size: 'lg', flip: 'stock' }), h('span', { class: 'cnt' }, v.stock));
    ctx.tap('stock', () => { if (myDraw) ctx.act({ t: 'draw', from: 'stock' }); });
    const top = v.top ? card(v.top, { size: 'lg', flipId: 'top' + v.top, tap: myDraw, hint: myDraw }) : h('div', { class: 'phempty' }, 'Pile');
    if (myDraw && v.top) { top.setAttribute('data-tap', 1); top.setAttribute('data-key', 'pile'); ctx.tap('pile', () => ctx.act({ t: 'draw', from: 'discard' })); }
    const center = h('div', { class: 'phwrap' },
      h('div', { class: 'pill gold' }, `Wild: every ${rankName(v.wildRank)}`),
      h('div', { class: 'phpiles' }, stock, h('div', { class: 'phpile' }, top)),
      h('div', { class: 'pill' }, v.phase === 'over' ? 'Hand over' : ctx.myTurn ? (v.stage === 'draw' ? 'Draw from the deck or take the pile' : 'Group your hand, then discard, or Declare if it all fits') : (turnP ? turnP.name + ' is playing' : '')),
      ctx.hints ? h('div', { class: 'small-note' }, 'Need at least one pure sequence (3+ same suit in a row, no wilds) somewhere in your hand to declare.') : null);

    let hand = null, actions = null, hint = null;
    if (me >= 0) {
      hand = h('div', { class: 'mhand' }, v.hand.map((id, idx) => {
        const wild = RVAL.indexOf(id[0]) === v.wildRank;
        const el = card(id, { size: 'md', tap: true, sel: ui.sel.includes(id), wild, dim: id === v.taken });
        el.style.setProperty('--i', idx);
        el.setAttribute('data-tap', 1); el.setAttribute('data-key', 'c:' + id);
        ctx.tap('c:' + id, () => { if (!myAct) return; ui.sel = ui.sel.includes(id) ? [] : [id]; ctx.rerender(); });
        return el;
      }));
      if (myDraw) { hint = 'Draw'; actions = [ctx.btn('Draw from deck', 'dd', () => ctx.act({ t: 'draw', from: 'stock' }), ''), v.top ? ctx.btn('Take pile card', 'dp', () => ctx.act({ t: 'draw', from: 'discard' }), 'primary') : null]; }
      else if (myAct) {
        hint = ui.sel.length ? 'Discard this card?' : 'Pick a card to discard';
        const btns = [];
        if (ui.sel.length) btns.push(ctx.btn('Discard', 'dis', () => { const c = ui.sel[0]; ui.sel = []; ctx.act({ t: 'discard', card: c }); }, 'primary'));
        btns.push(ctx.btn('Declare', 'dec', () => ctx.act({ t: 'declare' }), ui.sel.length ? '' : 'good'));
        actions = btns;
      }
    }
    const summary = ctx.result && ctx.result.summary;
    return {
      center, hand, actions, hint, subtitle: 'Unit ' + v.unit + ' \u00b7 hand ' + ctx.msg.hand,
      onEvents(evs) { for (const e of evs) if (e.k === 'baddeclare' && e.seat === me) ctx.toast('Not quite: that hand does not fully group yet'); },
      seatInfo: (i) => ({ cards: v.counts[i], tag: v.counts[i] + ' cards', win: v.winner === i }),
      winners: v.winner >= 0 ? [v.winner] : [],
      resultTitle: v.winner < 0 && ctx.result ? 'No winner this hand' : undefined,
      resultSub: v.winner < 0 ? 'Nobody completed their hand. Fresh deal next.' : (summary && ctx.pl(v.winner) ? ctx.pl(v.winner).name + ' declared' + (summary.tunnel ? ` with ${summary.tunnel} tunnel${summary.tunnel > 1 ? 's' : ''}: ${Math.pow(2, summary.tunnel)}x` : '') : null),
      showZero: false,
    };
  },
};
