import { h } from '../dom.js';
import { card, handRow, SUIT_GLYPH } from '../cards.js';

const tenths = (n) => (n / 10).toFixed(1);

export default {
  build(ctx) {
    const v = ctx.v, ui = ctx.ui, me = ctx.seat;
    const rel = (s) => (me >= 0 ? (s - me + 4) % 4 : s);
    const slots = [0, 1, 2, 3].map((r) => h('div', { class: 'cbslot s' + r }));
    (v.trick || []).forEach((t) => {
      const won = v.trickWinner === t.seat;
      slots[rel(t.seat)].append(card(t.card, { size: 'md', good: won, from: t.seat === me ? null : 'seat-' + t.seat }));
    });
    if (v.phase === 'trickEnd' && v.trickWinner != null) { /* highlight handled above */ }

    const strip = h('div', { class: 'scorestrip' }, [0, 1, 2, 3].map((i) => {
      const p = ctx.pl(i); return h('div', { class: 'ss' + (i === me ? ' me' : '') }, h('b', null, (p ? p.name : '?').slice(0, 7)), h('span', { class: 'num' }, tenths(v.totals[i])));
    }));
    const turnP = ctx.pl(v.turn);
    const status = v.phase === 'bid' ? (ctx.myTurn ? 'Your bid' : (turnP ? turnP.name + ' is bidding' : '')) : v.phase === 'trickEnd' ? (ctx.pl(v.trickWinner) ? ctx.pl(v.trickWinner).name + ' takes the trick' : '') : '';
    const center = h('div', { class: 'cbwrap' }, h('div', { class: 'cbtrick' }, slots), status ? h('div', { class: 'pill' }, status) : null, strip);

    let hand = null, actions = null, hint = null;
    if (me >= 0) {
      const legal = new Set(v.legal || []);
      const playing = v.phase === 'play' && ctx.myTurn;
      if (ui.sel && !legal.has(ui.sel)) ui.sel = null;
      hand = handRow(v.hand, { make: (id) => {
        const el = card(id, { size: 'lg', tap: true, sel: ui.sel === id, dim: playing && !legal.has(id) });
        el.setAttribute('data-tap', 1); el.setAttribute('data-key', 'c:' + id);
        ctx.tap('c:' + id, () => {
          if (!playing) return;
          if (!legal.has(id)) return ctx.toast && ctx.toast('You cannot play that card now');
          if (ui.sel === id) { ui.sel = null; ctx.act({ t: 'play', card: id }); } else { ui.sel = id; ctx.rerender && ctx.rerender(); }
        });
        return el;
      } });
      if (v.canBid) {
        if (ui.bid == null) ui.bid = v.suggest || 2;
        const bid = ui.bid;
        actions = [
          h('div', { class: 'stepper' },
            ctx.btn('\u2212', 'bm', () => { ui.bid = Math.max(1, ui.bid - 1); ctx.rerender(); }, 'round', { attrs: { 'aria-label': 'Lower bid' } }),
            h('div', { class: 'bidnum d' }, String(bid), h('small', null, 'tricks')),
            ctx.btn('+', 'bp', () => { ui.bid = Math.min(13, ui.bid + 1); ctx.rerender(); }, 'round', { attrs: { 'aria-label': 'Raise bid' } })),
          ctx.btn('Call ' + bid, 'bid', () => ctx.act({ t: 'bid', n: ui.bid }), 'primary'),
        ];
        hint = 'Bid';
      } else if (playing) {
        hint = ui.sel ? 'Tap again to play' : 'Play a card';
        if (ui.sel) actions = [ctx.btn('Play', 'play', () => { const id = ui.sel; ui.sel = null; ctx.act({ t: 'play', card: id }); }, 'primary')];
      }
    }
    return {
      center, hand, actions, hint,
      idle: v.phase === 'bid' ? (ctx.myTurn ? '' : 'Bidding') : (me >= 0 && !ctx.myTurn ? '' : ''),
      dealer: v.dealer, subtitle: 'Round ' + v.round + ' of ' + v.rounds,
      seatInfo: (i) => {
        const b = v.bids[i]; const won = v.won[i];
        let tag = ''; let tagCls = '';
        if (v.phase === 'bid') { tag = b == null ? '' : 'bid ' + b; tagCls = 'gold'; }
        else { tag = won + ' of ' + b; tagCls = won >= b ? 'green' : ''; }
        return { tag, tagCls, cards: v.phase === 'bid' ? 0 : 0, win: v.trickWinner === i };
      },
      resultTitle: ctx.result && ctx.result.final ? undefined : (ctx.result ? 'Round ' + v.round + ' done' : undefined),
      resultSub: ctx.result ? (ctx.result.final ? 'Final scores after 5 rounds' : 'Round scores. Khata settles after round 5.') : null,
      resultRow: (i) => {
        const s = ctx.result && ctx.result.summary; if (!s) return null;
        return { text: `bid ${s.bids[i]}, won ${s.won[i]}  \u2022  round ${tenths(s.roundScores[i])}  \u2022  total ${tenths(s.totals[i])}` };
      },
      showZero: false,
    };
  },
};
