import { h } from '../dom.js';
import { card, back, handRow } from '../cards.js';

const nm = (r) => (r === 'T' ? '10' : r);

export default {
  build(ctx) {
    const v = ctx.v, ui = ctx.ui, me = ctx.seat;
    ui.sel = (ui.sel || []).filter((c) => v.hand.includes(c));
    const myDraw = ctx.myTurn && v.stage === 'draw'; const myAct = ctx.myTurn && v.stage === 'act';
    const turnP = ctx.pl(v.turn);
    const stock = h('div', { class: 'phstock', 'data-tap': 1, 'data-key': 'stock' }, back({ size: 'lg', flip: 'stock' }), h('span', { class: 'cnt' }, v.stock));
    ctx.tap('stock', () => { if (myDraw) ctx.act({ t: 'draw', from: 'stock' }); });
    const top = v.top ? card(v.top, { size: 'lg', flipId: 'top' + v.top, tap: true, hint: myDraw }) : h('div', { class: 'phempty' }, 'Pile');
    if (v.top) { top.setAttribute('data-tap', 1); top.setAttribute('data-key', 'pile'); ctx.tap('pile', () => { if (myDraw) ctx.act({ t: 'draw', from: 'discard' }); }); }
    const sets = v.melds.map((groups, i) => groups.length ? h('div', { class: 'jset' }, h('b', null, (ctx.pl(i) ? ctx.pl(i).name : '?').slice(0, 6)), groups.map((g) => h('div', { class: 'jgrp' }, g.map((c) => card(c, { size: 'mini', flip: false, wild: c[0] === v.joker }))))) : null);
    const center = h('div', { class: 'phwrap' },
      h('div', { class: 'pill gold' }, `Joker: ${nm(v.joker)}s are wild`),
      h('div', { class: 'phpiles' }, stock, h('div', { class: 'phpile' }, top)),
      h('div', { class: 'pill' }, v.phase === 'over' ? 'Hand over' : ctx.myTurn ? (v.stage === 'draw' ? 'Draw from the deck or take the pile' : (v.laid ? 'Now discard a card' : 'Lay a set, then discard')) : (turnP ? turnP.name + ' is playing' : '')),
      h('div', { class: 'jsets' }, sets));

    let hand = null, actions = null, hint = null;
    if (me >= 0) {
      hand = handRow(v.hand, { make: (id) => {
        const el = card(id, { size: 'lg', tap: true, sel: ui.sel.includes(id), wild: id[0] === v.joker, dim: myAct && v.noDiscard === id && v.hand.length > 1 && ui.sel.length === 0 && false }); el.setAttribute('data-tap', 1); el.setAttribute('data-key', 'c:' + id);
        ctx.tap('c:' + id, () => { if (!myAct) return; ui.sel = ui.sel.includes(id) ? ui.sel.filter((c) => c !== id) : ui.sel.concat(id); ctx.rerender(); });
        return el;
      } });
      if (myDraw) { hint = 'Draw'; actions = [ctx.btn('Draw from deck', 'dd', () => ctx.act({ t: 'draw', from: 'stock' }), ''), v.top ? ctx.btn('Take pile card', 'dp', () => ctx.act({ t: 'draw', from: 'discard' }), 'primary') : null]; }
      else if (myAct) {
        hint = ui.sel.length >= 2 ? 'Lay these as a set' : 'Lay a set or discard';
        const n = ui.sel.length; const b = [];
        if (!v.laid && v.hints.length && n === 0) b.push(ctx.btn('Lay suggested set', 'sug', () => ctx.act({ t: 'meld', cards: v.hints[0] }), ''));
        if (!v.laid && n >= 2) b.push(ctx.btn(`Lay ${n} cards`, 'lay', () => { const c = ui.sel.slice(); ui.sel = []; ctx.act({ t: 'meld', cards: c }); }, 'primary'));
        if (n === 1) b.push(ctx.btn('Discard', 'dis', () => { const c = ui.sel[0]; ui.sel = []; ctx.act({ t: 'discard', card: c }); }, 'primary'));
        if (n === 0) b.push(ctx.btn('Pick a card to discard', 'pk', () => {}, '', { disabled: true }));
        actions = b;
      }
    }
    const r = v.reveal;
    return {
      center, hand, actions, hint, dealer: undefined, subtitle: 'Unit ' + v.unit + ' \u00b7 hand ' + ctx.msg.hand,
      seatInfo: (i) => ({ cards: v.counts[i], tag: v.counts[i] === 1 ? 'one card!' : (v.melds[i].length ? v.melds[i].length + ' sets' : ''), tagCls: v.counts[i] === 1 ? 'red' : '', win: v.winner === i }),
      winners: v.winner >= 0 ? [v.winner] : [],
      resultTitle: v.winner < 0 && ctx.result ? 'No winner' : undefined,
      resultSub: v.winner < 0 ? 'Nobody could finish. No khata moves.' : (ctx.result && ctx.pl(v.winner) ? ctx.pl(v.winner).name + ' went out' + (ctx.result.summary && ctx.result.summary.pure ? ' without a joker: double!' : '.') : null),
      resultRow: (i) => r && r[i].length ? { text: 'left with ' + r[i].length, cards: r[i].map((c) => card(c, { size: 'mini', flip: false })) } : (v.winner === i ? { text: 'went out' } : null),
    };
  },
};
