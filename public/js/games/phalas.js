import { h } from '../dom.js';
import { card, back, handRow } from '../cards.js';

const pts = (id) => { const r = 'A23456789TJQK'.indexOf(id[0]); return id[0] === 'A' ? 1 : (id[0] === 'T' || id[0] === 'J' || id[0] === 'Q' || id[0] === 'K') ? 10 : +id[0]; };

export default {
  build(ctx) {
    const v = ctx.v, ui = ctx.ui, me = ctx.seat;
    ui.sel = (ui.sel || []).filter((c) => v.hand.includes(c));
    const myDiscard = ctx.myTurn && v.stage === 'discard'; const myDraw = ctx.myTurn && v.stage === 'draw';
    const turnP = ctx.pl(v.turn);
    // piles
    const stock = h('div', { class: 'phstock', 'data-tap': 1, 'data-key': 'stock' }, back({ size: 'lg', flip: 'stock' }), h('span', { class: 'cnt' }, v.stock));
    ctx.tap('stock', () => { if (myDraw) ctx.act({ t: 'draw', from: 'stock' }); });
    const pile = h('div', { class: 'phpile' }, v.pile.length ? v.pile.map((c, i) => { const el = card(c, { size: 'lg', flipId: 'p' + c, from: 'seat-' + v.turn }); el.style.marginLeft = i ? '-34px' : '0'; return el; }) : h('div', { class: 'phempty' }, 'Discards'));
    const take = myDraw && v.take.length ? h('div', { class: 'phtake' }, h('small', null, 'Take one card from the last discard, or draw from the deck'),
      h('div', { class: 'phtakerow' }, v.take.map((c) => { const el = card(c, { size: 'md', hint: true, tap: true, key: 'take' + c }); el.setAttribute('data-tap', 1); el.setAttribute('data-key', 'take:' + c); ctx.tap('take:' + c, () => ctx.act({ t: 'draw', from: 'pile', card: c })); return el; }))) : null;
    const center = h('div', { class: 'phwrap' }, take, h('div', { class: 'phpiles' }, stock, pile),
      h('div', { class: 'pill' }, v.phase === 'over' ? 'Show called' : ctx.myTurn ? (v.stage === 'discard' ? 'Discard, or call Show' : 'Now draw a card') : (turnP ? turnP.name + ' is playing' : '')));

    let hand = null, actions = null, hint = null;
    if (me >= 0) {
      hand = handRow(v.hand, { make: (id) => {
        const el = card(id, { size: 'lg', tap: true, sel: ui.sel.includes(id), pt: ctx.hints ? pts(id) : null }); el.setAttribute('data-tap', 1); el.setAttribute('data-key', 'c:' + id);
        ctx.tap('c:' + id, () => {
          if (!myDiscard) return;
          ui.confirm = false;
          if (ui.sel.includes(id)) ui.sel = ui.sel.filter((c) => c !== id);
          else if (ui.sel.length && ui.sel[0][0] !== id[0]) ui.sel = [id]; else ui.sel = ui.sel.concat(id);
          ctx.rerender();
        });
        return el;
      }, fan: false });
      if (myDiscard) {
        hint = 'Discard or Show';
        const n = ui.sel.length;
        actions = [
          ctx.btn(ui.confirm ? `Sure? Show ${v.total}` : `Show (${v.total})`, 'show', () => { if (ui.confirm) { ui.confirm = false; ctx.act({ t: 'show' }); } else { ui.confirm = true; ctx.rerender(); } }, ui.confirm ? 'danger' : ''),
          ctx.btn(n ? `Discard ${n > 1 ? n + ' cards' : ''}`.trim() : 'Pick cards', 'disc', () => { const c = ui.sel.slice(); ui.sel = []; ctx.act({ t: 'discard', cards: c }); }, 'primary', { disabled: !n }),
        ];
      } else if (myDraw) { hint = 'Draw'; actions = [ctx.btn('Draw from deck', 'drawd', () => ctx.act({ t: 'draw', from: 'stock' }), 'primary')]; }
    }
    const r = v.reveal;
    const callerName = v.caller >= 0 && ctx.pl(v.caller) ? ctx.pl(v.caller).name : null;
    const sub = !r ? null : v.outcome === 'won' ? `${callerName} called Show with ${r[v.caller].total} and was lowest` : v.outcome === 'caught' ? `${callerName} called Show with ${r[v.caller].total} but was caught` : 'The deck ran out. Lowest total wins.';
    return {
      center, hand, actions, hint, idle: me >= 0 && v.total != null ? 'Total ' + v.total : '', subtitle: 'Unit ' + v.unit + ' \u00b7 hand ' + ctx.msg.hand,
      seatInfo: (i) => ({ tag: r ? 'total ' + r[i].total : '', tagCls: v.winners.includes(i) ? 'green' : '', cards: r ? 0 : v.counts[i], win: r && v.winners.includes(i) }),
      winners: v.winners, resultSub: sub,
      resultRow: (i) => r ? { text: (v.caller === i ? 'called Show \u00b7 ' : '') + 'total ' + r[i].total, cards: r[i].hand.map((c) => card(c, { size: 'mini', flip: false })) } : null,
    };
  },
};
