import { h } from '../dom.js';
import { card } from '../cards.js';
import { fmt } from '../dom.js';

export default {
  build(ctx) {
    const v = ctx.v, ui = ctx.ui, me = ctx.seat;
    const turnP = ctx.pl(v.turn);
    const isMine = v.canBet || v.canAce;
    const res = v.res;
    const msg = v.phase === 'reveal' && res ? ({ pass: `${turnP.name} passes`, nogap: 'No gap. Turn passes.', win: `${turnP.name} wins ${res.amt}`, lose: `${turnP.name} loses ${res.amt}`, post: `Post! ${turnP.name} pays ${-res.delta}` }[res.kind]) : (v.phase === 'over' ? 'Round over' : `${turnP ? (v.turn === me ? 'Your' : turnP.name + '\u2019s') : ''} turn`);
    const tone = res && v.phase === 'reveal' ? (res.kind === 'win' ? 'green' : res.kind === 'lose' || res.kind === 'post' ? 'red' : '') : '';
    const [a, b] = v.cards.length ? v.cards : [null, null];
    const slot = (c, extra) => h('div', { class: 'ibslot' }, c ? card(c, Object.assign({ size: 'lg' }, extra || {})) : null);
    const third = v.third ? card(v.third, { size: 'lg', good: res && res.kind === 'win', bad: res && (res.kind === 'lose' || res.kind === 'post'), from: 'seat-' + v.turn }) : null;
    const center = h('div', { class: 'ibwrap' },
      h('div', { class: 'pot' }, h('span', { class: 'chip o' }), h('div', null, h('small', null, 'Pot'), h('span', { class: 'num' }, v.pot))),
      h('div', { class: 'ibrow' }, slot(a), h('div', { class: 'ibgap' + (third ? ' filled' : '') }, third || h('span', null, v.phase === 'bet' || v.phase === 'ace' ? '?' : '')), slot(b)),
      h('div', { class: 'pill ' + (tone === 'green' ? 'gold' : '') , style: tone === 'red' ? { background: 'var(--cinnabar)', color: '#fff' } : null }, msg),
      v.canBet && ctx.hints && v.odds ? h('div', { class: 'small-note' }, v.odds.pair ? `Higher ${Math.round(v.odds.hi * 100)}% \u00b7 Lower ${Math.round(v.odds.lo * 100)}%` : `Wins ${Math.round(v.odds.win * 100)}% \u00b7 Post ${Math.round(v.odds.post * 100)}%`) : null);

    let actions = null, hint = null;
    if (v.canAce) {
      hint = 'Ace: low or high?';
      actions = [ctx.btn('Ace low (1)', 'alo', () => ctx.act({ t: 'ace', v: 'lo' }), ''), ctx.btn('Ace high', 'ahi', () => ctx.act({ t: 'ace', v: 'hi' }), 'primary')];
    } else if (v.canBet) {
      hint = 'Place your bet';
      if (ui.amt == null || ui.amt > v.pot) ui.amt = Math.min(v.pot, v.unit);
      const pair = v.odds && v.odds.pair; if (pair && !ui.side) ui.side = v.odds.hi >= v.odds.lo ? 'hi' : 'lo';
      const set = (n) => { ui.amt = Math.max(1, Math.min(v.pot, Math.round(n))); ctx.rerender(); };
      actions = [
        h('div', { class: 'presets' }, [['Min', v.unit], ['\u00bc', v.pot / 4], ['\u00bd', v.pot / 2], ['Pot', v.pot]].map(([l, n]) => ctx.btn(l, 'p' + l, () => set(n), 'sm'))),
        h('div', { class: 'stepper' },
          ctx.btn('\u2212', 'am', () => set(ui.amt - v.unit), 'round'), h('div', { class: 'bidnum d' }, String(ui.amt), h('small', null, 'chips')), ctx.btn('+', 'ap', () => set(ui.amt + v.unit), 'round')),
        pair ? h('div', { class: 'presets' }, ctx.btn('Higher', 'sh', () => { ui.side = 'hi'; ctx.rerender(); }, ui.side === 'hi' ? 'primary sm' : 'sm'), ctx.btn('Lower', 'sl', () => { ui.side = 'lo'; ctx.rerender(); }, ui.side === 'lo' ? 'primary sm' : 'sm')) : null,
        ctx.btn('Pass', 'pass', () => ctx.act({ t: 'bet', amt: 0 }), ''),
        ctx.btn('Bet ' + ui.amt, 'bet', () => ctx.act({ t: 'bet', amt: ui.amt, side: pair ? ui.side : undefined }), 'primary'),
      ];
    }
    return {
      center, actions, hint, subtitle: 'Ante ' + v.unit + ' \u00b7 hand ' + ctx.msg.hand,
      seatInfo: (i) => {
        const acting = i === v.turn && v.phase !== 'over';
        if (acting) return { tag: 'up now', tagCls: 'gold' };
        return { tag: v.net[i] ? fmt(v.net[i]) : '', tagCls: v.net[i] > 0 ? 'green' : v.net[i] < 0 ? 'red' : '' };
      },
      resultSub: 'Whatever is left in the pot is split back evenly.',
      resultRow: (i) => ({ text: 'played ' + fmt(v.net[i] + 0) }),
    };
  },
};
