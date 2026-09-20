/* =====================================================================
   In-Between — 2+ players, 4-deck shoe (anti-counting).
   Each round: host draws 2 boundary cards face-up, shows range text.
   30s simultaneous betting: stake 5/10/20 + Bet BETWEEN (or Pass).
   Payouts: gap1 11:1, gap2 5:1, gap3 4:1, gap4+ 1:1.
   Consecutive / boundary match = loss. Reveal has flip + 1s drama pause.
   ===================================================================== */
(function () {
'use strict';
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]); }); }
function rnd(n) { return Math.floor(Math.random() * n); }
/* deck compat */
var SUITMAP = { S: '♠', H: '♥', D: '♦', C: '♣', '♠': '♠', '♥': '♥', '♦': '♦', '♣': '♣' };
var RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
var VAL = { A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13 };
var __u = 0;
function norm(c) { var s = SUITMAP[c.suit] || c.suit; return { id: c.id || ('ib_' + (__u++)), rank: c.rank, suit: s, red: s === '♥' || s === '♦' }; }
function shoe4() {
  var out = [];
  try {
    if (window.DeckLib && window.DeckLib.Deck) { for (var d = 0; d < 4; d++) { var dd = new window.DeckLib.Deck({ decks: 1 }); dd.cards.forEach(function (c) { out.push(norm(c)); }); } return out; }
  } catch (e) {}
  for (var k = 0; k < 4; k++) ['♠', '♥', '♦', '♣'].forEach(function (s) { RANKS.forEach(function (r) { out.push(norm({ rank: r, suit: s })); }); });
  return out;
}
function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = rnd(i + 1); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
/* sound compat */
function sfx(n) {
  try {
    var W = window.Sound || {};
    if (n === 'win' && W.playWinChime) return W.playWinChime();
    if (n === 'lose' && W.playLossThud) return W.playLossThud();
    if (W.playClick && n === 'click') return W.playClick();
    if (W.playCardDeal && n === 'deal') return W.playCardDeal();
    if (W.playCardFlip && n === 'flip') return W.playCardFlip();
    if (W.playChip && n === 'chip') return W.playChip();
    if (typeof W[n] === 'function') return W[n]();
  } catch (e) {}
  try { var C = window.AudioContext || window.webkitAudioContext; if (!C) return; var c = new C(), o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.frequency.value = n === 'win' ? 880 : n === 'lose' ? 200 : 600; g.gain.value = 0.08; o.start(); o.stop(c.currentTime + 0.15); setTimeout(function () { try { c.close(); } catch (e) {} }, 250); } catch (e) {}
}
function muted() { try { var W = window.Sound || {}; if (W.isMuted) return W.isMuted(); if (typeof W.muted !== 'undefined') return !!W.muted; } catch (e) {} return localStorage.getItem('lbg_muted') === '1'; }
function toggleMute() { try { var W = window.Sound || {}; if (W.toggleMuted) return W.toggleMuted(); if (W.toggle) return W.toggle(); } catch (e) {} var m = !(localStorage.getItem('lbg_muted') === '1'); localStorage.setItem('lbg_muted', m ? '1' : '0'); return m; }
/* net */
var net = window.WSClient.join(null, null);
var ME = net.playerId, BET_S = 30;
var S = null, stake = 10;
function paintTop() { var c = $('chipCount'); if (c) c.textContent = net.getChips(); var m = $('muteBtn'); if (m) m.textContent = muted() ? '🔇' : '🔊'; var r = $('roomBox'); if (r) r.textContent = 'Room: ' + net.room + (net.isHost ? ' (HOST)' : ''); }
if ($('muteBtn')) $('muteBtn').onclick = function () { toggleMute(); paintTop(); };
if ($('menuBtn')) $('menuBtn').onclick = function () { $('sidebar').classList.toggle('open'); };
if ($('leaveBtn')) $('leaveBtn').onclick = function () { location.href = '/'; };
/* state */
function defState() { return { players: [{ id: ME, name: net.playerName }], shoe: [], a: null, b: null, third: null, phase: 'lobby', bets: {}, deadline: 0, round: 0, result: null }; }
function save() { try { sessionStorage.setItem('ib_state_' + net.room, JSON.stringify(S)); } catch (e) {} }
function load() { try { var r = sessionStorage.getItem('ib_state_' + net.room); if (r && !S) S = JSON.parse(r); } catch (e) {} }
function push() { save(); try { net.broadcast('state', S); } catch (e) {} render(); }
function ensureShoe() { if (!S.shoe || !S.shoe.length) S.shoe = shuffle(shoe4()); }
/* host */
function hostDeal() {
  if (!net.isHost) return;
  if (!S) S = defState();
  ensureShoe();
  if (S.shoe.length < 10) S.shoe = shuffle(shoe4());
  S.a = S.shoe.pop(); S.b = S.shoe.pop();
  S.third = null; S.result = null; S.bets = {};
  S.round++; S.phase = 'bet'; S.deadline = Date.now() + BET_S * 1000;
  push(); sfx('deal');
}
function payouts() {
  var va = VAL[S.a.rank], vb = VAL[S.b.rank], vt = VAL[S.third.rank];
  var lo = Math.min(va, vb), hi = Math.max(va, vb), gap = hi - lo - 1;
  if (vt === va || vt === vb || gap <= 0) return { win: false, mult: 0, gap: gap, why: 'Boundary match / consecutive — house wins' };
  if (vt > lo && vt < hi) {
    var mult = gap === 1 ? 11 : gap === 2 ? 5 : gap === 3 ? 4 : 1;
    return { win: true, mult: mult, gap: gap, why: 'Between! gap ' + gap + ' pays ' + mult + ':1' };
  }
  return { win: false, mult: 0, gap: gap, why: 'Outside — house wins' };
}
function hostReveal() {
  if (!net.isHost || !S || S.phase !== 'bet') return;
  ensureShoe();
  S.third = S.shoe.pop(); S.phase = 'reveal';
  var r = payouts(); S.result = r; push(); sfx('flip');
  setTimeout(function () {
    if (!S || S.phase !== 'reveal') return;
    var deltas = {};
    Object.keys(S.bets).forEach(function (pid) { var st = S.bets[pid]; deltas[pid] = r.win ? (st * r.mult) : (-st); });
    S.players.forEach(function (p) { if (!(p.id in deltas)) deltas[p.id] = 0; });
    var title = 'In-Between R' + S.round + ' — ' + r.why;
    try { net.endGame(deltas, r.win ? 'Bettors win' : 'House wins', title); } catch (e) {}
    if (r.win) sfx('win'); else sfx('lose');
    render();
  }, 1000);
}
function hostNext() { if (!net.isHost) return; hostDeal(); }
/* net wiring */
net.on('state', function (st) { S = st; save(); render(); });
net.on('hello', function () { if (net.isHost && S) { try { net.broadcast('state', S); } catch (e) {} } });
net.on('need_state', function () { if (net.isHost && S) { try { net.broadcast('state', S); } catch (e) {} } });
net.on('action', function (p) {
  if (!net.isHost || !S || !p) return;
  if (p.kind === 'join') { if (!S.players.some(function (x) { return x.id === p.from; })) { S.players.push({ id: p.from, name: (p.data && p.data.name) || 'Guest' }); push(); } }
  else if (p.kind === 'bet' && S.phase === 'bet') { S.bets[p.from] = Math.max(5, Math.min(100, (p.data && p.data.stake) || 10)); push(); sfx('chip'); }
  else if (p.kind === 'pass' && S.phase === 'bet') { delete S.bets[p.from]; push(); }
});
function act(k, d) {
  if (net.isHost) {
    if (!S) return;
    if (k === 'bet' && S.phase === 'bet') { S.bets[ME] = d.stake; push(); }
    else if (k === 'pass') { delete S.bets[ME]; push(); }
  } else { try { net.send('action', { from: ME, kind: k, data: d }); } catch (e) {} }
}
/* stake selector 5/10/20 */
[5, 10, 20].forEach(function (v) {
  var b = document.createElement('button');
  b.className = 'chipbtn' + (v === stake ? ' on' : ''); b.textContent = v;
  b.onclick = function () { stake = v; sfx('click'); var ch = $('stakeRow').children; for (var i = 0; i < ch.length; i++) ch[i].classList.remove('on'); b.classList.add('on'); };
  $('stakeRow').appendChild(b);
});
if ($('betBtn')) $('betBtn').onclick = function () {
  if (!S || S.phase !== 'bet') { alert('Wait for deal'); return; }
  if (net.getChips() < stake) { alert('Not enough chips'); return; }
  sfx('chip'); act('bet', { stake: stake });
};
if ($('passBtn')) $('passBtn').onclick = function () { act('pass', {}); };
if ($('dealBtn')) $('dealBtn').onclick = function () { if (!net.isHost) { alert('Host only'); return; } hostDeal(); };
if ($('revealBtn')) $('revealBtn').onclick = function () { if (!net.isHost) { alert('Host only'); return; } hostReveal(); };
if ($('nextBtn')) $('nextBtn').onclick = function () { if (!net.isHost) { alert('Host only'); return; } hostNext(); };
/* range text e.g. 5-9 range 6,7,8 */
function rangeText() {
  if (!S || !S.a || !S.b) return '—';
  var va = VAL[S.a.rank], vb = VAL[S.b.rank];
  var lo = Math.min(va, vb), hi = Math.max(va, vb);
  var nm = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
  function rn(v) { return nm[v] || v; }
  if (hi - lo <= 1) return S.a.rank + ' – ' + S.b.rank + ' · consecutive, house edge!';
  var ins = []; for (var v = lo + 1; v < hi; v++) ins.push(rn(v));
  return S.a.rank + ' – ' + S.b.rank + ' · range ' + ins.join(',') + ' (gap ' + (hi - lo - 1) + ')';
}
function cardBig(c) {
  if (!c) return '<div class="card back large">?</div>';
  var red = c.red;
  return '<div class="card large ' + (red ? 'red' : 'black') + '">' + esc(c.rank) + '<span class="sub">' + esc(c.suit) + '</span></div>';
}
function render() {
  if (!S) { if (net.isHost) { S = defState(); ensureShoe(); } else { $('info').textContent = 'Waiting for host…'; paintTop(); return; } }
  paintTop();
  $('players').innerHTML = S.players.map(function (p) {
    return '<div class="player"><div class="avatar">' + esc((p.name || '?')[0]) + '</div>' +
      '<div class="meta"><b>' + esc(p.name) + (p.id === ME ? ' (you)' : '') + '</b>' +
      '<span>' + (S.bets[p.id] != null ? ('bet ' + S.bets[p.id]) : 'no bet') + '</span></div></div>';
  }).join('');
  $('cardA').innerHTML = cardBig(S.a);
  $('cardB').innerHTML = cardBig(S.b);
  $('rangeTxt').textContent = S.a ? rangeText() : 'Press Deal (host)';
  $('phBet').className = 'phase' + (S.phase === 'bet' ? ' on' : '');
  $('phRev').className = 'phase' + (S.phase === 'reveal' ? ' on' : '');
  var ms = (S.deadline || Date.now()) - Date.now();
  var tf = $('timerFill'); if (tf) tf.style.width = S.phase === 'bet' ? Math.max(0, Math.min(100, ms / (BET_S * 1000) * 100)) + '%' : '100%';
  $('info').textContent = S.phase === 'lobby' ? 'Press Deal Boundaries (host). 4-deck shoe.'
    : S.phase === 'bet' ? ('Round ' + S.round + ' · betting open · ' + Math.max(0, Math.ceil(ms / 1000)) + 's left · shoe ' + (S.shoe || []).length)
    : ('Revealed — ' + ((S.result || {}).why || ''));
  var tw = $('thirdWrap'); tw.innerHTML = '';
  if (S.third) {
    var d = document.createElement('div'); d.innerHTML = '<div class="card large flip ' + (S.third.red ? 'red' : 'black') + '">' + esc(S.third.rank) + '<span class="sub">' + esc(S.third.suit) + '</span></div>';
    tw.appendChild(d);
    var f = $('winFlash');
    if (S.result) { f.textContent = S.result.win ? ('✅ WIN ' + S.result.mult + ':1') : '❌ LOSS'; f.style.color = S.result.win ? 'var(--green)' : 'var(--red)'; tw.className = S.result.win ? 'flash-win' : 'flash-lose'; }
  } else { tw.innerHTML = '<div class="card back large">?</div>'; tw.className = ''; var f2 = $('winFlash'); if (f2) f2.textContent = ''; }
  var keys = Object.keys(S.bets || {});
  var bl = keys.map(function (pid) { var p = null; S.players.forEach(function (x) { if (x.id === pid) p = x; }); return esc(p ? p.name : pid) + ' ' + S.bets[pid]; }).join(' · ');
  $('betsLine').textContent = bl ? ('Bets: ' + bl + ' (' + keys.length + ' players)') : 'No bets yet';
  var bb = $('betBtn'); if (bb) bb.disabled = !(S.phase === 'bet');
}
/* 30s auto-reveal watchdog (host) */
setInterval(function () {
  if (!S || S.phase !== 'bet') return;
  var tf = $('timerFill'); if (tf) tf.style.width = Math.max(0, ((S.deadline - Date.now()) / (BET_S * 1000) * 100)) + '%';
  if (Date.now() > S.deadline && net.isHost && S.phase === 'bet') hostReveal();
}, 500);
try { net.hello(); } catch (e) {}
load(); render();
if (!net.isHost) setTimeout(function () { try { net.send('action', { from: ME, kind: 'join', data: { name: net.playerName } }); net.send('need_state', { from: ME }); } catch (e) {} }, 400);
else if (!S) { S = defState(); ensureShoe(); render(); }
})();
