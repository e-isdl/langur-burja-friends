/* =====================================================================
   Call Break — EXACTLY 4 seats (bots fill empty), spades trump.
   Bid 1-8 clockwise from dealer. 13 tricks per round, 5 rounds.
   Rules: leader any; must follow suit; must trump if void & hold spade.
   Trick: highest led suit wins unless spade present -> highest spade.
   Scoring: met => bid + 0.1*extra, missed => -bid. Places: +30/+10/-10/-30.
   Bots: Easy — bid A/K/Q spades + A/K others; play lowest winning else lowest.
   ===================================================================== */
(function () {
'use strict';
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]); }); }
function rnd(n) { return Math.floor(Math.random() * n); }
/* ---- deck compat: normalize to {id,rank,suit} with unicode suits ---- */
var SUITMAP = { S: '♠', H: '♥', D: '♦', C: '♣', '♠': '♠', '♥': '♥', '♦': '♦', '♣': '♣' };
var RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
var VHI = { A: 14, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13 };
var __u = 0;
function norm(c) { var s = SUITMAP[c.suit] || c.suit; return { id: c.id || ('cb_' + (__u++)), rank: c.rank, suit: s, red: s === '♥' || s === '♦' }; }
function fullDeck() {
  var out = [];
  try {
    if (window.DeckLib && window.DeckLib.Deck) { var d = new window.DeckLib.Deck({ decks: 1 }); d.cards.forEach(function (c) { out.push(norm(c)); }); return out; }
  } catch (e) {}
  ['♠', '♥', '♦', '♣'].forEach(function (s) { RANKS.forEach(function (r) { out.push(norm({ rank: r, suit: s })); }); });
  return out;
}
function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = rnd(i + 1); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function sortH(h) { return h.slice().sort(function (a, b) { if (a.suit !== b.suit) return a.suit < b.suit ? -1 : 1; return VHI[a.rank] - VHI[b.rank]; }); }
/* ---- sound compat ---- */
function sfx(n) {
  try {
    var W = window.Sound || {};
    if (n === 'win' && W.playWinChime) return W.playWinChime();
    if (n === 'lose' && W.playLossThud) return W.playLossThud();
    if (W.playClick && (n === 'click' || n === 'bid')) return W.playClick();
    if (W.playCardDeal && (n === 'deal' || n === 'play')) return W.playCardDeal();
    if (W.playChip && n === 'chip') return W.playChip();
    if (W.playYourTurn && n === 'turn') return W.playYourTurn();
    if (typeof W[n] === 'function') return W[n]();
  } catch (e) {}
  try { var C = window.AudioContext || window.webkitAudioContext; if (!C) return; var c = new C(), o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.frequency.value = n === 'win' ? 880 : 520; g.gain.value = 0.08; o.start(); o.stop(c.currentTime + 0.15); setTimeout(function () { try { c.close(); } catch (e) {} }, 250); } catch (e) {}
}
function muted() { try { var W = window.Sound || {}; if (W.isMuted) return W.isMuted(); if (typeof W.muted !== 'undefined') return !!W.muted; } catch (e) {} return localStorage.getItem('lbg_muted') === '1'; }
function toggleMute() { try { var W = window.Sound || {}; if (W.toggleMuted) return W.toggleMuted(); if (W.toggle) return W.toggle(); } catch (e) {} var m = !(localStorage.getItem('lbg_muted') === '1'); localStorage.setItem('lbg_muted', m ? '1' : '0'); return m; }
/* ---- net ---- */
var net = window.WSClient.join(null, null);
var ME = net.playerId;
var BID_S = 30, TURN_S = 30, MAXR = 5;
var S = null;
function paintTop() { var c = $('chipCount'); if (c) c.textContent = net.getChips(); var m = $('muteBtn'); if (m) m.textContent = muted() ? '🔇' : '🔊'; var r = $('roomBox'); if (r) r.textContent = 'Room: ' + net.room + (net.isHost ? ' (HOST)' : ''); }
if ($('muteBtn')) $('muteBtn').onclick = function () { toggleMute(); paintTop(); };
if ($('menuBtn')) $('menuBtn').onclick = function () { $('sidebar').classList.toggle('open'); };
if ($('leaveBtn')) $('leaveBtn').onclick = function () { location.href = '/'; };
if ($('scoreBtn')) $('scoreBtn').onclick = showScores;
/* ---- state ---- */
function defState() { return { seats: [], round: 0, maxRounds: MAXR, dealer: 0, turn: 0, phase: 'lobby', bids: {}, hands: {}, trick: [], ledSuit: null, tricksWon: {}, scores: {}, history: [], deadline: 0 }; }
function save() { try { sessionStorage.setItem('cb_state_' + net.room, JSON.stringify(S)); } catch (e) {} }
function load() { try { var r = sessionStorage.getItem('cb_state_' + net.room); if (r && !S) S = JSON.parse(r); } catch (e) {} }
function push() { save(); try { net.broadcast('state', S); } catch (e) {} render(); }
function seatOf(id) { var f = null; (S.seats || []).forEach(function (s) { if (s.id === id) f = s; }); return f; }
/* ---- setup: exactly 4 seats ---- */
function ensureSeats() {
  if (!S) S = defState();
  if (!S.seats.length) {
    S.seats = [{ id: ME, name: net.playerName, bot: false }];
    var tags = ['Bot Easy', 'Bot Easy', 'Bot Easy'];
    for (var i = 0; i < 3; i++) { var b = 'bot' + Math.floor(Math.random() * 1e4) + 'x' + i; S.seats.push({ id: b, name: tags[i] + ' ' + b.slice(-3), bot: true }); }
    S.seats.forEach(function (s) { if (!(s.id in S.scores)) S.scores[s.id] = 0; });
  }
  while (S.seats.length < 4) { var b2 = 'bot' + rnd(1e5); S.seats.push({ id: b2, name: 'Bot Easy ' + b2.slice(-3), bot: true }); }
  S.seats = S.seats.slice(0, 4);
}
function hostStart() { if (!net.isHost) return; ensureSeats(); S.round = 1; S.dealer = 0; startRound(); sfx('deal'); }
function startRound() {
  var deck = shuffle(fullDeck());
  S.hands = {}; S.bids = {}; S.trick = []; S.ledSuit = null; S.tricksWon = {};
  S.seats.forEach(function (s) { S.hands[s.id] = sortH(deck.splice(0, 13)); S.tricksWon[s.id] = 0; });
  S.phase = 'bid'; S.turn = (S.dealer + 1) % 4; S.deadline = Date.now() + BID_S * 1000;
  push(); botBidMaybe();
}
/* ---- rules ---- */
function legal(cards, hand, led) {
  if (!led) return cards;
  var fol = hand.filter(function (c) { return c.suit === led; });
  if (fol.length) { var ids = {}; fol.forEach(function (c) { ids[c.id] = 1; }); return cards.filter(function (c) { return ids[c.id]; }); }
  var sp = hand.filter(function (c) { return c.suit === '♠'; });
  if (sp.length) { var ids2 = {}; sp.forEach(function (c) { ids2[c.id] = 1; }); return cards.filter(function (c) { return ids2[c.id]; }); }
  return cards;
}
function botBid(hand) {
  var b = 0;
  hand.forEach(function (c) {
    if (c.suit === '♠' && (c.rank === 'A' || c.rank === 'K' || c.rank === 'Q')) b++;
    else if (c.rank === 'A') b++;
    else if (c.rank === 'K' && Math.random() < 0.5) b++;
  });
  if (!b) b = 2;
  return Math.max(1, Math.min(8, Math.round(b)));
}
function trickWinner() {
  var led = S.ledSuit;
  var sp = S.trick.filter(function (t) { return t.card.suit === '♠'; });
  var pool = sp.length ? sp : S.trick.filter(function (t) { return t.card.suit === led; });
  pool.sort(function (a, b) { return VHI[b.card.rank] - VHI[a.card.rank]; });
  return pool[0];
}
function hostBid(from, n) {
  if (!S || S.phase !== 'bid') return;
  if (!S.seats[S.turn] || S.seats[S.turn].id !== from) return;
  S.bids[from] = Math.max(1, Math.min(8, n || 1)); sfx('bid');
  S.turn = (S.turn + 1) % 4; S.deadline = Date.now() + BID_S * 1000;
  if (Object.keys(S.bids).length >= 4) { S.phase = 'play'; S.turn = (S.dealer + 1) % 4; S.deadline = Date.now() + TURN_S * 1000; }
  push();
  if (S.phase === 'bid') botBidMaybe(); else botPlayMaybe();
}
function hostPlay(from, cardId) {
  if (!S || S.phase !== 'play') return;
  if (!S.seats[S.turn] || S.seats[S.turn].id !== from) return;
  var hand = S.hands[from] || [], ix = -1;
  for (var i = 0; i < hand.length; i++) if (hand[i].id === cardId) ix = i;
  if (ix < 0) return;
  var c = hand[ix];
  if (!legal([c], hand, S.ledSuit).length) return;
  hand.splice(ix, 1);
  if (!S.trick.length) S.ledSuit = c.suit;
  S.trick.push({ pid: from, card: c }); sfx('play');
  S.turn = (S.turn + 1) % 4; S.deadline = Date.now() + TURN_S * 1000;
  if (S.trick.length >= 4) {
    var w = trickWinner(); S.tricksWon[w.pid]++; push();
    setTimeout(function () {
      if (!S || S.phase !== 'play') return;
      S.trick = []; S.ledSuit = null;
      for (var k = 0; k < 4; k++) if (S.seats[k].id === w.pid) S.turn = k;
      var total = 0; Object.keys(S.tricksWon).forEach(function (kk) { total += S.tricksWon[kk]; });
      if (total >= 13) scoreRound();
      else { push(); botPlayMaybe(); }
    }, 1300);
    return;
  }
  push(); botPlayMaybe();
}
function scoreRound() {
  var rd = { round: S.round, scores: {}, bids: {}, won: {} };
  Object.keys(S.bids).forEach(function (k) { rd.bids[k] = S.bids[k]; });
  Object.keys(S.tricksWon).forEach(function (k) { rd.won[k] = S.tricksWon[k]; });
  S.seats.forEach(function (s) {
    var b = S.bids[s.id] || 0, w = S.tricksWon[s.id] || 0;
    var pts = w >= b ? (b + 0.1 * (w - b)) : (-b);
    pts = Math.round(pts * 10) / 10;
    rd.scores[s.id] = pts; S.scores[s.id] = Math.round(((S.scores[s.id] || 0) + pts) * 10) / 10;
  });
  S.history.push(rd);
  if (S.round >= S.maxRounds) { S.phase = 'over'; push(); payout(); showFinal(); }
  else { S.round++; S.dealer = (S.dealer + 1) % 4; push(); setTimeout(function () { if (S && S.phase !== 'over') startRound(); }, 2200); }
}
function payout() {
  var order = S.seats.slice().sort(function (a, b) { return (S.scores[b.id] || 0) - (S.scores[a.id] || 0); });
  var bonus = [30, 10, -10, -30], deltas = {};
  order.forEach(function (s, i) { deltas[s.id] = bonus[i] || 0; });
  try { net.endGame(deltas, order[0].name, 'Call Break — ' + order[0].name + ' wins'); } catch (e) {}
}
function showScores() {
  var ov = $('overlay'); ov.classList.add('show');
  var rows = S ? S.seats.map(function (s) { return '<tr><td>' + esc(s.name) + '</td><td>' + (S.bids[s.id] != null ? S.bids[s.id] : '-') + '</td><td>' + (S.tricksWon[s.id] || 0) + '</td><td>' + ((S.scores[s.id] || 0).toFixed(1)) + '</td></tr>'; }).join('') : '';
  var hist = (S && S.history || []).map(function (h) { return '<div class="muted">R' + h.round + ': ' + S.seats.map(function (s) { return esc(s.name) + ' ' + (h.scores[s.id] >= 0 ? '+' : '') + h.scores[s.id]; }).join(' · ') + '</div>'; }).join('');
  ov.innerHTML = '<div class="modal"><h2>♠ Scoreboard — Round ' + (S ? S.round : '-') + '/5</h2>' +
    '<table class="scoreTable"><tr><th>Player</th><th>Bid</th><th>Tricks</th><th>Total</th></tr>' + rows + '</table>' +
    '<div style="margin-top:8px">' + hist + '</div>' +
    '<div class="controls" style="margin-top:10px"><button class="btn btn-gold" onclick="document.getElementById(\'overlay\').classList.remove(\'show\')">Close</button></div></div>';
}
function showFinal() {
  var order = S.seats.slice().sort(function (a, b) { return (S.scores[b.id] || 0) - (S.scores[a.id] || 0); });
  var ov = $('overlay'); ov.classList.add('show');
  ov.innerHTML = '<div class="modal"><h2>🏆 ' + esc(order[0].name) + ' wins!</h2>' +
    '<table class="scoreTable"><tr><th>#</th><th>Player</th><th>Pts</th><th>Chips</th></tr>' +
    order.map(function (s, i) { var b = [30, 10, -10, -30][i]; return '<tr><td>' + (i + 1) + '</td><td>' + esc(s.name) + '</td><td>' + (S.scores[s.id].toFixed(1)) + '</td><td>' + (b > 0 ? '+' : '') + b + '</td></tr>'; }).join('') +
    '</table><div class="controls" style="margin-top:10px"><button class="btn" onclick="document.getElementById(\'overlay\').classList.remove(\'show\')">Close</button> <button class="btn btn-gold" onclick="location.reload()">Again</button></div></div>';
  sfx('win');
}
/* ---- bots: Easy ---- */
function botBidMaybe() {
  if (!net.isHost || !S || S.phase !== 'bid') return;
  var s = S.seats[S.turn]; if (!s || !s.bot) return;
  setTimeout(function () { if (!S || S.phase !== 'bid' || !S.seats[S.turn] || S.seats[S.turn].id !== s.id) return; hostBid(s.id, botBid(S.hands[s.id])); }, 900);
}
function beatsSim(card, pid) {
  var sim = S.trick.concat([{ pid: pid, card: card }]);
  var sp = sim.filter(function (t) { return t.card.suit === '♠'; });
  var pool = sp.length ? sp : sim.filter(function (t) { return t.card.suit === S.ledSuit; });
  pool.sort(function (a, b) { return VHI[b.card.rank] - VHI[a.card.rank]; });
  return pool[0].card.id === card.id;
}
function botChoose(s) {
  var hand = S.hands[s.id] || [];
  var cands = legal(hand.slice(), hand, S.ledSuit);
  if (!cands.length) cands = hand.slice();
  if (!S.trick.length) { cands.sort(function (a, b) { return VHI[a.rank] - VHI[b.rank]; }); return cands[0]; }
  var win = cands.filter(function (c) { return beatsSim(c, s.id); }).sort(function (a, b) { return VHI[a.rank] - VHI[b.rank]; });
  if (win.length) return win[0];
  var hasSp = S.trick.some(function (t) { return t.card.suit === '♠'; });
  if (!hasSp) { var tr = cands.filter(function (c) { return c.suit === '♠'; }).sort(function (a, b) { return VHI[a.rank] - VHI[b.rank]; }); if (tr.length) return tr[0]; }
  cands.sort(function (a, b) { return VHI[a.rank] - VHI[b.rank]; }); return cands[0];
}
function botPlayMaybe() {
  if (!net.isHost || !S || S.phase !== 'play') return;
  var s = S.seats[S.turn]; if (!s || !s.bot) return;
  setTimeout(function () { if (!S || S.phase !== 'play' || !S.seats[S.turn] || S.seats[S.turn].id !== s.id) return; var c = botChoose(s); if (c) hostPlay(s.id, c.id); }, 950);
}
/* ---- net wiring ---- */
net.on('state', function (st) { S = st; save(); render(); if (net.isHost) { if (S.phase === 'bid') botBidMaybe(); else if (S.phase === 'play') botPlayMaybe(); } });
net.on('hello', function () { if (net.isHost && S) { try { net.broadcast('state', S); } catch (e) {} } });
net.on('need_state', function () { if (net.isHost && S) { try { net.broadcast('state', S); } catch (e) {} } });
net.on('action', function (p) { if (!net.isHost || !p) return; if (p.kind === 'bid') hostBid(p.from, p.data && p.data.n); else if (p.kind === 'play') hostPlay(p.from, p.data && p.data.cardId); });
function act(k, d) { if (net.isHost) { if (k === 'bid') hostBid(ME, d.n); else hostPlay(ME, d.cardId); } else { try { net.send('action', { from: ME, kind: k, data: d }); } catch (e) {} } }
/* ---- render ---- */
function cardMini(c) { var red = c.red; return '<div class="card small ' + (red ? 'red' : 'black') + '">' + esc(c.rank) + '<span class="sub">' + esc(c.suit) + '</span></div>'; }
function render() {
  if (!S) { if (net.isHost) { S = defState(); ensureSeats(); } else { $('info').textContent = 'Waiting for host…'; paintTop(); return; } }
  paintTop();
  var rb = ''; for (var i = 1; i <= MAXR; i++) rb += '<div class="phase' + (S.round === i ? ' on' : '') + (S.round > i ? ' done' : '') + '">R' + i + '</div>';
  $('roundBar').innerHTML = rb;
  var turnSeat = S.seats[S.turn];
  $('players').innerHTML = S.seats.map(function (s) {
    return '<div class="player' + (turnSeat && turnSeat.id === s.id ? ' active' : '') + '"><div class="avatar">' + esc((s.name || '?')[0]) + '</div>' +
      '<div class="meta"><b>' + esc(s.name) + (s.id === ME ? ' (you)' : '') + (s.bot ? ' 🤖' : '') + '</b>' +
      '<span>bid ' + (S.bids[s.id] != null ? S.bids[s.id] : '-') + ' · won ' + (S.tricksWon[s.id] || 0) + ' · ' + ((S.scores[s.id] || 0).toFixed(1)) + '</span></div></div>';
  }).join('');
  $('seats').innerHTML = S.seats.map(function (s) {
    return '<div class="seat' + (turnSeat && turnSeat.id === s.id ? ' lead' : '') + '"><b>' + esc(s.name) + '</b>' +
      '<div>Bid: <span class="bid">' + (S.bids[s.id] != null ? S.bids[s.id] : '-') + '</span> · Won: <b>' + (S.tricksWon[s.id] || 0) + '</b></div>' +
      '<div class="muted">Total ' + ((S.scores[s.id] || 0).toFixed(1)) + '</div></div>';
  }).join('');
  var tr = $('trick'); tr.innerHTML = '';
  if (!S.trick.length) tr.innerHTML = '<div class="muted">♠ trump · ' + (S.phase === 'bid' ? 'Bidding 1-8…' : S.phase === 'lobby' ? 'Press Start' : 'Leader plays any') + '</div>';
  S.trick.forEach(function (t) { var who = seatOf(t.pid); var d = document.createElement('div'); d.style.textAlign = 'center'; d.innerHTML = cardMini(t.card) + '<div class="muted" style="font-size:10px">' + esc(who ? who.name : '') + '</div>'; tr.appendChild(d); });
  $('info').textContent = S.phase === 'lobby' ? 'Press Start (host). Exactly 4 seats, bots fill empty.'
    : S.phase === 'bid' ? ('Bidding 1-8: ' + ((turnSeat || {}).name || ''))
    : S.phase === 'over' ? 'Game over — see scoreboard.'
    : ('Turn: ' + ((turnSeat || {}).name || '') + (turnSeat && turnSeat.id === ME ? ' (YOU)' : '') + ' · Led ' + (S.ledSuit || '—') + ' · ♠ trump');
  var tray = $('tray'); tray.innerHTML = '';
  var hand = S.hands[ME] || [];
  var mine = S.phase === 'play' && turnSeat && turnSeat.id === ME;
  var legalIds = {}; legal(hand.slice(), hand, S.ledSuit).forEach(function (c) { legalIds[c.id] = 1; });
  sortH(hand).forEach(function (c) {
    var ok = !mine || legalIds[c.id];
    var d = document.createElement('div');
    d.className = 'card small' + (c.red ? ' red' : ' black'); d.style.opacity = ok ? '1' : '0.35';
    d.innerHTML = esc(c.rank) + '<span class="sub">' + esc(c.suit) + '</span>';
    d.onclick = function () {
      if (!mine) return;
      if (!legalIds[c.id]) {
        var has = hand.some(function (x) { return x.suit === S.ledSuit; });
        alert(S.ledSuit ? (has ? 'Must follow ' + S.ledSuit : 'Void — must trump with ♠ if you hold one') : '');
        return;
      }
      sfx('click'); act('play', { cardId: c.id });
    };
    tray.appendChild(d);
  });
  var bb = $('bidBox');
  if (S.phase === 'bid' && turnSeat && turnSeat.id === ME) {
    bb.style.display = 'flex'; var bp = $('bidPick'); bp.innerHTML = '';
    for (var n = 1; n <= 8; n++) { (function (v) { var b = document.createElement('button'); b.className = 'chipbtn' + (S.bids[ME] === v ? ' on' : ''); b.textContent = v; b.onclick = function () { sfx('click'); act('bid', { n: v }); }; bp.appendChild(b); })(n); }
  } else bb.style.display = 'none';
  var lim = S.phase === 'bid' ? BID_S : TURN_S;
  var ms = (S.deadline || Date.now()) - Date.now();
  var f = $('timerFill'); if (f) f.style.width = Math.max(0, Math.min(100, ms / (lim * 1000) * 100)) + '%';
}
if ($('startBtn')) $('startBtn').onclick = function () { if (!net.isHost) { alert('Host only'); return; } hostStart(); };
if ($('leadBtn')) $('leadBtn').onclick = function () { sfx('click'); render(); };
/* watchdog: host advances on timeout (bid default 1, play auto lowest legal) */
setInterval(function () {
  if (!S || S.phase === 'lobby' || S.phase === 'over') return;
  if (Date.now() <= (S.deadline || 0)) return;
  if (!net.isHost) return;
  var s = S.seats[S.turn]; if (!s) return;
  if (S.phase === 'bid') hostBid(s.id, s.bot ? botBid(S.hands[s.id] || []) : 1);
  else if (s.bot) { var c = botChoose(s); if (c) hostPlay(s.id, c.id); }
  else { var h = S.hands[s.id] || []; var l = legal(h.slice(), h, S.ledSuit)[0] || h[0]; if (l) hostPlay(s.id, l.id); }
}, 1000);
try { net.hello(); } catch (e) {}
load(); render();
setTimeout(function () { if (!net.isHost) { try { net.send('need_state', { from: ME }); } catch (e) {} } }, 500);
})();
