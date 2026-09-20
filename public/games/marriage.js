/* =====================================================================
   Marriage (simplified 21-card rummy) — 2-5 players, host-authoritative
   3 decks (156 cards) · 21 cards each · stockpile + discard pile
   Phase 1: collect 3 pure seq / tunnel to unlock joker call
   Phase 2: Tiplu (host-picked rank) / Alter (next rank) / Man (stars) wild
   Win: all 21 grouped, 3+ pure, 7+ groups or 1+ dublee -> Declare
   Transport: WSClient.join (BroadcastChannel relay, sessionStorage rejoin)
   Order: deck compat -> sound compat -> net -> state -> host -> bots -> UI
   ===================================================================== */
(function () {
'use strict';
/* ---------------- 0. tiny utils ---------------- */
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]); }); }
function rnd(n) { return Math.floor(Math.random() * n); }
function pick(a) { return a[rnd(a.length)]; }
/* ---------------- 1. deck compat (works with stock DeckLib or local) ---------------- */
var SUITMAP = { S: '♠', H: '♥', D: '♦', C: '♣', '♠': '♠', '♥': '♥', '♦': '♦', '♣': '♣' };
var RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
var RVAL = { A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13 };
var RHIVAL = { A: 14, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13 };
var __uid = 0;
function normCard(c) {
  var suit = SUITMAP[c.suit] || c.suit || '♠';
  return { id: c.id || ('m_' + (__uid++) + '_' + c.rank + suit), rank: c.rank, suit: suit, red: (suit === '♥' || suit === '♦'), joker: !!c.joker };
}
function buildShoe(nDecks) {
  var out = [];
  try {
    if (window.DeckLib && window.DeckLib.Deck) {
      for (var d = 0; d < nDecks; d++) { var dd = new window.DeckLib.Deck({ decks: 1 }); dd.cards.forEach(function (c) { out.push(normCard(c)); }); }
      return out;
    }
  } catch (e) {}
  var suits = ['♠', '♥', '♦', '♣'];
  for (var k = 0; k < nDecks; k++) suits.forEach(function (s) { RANKS.forEach(function (r) { out.push(normCard({ rank: r, suit: s })); }); });
  return out;
}
function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = rnd(i + 1); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function sortHand(h) { return h.slice().sort(function (a, b) { if (a.suit !== b.suit) return a.suit < b.suit ? -1 : 1; return (RVAL[a.rank] || 0) - (RVAL[b.rank] || 0); }); }
/* meld helpers (local, deterministic) */
function isPureSeq(g) {
  if (!g || g.length < 3) return false;
  if (g.some(function (c) { return c.joker; })) return false;
  var s = g[0].suit;
  for (var i = 0; i < g.length; i++) if (g[i].suit !== s) return false;
  var vs = g.map(function (c) { return RVAL[c.rank]; }).sort(function (a, b) { return a - b; });
  for (var k = 1; k < vs.length; k++) if (vs[k] !== vs[k - 1] + 1) return false;
  return true;
}
function isTrial(g) { if (!g || g.length < 3 || g.length > 4) return false; if (g.some(function (c) { return c.joker; })) return false; return g.every(function (c) { return c.rank === g[0].rank; }); }
function isDublee(g) { return !!g && g.length === 2 && g[0].rank === g[1].rank && g[0].suit === g[1].suit; }
function isTunnel(g) { if (!g || g.length !== 2) return false; if (g[0].suit !== g[1].suit) return false; var r = [g[0].rank, g[1].rank].sort().join(','); return r === 'K,Q'; }
function findPureSeqs(hand) {
  var out = [];
  ['♠', '♥', '♦', '♣'].forEach(function (su) {
    var cs = hand.filter(function (c) { return c.suit === su && !c.joker; }).sort(function (a, b) { return RVAL[a.rank] - RVAL[b.rank]; });
    var run = [];
    for (var i = 0; i < cs.length; i++) {
      if (!run.length || RVAL[cs[i].rank] === RVAL[run[run.length - 1].rank] + 1) run.push(cs[i]);
      else { if (run.length >= 3) out.push(run.slice()); run = [cs[i]]; }
    }
    if (run.length >= 3) out.push(run.slice());
  });
  return out;
}
function findTrials(hand) {
  var by = {}; hand.forEach(function (c) { if (!c.joker) (by[c.rank] = by[c.rank] || []).push(c); });
  return Object.keys(by).map(function (k) { return by[k]; }).filter(function (g) { return g.length >= 3; });
}
function findDublees(hand) {
  var map = {}, out = [];
  hand.forEach(function (c) { var k = c.rank + c.suit; (map[k] = map[k] || []).push(c); });
  Object.keys(map).forEach(function (k) { var g = map[k]; while (g.length >= 2) out.push([g.pop(), g.pop()]); });
  return out;
}
function autoSuggest(hand) {
  var used = {}, groups = [];
  findPureSeqs(hand).forEach(function (g) { if (g.every(function (c) { return !used[c.id]; })) { g.forEach(function (c) { used[c.id] = 1; }); groups.push({ type: 'pure-seq', cards: g }); } });
  findTrials(hand).forEach(function (g) { if (g.every(function (c) { return !used[c.id]; })) { var t = g.slice(0, 3); t.forEach(function (c) { used[c.id] = 1; }); groups.push({ type: 'trial', cards: t }); } });
  findDublees(hand.filter(function (c) { return !used[c.id]; })).forEach(function (g) { groups.push({ type: 'dublee', cards: g }); });
  return groups;
}
/* ---------------- 2. sound compat ---------------- */
var Snd = {
  play: function (n) {
    try {
      var W = window.Sound || {};
      if (W.playWinChime && n === 'win') return W.playWinChime();
      if (W.playLossThud && n === 'lose') return W.playLossThud();
      if (W.playClick && (n === 'click' || n === 'turn')) return W.playClick();
      if (W.playCardDeal && (n === 'deal' || n === 'draw')) return W.playCardDeal();
      if (W.playCardFlip && n === 'flip') return W.playCardFlip();
      if (W.playChip && (n === 'chip' || n === 'joker')) return W.playChip();
      if (W.playYourTurn && n === 'turn') return W.playYourTurn();
      if (W.click === 'function' && W.click) { try { W.click(); return; } catch (e) {} }
      if (typeof W[n] === 'function') { try { W[n](); return; } catch (e) {} }
    } catch (e) {}
    try {
      var C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      var c = new C(), o = c.createOscillator(), g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.frequency.value = n === 'win' ? 880 : n === 'lose' ? 200 : n === 'chip' ? 1300 : 600;
      g.gain.value = 0.08; o.start(); o.stop(c.currentTime + 0.15);
      setTimeout(function () { try { c.close(); } catch (e) {} }, 250);
    } catch (e) {}
  },
  isMuted: function () { try { var W = window.Sound || {}; if (W.isMuted) return W.isMuted(); if (typeof W.muted !== 'undefined') return !!W.muted; } catch (e) {} return localStorage.getItem('lbg_muted') === '1'; },
  toggle: function () { try { var W = window.Sound || {}; if (W.toggleMuted) return W.toggleMuted(); if (W.toggle) return W.toggle(); } catch (e) {} var m = !(localStorage.getItem('lbg_muted') === '1'); localStorage.setItem('lbg_muted', m ? '1' : '0'); return m; }
};
/* ---------------- 3. net ---------------- */
var net = window.WSClient.join(null, null);
var ROOM = net.room, ME = net.playerId;
var ANTE = 20, TURN_S = 60;
var S = null, sel = {}, drew = false;
/* topbar / sidebar wiring */
function paintTop() {
  $('roomBox').textContent = 'Room: ' + ROOM + (net.isHost ? ' (you are HOST)' : '');
  var cc = $('chipCount'); if (cc) cc.textContent = net.getChips();
  var mb = $('muteBtn'); if (mb) mb.textContent = Snd.isMuted() ? '🔇' : '🔊';
}
if ($('muteBtn')) $('muteBtn').onclick = function () { Snd.toggle(); paintTop(); Snd.play('click'); };
if ($('menuBtn')) $('menuBtn').onclick = function () { $('sidebar').classList.toggle('open'); };
if ($('leaveBtn')) $('leaveBtn').onclick = function () { try { sessionStorage.removeItem('marriage_state_' + ROOM); } catch (e) {} location.href = '/'; };
if ($('rejoinBtn')) $('rejoinBtn').onclick = function () { try { net.hello(); net.send('need_state', { from: ME }); } catch (e) {} loadLocal(); Snd.play('click'); };
/* ---------------- 4. state ---------------- */
function defState() { return { players: [{ id: ME, name: net.playerName, bot: false }], hands: {}, groups: {}, stock: [], discard: [], turnIdx: 0, phase: 'lobby', tiplu: null, alter: null, winner: null, pot: 0, deadline: 0 }; }
function saveLocal() { try { sessionStorage.setItem('marriage_state_' + ROOM, JSON.stringify({ pid: ME, state: S })); } catch (e) {} }
function loadLocal() { try { var r = sessionStorage.getItem('marriage_state_' + ROOM); if (r) { var o = JSON.parse(r); if (o && o.state && !S) { S = o.state; render(); } } } catch (e) {} }
function cur() { if (!S || !S.players.length) return null; return S.players[S.turnIdx % S.players.length]; }
function push() { saveLocal(); try { net.broadcast('state', S); } catch (e) {} render(); }
function myHand() { return (S && S.hands && S.hands[ME]) || []; }
function myGroups() { return (S && S.groups && S.groups[ME]) || []; }
/* ---------------- 5. host authoritative actions ---------------- */
var drewMap = {};
function drewKey(pid) { return pid + '_' + (S ? S.turnIdx : 0); }
function hasDrawn(pid) { return !!drewMap[drewKey(pid)]; }
function setDrawn(pid, v) { drewMap[drewKey(pid)] = !!v; if (pid === ME) drew = !!v; }
function hostAddPeer(id, name) {
  if (!net.isHost || !id) return;
  if (!S) S = defState();
  if (S.players.length >= 5) return;
  if (!S.players.some(function (p) { return p.id === id; })) { S.players.push({ id: id, name: name || String(id).slice(0, 6), bot: false }); push(); }
}
function hostDeal() {
  if (!net.isHost) return;
  if (!S) S = defState();
  while (S.players.length < 3) { var b = 'bot' + Math.floor(Math.random() * 1e4); S.players.push({ id: b, name: 'Bot ' + b.slice(-3), bot: true }); }
  var deck = shuffle(buildShoe(3));
  S.hands = {}; S.groups = {};
  S.players.forEach(function (p) { S.hands[p.id] = sortHand(deck.splice(0, 21)); S.groups[p.id] = []; });
  S.stock = deck; S.discard = [S.stock.pop()];
  S.turnIdx = 0; S.phase = 'p1'; S.tiplu = null; S.alter = null; S.winner = null;
  S.pot = ANTE * S.players.length; S.deadline = Date.now() + TURN_S * 1000;
  drewMap = {}; setDrawn(cur().id, false);
  push(); Snd.play('deal');
}
function isWild(c) {
  if (!c) return false;
  if (c.joker || c.rank === 'JOKER' || c.suit === '★') return true;
  if (S.tiplu && c.rank === S.tiplu) return true;
  if (S.alter && c.rank === S.alter) return true;
  return false;
}
function validGroup(g) {
  if (!g || !g.length) return false;
  if (g.length === 2 && (isDublee(g) || isTunnel(g))) return true;
  if (isPureSeq(g) || isTrial(g)) return true;
  if (S.phase === 'p2' && g.length >= 3) {
    var wild = g.filter(isWild), nat = g.filter(function (c) { return !isWild(c); });
    if (wild.length && nat.length >= 2) {
      if (nat.every(function (c) { return c.suit === nat[0].suit; })) {
        var vs = nat.map(function (c) { return RVAL[c.rank]; }).sort(function (a, b) { return a - b; });
        var gap = (vs[vs.length - 1] - vs[0] + 1) - vs.length;
        if (gap <= wild.length) return true;
      }
      if (nat.every(function (c) { return c.rank === nat[0].rank; })) return true;
    }
  }
  return false;
}
function validateWin(hand, groups) {
  hand = hand || []; groups = groups || [];
  var total = hand.length + groups.reduce(function (a, g) { return a + g.length; }, 0);
  if (hand.length !== 0) return { ok: false, why: 'Tray must be empty — group all 21 cards (tray has ' + hand.length + ').' };
  if (total !== 21) return { ok: false, why: 'Need exactly 21 cards grouped, have ' + total + '.' };
  for (var i = 0; i < groups.length; i++) if (!validGroup(groups[i])) return { ok: false, why: 'Group ' + (i + 1) + ' invalid: ' + groups[i].map(function (c) { return c.rank + c.suit; }).join(' ') };
  var pure = groups.filter(function (g) { return isPureSeq(g) || isTunnel(g); }).length;
  if (pure < 3) return { ok: false, why: 'Need 3 pure seq/tunnel, have ' + pure + '.' };
  var dub = groups.filter(isDublee).length;
  if (groups.length < 7 && dub < 1) return { ok: false, why: 'Need 7+ groups or 1+ dublee (have ' + groups.length + ' groups, ' + dub + ' dublee).' };
  return { ok: true, pure: pure, dub: dub };
}
function tryJoker(pid) {
  if (!S || S.phase !== 'p1') return false;
  var gs = S.groups[pid] || [];
  var pure = gs.filter(function (g) { return isPureSeq(g) || isTunnel(g); }).length;
  if (pure < 3) return false;
  var hand = S.hands[pid] || [];
  var rank = (hand[0] && hand[0].rank) || pick(['A', 'K', 'Q', 'J', '10']);
  var ix = RANKS.indexOf(rank); if (ix < 0) ix = 0;
  S.tiplu = rank; S.alter = RANKS[(ix + 1) % RANKS.length]; S.phase = 'p2';
  push(); Snd.play('chip');
  return true;
}
function hostVerify(pid, groups, hand) {
  var v = validateWin(hand != null ? hand : S.hands[pid], groups != null ? groups : S.groups[pid]);
  if (v.ok) { S.winner = pid; S.phase = 'over'; push(); payout(pid); showWin(pid, v); return; }
  var p = null; S.players.forEach(function (x) { if (x.id === pid) p = x; });
  var ov = $('overlay'); ov.classList.add('show');
  var cards = (groups || []).map(function (g, i) { return '<div>Group ' + (i + 1) + ': ' + esc(g.map(function (c) { return c.rank + c.suit; }).join(' ')) + '</div>'; }).join('');
  ov.innerHTML = '<div class="modal"><h2>Declare — auto check failed</h2><p>' + esc(v.why) + '</p>' +
    '<p class="muted">' + esc((p && p.name) || pid) + ' requests manual host verify</p>' +
    '<div style="font-size:12px">' + cards + '</div>' +
    '<div class="controls" style="margin-top:10px"><button class="btn btn-green" id="mApprove">Host Approve</button> <button class="btn btn-danger" id="mReject">Reject</button></div></div>';
  $('mReject').onclick = function () { ov.classList.remove('show'); if (net.isHost) push(); };
  $('mApprove').onclick = function () {
    if (!net.isHost) { ov.innerHTML = '<div class="modal"><h2>Only host can approve</h2><div class="controls"><button class="btn" onclick="document.getElementById(\'overlay\').classList.remove(\'show\')">Close</button></div></div>'; return; }
    S.winner = pid; S.phase = 'over'; push(); payout(pid); showWin(pid, { manual: true });
  };
}
function payout(winnerId) {
  var n = S.players.length, deltas = {};
  S.players.forEach(function (p) { deltas[p.id] = (p.id === winnerId) ? (ANTE * (n - 1)) : (-ANTE); });
  var nm = 'Winner'; S.players.forEach(function (p) { if (p.id === winnerId) nm = p.name; });
  try { net.endGame(deltas, nm, 'Marriage — pot ' + S.pot); } catch (e) {}
  Snd.play('win');
}
function showWin(pid, v) {
  var p = { name: pid }; S.players.forEach(function (x) { if (x.id === pid) p = x; });
  var ov = $('overlay'); ov.classList.add('show');
  ov.innerHTML = '<div class="modal"><h2>🏆 ' + esc(p.name) + ' wins!</h2><p>Pot: ' + S.pot +
    ' · ' + (v.manual ? 'Host approved (manual)' : 'Auto-verified: ' + v.pure + ' pure, ' + v.dub + ' dublee') + '</p>' +
    '<div class="controls"><button class="btn btn-gold" onclick="document.getElementById(\'overlay\').classList.remove(\'show\')">Continue</button> <button class="btn" onclick="location.reload()">New Game</button></div></div>';
}
function hostAction(from, kind, data) {
  if (!net.isHost || !S) return;
  data = data || {};
  var t = cur();
  if (kind === 'draw' && t && t.id === from && !hasDrawn(from)) {
    if (!S.stock.length && S.discard.length > 1) { var keep = S.discard.pop(); S.stock = shuffle(S.discard); S.discard = [keep]; }
    var c = S.stock.pop(); if (c) S.hands[from].push(c);
    setDrawn(from, true); S.deadline = Date.now() + TURN_S * 1000; push();
  } else if (kind === 'take' && t && t.id === from && !hasDrawn(from)) {
    var d = S.discard.pop(); if (d) S.hands[from].push(d);
    setDrawn(from, true); push();
  } else if (kind === 'discard' && t && t.id === from) {
    var h = S.hands[from], ix = -1;
    for (var i = 0; i < h.length; i++) if (h[i].id === data.cardId) ix = i;
    if (ix >= 0 && hasDrawn(from)) {
      var out = h.splice(ix, 1)[0]; S.discard.push(out);
      setDrawn(from, false); S.turnIdx = (S.turnIdx + 1) % S.players.length;
      S.deadline = Date.now() + TURN_S * 1000; push(); botMaybe();
    }
  } else if (kind === 'groups') { S.groups[from] = data.groups || []; S.hands[from] = data.hand || S.hands[from]; push();
  } else if (kind === 'joker') { tryJoker(from);
  } else if (kind === 'declare') { hostVerify(from, data.groups, data.hand);
  } else if (kind === 'next') { S.turnIdx = (S.turnIdx + 1) % S.players.length; var n = cur(); if (n) setDrawn(n.id, false); S.deadline = Date.now() + TURN_S * 1000; push(); botMaybe(); }
}
/* ---------------- 6. bots ---------------- */
function botMaybe() {
  if (!net.isHost || !S || S.phase === 'over' || S.phase === 'lobby') return;
  var p = cur(); if (!p || !p.bot) return;
  setTimeout(function () {
    if (!S || S.phase === 'over' || !cur() || cur().id !== p.id) return;
    var hand = S.hands[p.id];
    var top = S.discard[S.discard.length - 1];
    var want = top && hand.some(function (c) { return c.suit === top.suit && Math.abs(RVAL[c.rank] - RVAL[top.rank]) <= 2; });
    if (want && S.discard.length) hand.push(S.discard.pop());
    else { var c = S.stock.pop(); if (c) hand.push(c); }
    var sug = autoSuggest(hand);
    if (sug.length >= 2) {
      var used = {}, gs = [];
      sug.slice(0, 4).forEach(function (g) { if (g.cards.every(function (x) { return !used[x.id]; })) { g.cards.forEach(function (x) { used[x.id] = 1; }); gs.push(g.cards); } });
      if (gs.length) { S.groups[p.id] = (S.groups[p.id] || []).concat(gs); S.hands[p.id] = hand.filter(function (x) { return !used[x.id]; }); hand = S.hands[p.id]; }
    }
    var pure = (S.groups[p.id] || []).filter(function (g) { return isPureSeq(g) || isTunnel(g); }).length;
    if (S.phase === 'p1' && pure >= 3) tryJoker(p.id);
    hand.sort(function (a, b) { return RVAL[b.rank] - RVAL[a.rank]; });
    var d = hand.shift(); if (d) S.discard.push(d);
    var v = validateWin(S.hands[p.id], S.groups[p.id]);
    if (v.ok) { hostVerify(p.id, S.groups[p.id], S.hands[p.id]); return; }
    S.turnIdx = (S.turnIdx + 1) % S.players.length;
    var n = cur(); if (n) setDrawn(n.id, false);
    S.deadline = Date.now() + TURN_S * 1000; push(); botMaybe();
  }, 1300);
}
/* ---------------- 7. net wiring ---------------- */
net.on('state', function (st) { S = st; saveLocal(); render(); if (net.isHost) botMaybe(); });
net.on('hello', function () { if (net.isHost && S) { try { net.broadcast('state', S); } catch (e) {} } });
net.on('need_state', function () { if (net.isHost && S) { try { net.broadcast('state', S); } catch (e) {} } });
net.on('peer', function () { renderPlayers(); });
net.on('action', function (p, from) { if (!net.isHost || !p) return; hostAction(p.from || from, p.kind, p.data); });
net.on('game_over_req', function (p) { if (net.isHost && p) hostVerify(p.from, p.data && p.data.groups, p.data && p.data.hand); });
function act(kind, data) { if (net.isHost) hostAction(ME, kind, data || {}); else { try { net.send('action', { from: ME, kind: kind, data: data || {} }); } catch (e) {} } }
/* ---------------- 8. rendering ---------------- */
function selList() { return Object.keys(sel).filter(function (k) { return sel[k]; }); }
function render() {
  if (!S) S = defState();
  paintTop(); renderPlayers(); renderPhase(); renderTable(); renderTray(); renderGroups(); tick();
}
function renderPlayers() {
  var box = $('players'); if (!box || !S) return;
  var t = cur();
  box.innerHTML = S.players.map(function (p) {
    return '<div class="player' + (t && t.id === p.id ? ' active' : '') + '"><div class="avatar">' + esc((p.name || '?')[0]) + '</div>' +
      '<div class="meta"><b>' + esc(p.name) + (p.id === ME ? ' (you)' : '') + (p.bot ? ' 🤖' : '') + '</b>' +
      '<span>' + ((S.hands[p.id] || []).length) + ' cards · ' + ((S.groups[p.id] || []).length) + ' groups</span></div></div>';
  }).join('');
}
function pureCountMine() { return myGroups().filter(function (g) { return isPureSeq(g) || isTunnel(g); }).length; }
function renderPhase() {
  var ph = S.phase;
  $('ph0').className = 'phase' + (ph === 'p1' ? ' on' : '') + ((ph === 'p2' || ph === 'over') ? ' done' : '');
  $('ph1').className = 'phase' + (ph === 'p2' ? ' on' : '') + (ph === 'over' ? ' done' : '');
  $('ph2').className = 'phase' + (ph === 'over' ? ' on done' : '');
  $('jTiplu').textContent = 'Tiplu: ' + (S.tiplu || '?'); $('jTiplu').className = 'jok' + (S.tiplu ? ' wild' : '');
  $('jAlter').textContent = 'Alter: ' + (S.alter || '?'); $('jAlter').className = 'jok' + (S.alter ? ' wild' : '');
  var pure = pureCountMine(), t = cur();
  var jb = $('jokerBtn');
  jb.disabled = !(S.phase === 'p1' && pure >= 3 && t && t.id === ME);
  jb.textContent = pure >= 3 ? 'Call Joker (' + pure + ' pure)' : 'Call Joker (need 3 pure, have ' + pure + ')';
}
function renderTable() {
  $('stockN').textContent = (S.stock || []).length;
  $('discardTop').innerHTML = S.discard.length ? cardHTMLStatic(S.discard[S.discard.length - 1], 'large') : '<div class="muted">empty</div>';
  var t = cur();
  $('turnInfo').textContent = S.phase === 'lobby' ? 'Press Start / Deal (host).'
    : S.phase === 'over' ? 'Game over. Winner: ' + winnerName()
    : ('Turn: ' + ((t || {}).name || '-') + (t && t.id === ME ? ' (YOU — ' + (drew ? 'discard one' : 'draw first') + ')' : '') + ' · Pot ' + S.pot);
  $('stockInfo').textContent = 'Tiplu ' + (S.tiplu || '?') + ' wild · Alter ' + (S.alter || '?') + ' wild';
  var mine = t && t.id === ME && S.phase !== 'over' && S.phase !== 'lobby';
  $('drawBtn').disabled = !mine || drew;
  $('takeDiscBtn').disabled = !mine || drew;
  $('discardBtn').disabled = !mine || !drew;
}
function winnerName() { var w = null; (S.players || []).forEach(function (p) { if (p.id === S.winner) w = p; }); return w ? w.name : (S.winner || '-'); }
function cardHTMLStatic(c, cls) {
  var red = c.red || c.suit === '♥' || c.suit === '♦';
  return '<div class="card ' + (red ? 'red' : 'black') + ' ' + (cls || '') + '">' + esc(c.rank === 'JOKER' ? '★' : c.rank) + '<span class="sub">' + esc(c.joker ? 'JK' : c.suit) + '</span></div>';
}
function cardEl(c) {
  var d = document.createElement('div');
  var red = c.red || c.suit === '♥' || c.suit === '♦';
  d.className = 'card small ' + (red ? 'red' : 'black') + (sel[c.id] ? ' sel' : '') + (c._sug ? ' suggest' : '');
  if (isWild(c)) d.classList.add('wild');
  d.innerHTML = esc(c.rank) + '<span class="sub">' + esc(c.suit) + '</span>';
  d.onclick = function () { Snd.play('click'); if (sel[c.id]) delete sel[c.id]; else sel[c.id] = 1; renderTray(); };
  return d;
}
function renderTray() {
  var t = $('tray'); t.innerHTML = '';
  sortHand(myHand()).forEach(function (c) { t.appendChild(cardEl(c)); });
}
function gtype(g) { if (isPureSeq(g)) return 'pure-seq'; if (isTrial(g)) return 'trial'; if (isDublee(g)) return 'dublee'; if (isTunnel(g)) return 'tunnel'; return validGroup(g) ? 'set' : 'invalid'; }
function renderGroups() {
  var box = $('groups'); box.innerHTML = '';
  myGroups().forEach(function (g, i) {
    var div = document.createElement('div'); div.className = 'group';
    var ok = validGroup(g);
    var head = document.createElement('div'); head.className = 'ghead';
    head.innerHTML = '<span>Group ' + (i + 1) + ' · ' + gtype(g) + ' ' + (ok ? '✓' : '✗') + '</span>';
    var btn = document.createElement('button'); btn.className = 'btn'; btn.textContent = 'Ungroup';
    btn.onclick = function () { var ng = myGroups().slice(); var moved = ng.splice(i, 1)[0]; commitGroups(ng, myHand().concat(moved)); };
    head.appendChild(btn); div.appendChild(head);
    var row = document.createElement('div'); row.className = 'grow';
    g.forEach(function (c) {
      var e2 = cardEl(c);
      e2.onclick = function () { Snd.play('click'); var ng = myGroups().slice(); var moved = ng.splice(i, 1)[0]; commitGroups(ng, myHand().concat(moved)); };
      row.appendChild(e2);
    });
    div.appendChild(row); box.appendChild(div);
  });
}
function commitGroups(ng, nh) {
  sel = {};
  if (net.isHost) { S.groups[ME] = ng; S.hands[ME] = nh; push(); }
  else { S.groups[ME] = ng; S.hands[ME] = nh; try { net.send('action', { from: ME, kind: 'groups', data: { groups: ng, hand: nh } }); } catch (e) {} render(); }
}
/* buttons */
$('newGroupBtn').onclick = function () {
  var h = myHand(), picks = h.filter(function (c) { return sel[c.id]; });
  if (picks.length < 2) { alert('Select 2+ cards'); return; }
  commitGroups(myGroups().concat([picks]), h.filter(function (c) { return !sel[c.id]; }));
  Snd.play('chip');
};
$('addGroupBtn').onclick = function () {
  var h = myHand(), picks = h.filter(function (c) { return sel[c.id]; });
  if (!picks.length || !myGroups().length) { alert('Select cards + need existing group'); return; }
  var ng = myGroups().slice(); ng[ng.length - 1] = ng[ng.length - 1].concat(picks);
  commitGroups(ng, h.filter(function (c) { return !sel[c.id]; }));
};
$('suggestBtn').onclick = function () {
  var h = myHand(), sug = autoSuggest(h);
  if (!sug.length) { alert('No pure seq/trial/dublee found'); return; }
  var used = {}, ng = myGroups().slice();
  sug.forEach(function (g) { if (g.cards.every(function (c) { return !used[c.id]; })) { g.cards.forEach(function (c) { used[c.id] = 1; }); ng.push(g.cards); } });
  commitGroups(ng, h.filter(function (c) { return !used[c.id]; }));
  Snd.play('turn');
};
$('drawBtn').onclick = function () { Snd.play('deal'); act('draw', {}); setTimeout(function () { try { if (net.isHost) drew = hasDrawn(ME); else drew = true; } catch (e) { drew = true; } render(); }, 350); };
$('takeDiscBtn').onclick = function () { Snd.play('deal'); act('take', {}); drew = true; setTimeout(render, 350); };
$('discardBtn').onclick = function () {
  var picks = myHand().filter(function (c) { return sel[c.id]; });
  if (picks.length !== 1) { alert('Select exactly 1 card to discard'); return; }
  sel = {}; drew = false; act('discard', { cardId: picks[0].id }); Snd.play('click');
};
$('jokerBtn').onclick = function () { act('joker', {}); };
$('declareBtn').onclick = function () {
  var v = validateWin(myHand(), myGroups());
  if (!v.ok && !confirm('Auto-check fails: ' + v.why + '\nSend to host for manual verify?')) return;
  if (net.isHost) hostVerify(ME, myGroups(), myHand());
  else try { net.send('action', { from: ME, kind: 'declare', data: { groups: myGroups(), hand: myHand() } }); } catch (e) {}
};
$('startBtn').onclick = function () { if (!net.isHost) { alert('Only host starts.'); return; } hostDeal(); };
$('nextBtn').onclick = function () { if (!net.isHost) { alert('Host only'); return; } act('next', {}); };
if ($('stockPile')) $('stockPile').onclick = function () { if (!$('drawBtn').disabled) $('drawBtn').click(); };
/* timer 60s */
var lastSec = -1;
function tick() {
  if (!S || S.phase === 'lobby' || S.phase === 'over') { var f = $('timerFill'); if (f) f.style.width = '100%'; return; }
  var ms = S.deadline - Date.now(), pct = Math.max(0, Math.min(100, ms / (TURN_S * 1000) * 100));
  $('timerFill').style.width = pct + '%';
  var sec = Math.ceil(ms / 1000);
  if (sec !== lastSec) { lastSec = sec; if (sec <= 0 && net.isHost) act('next', {}); }
}
setInterval(tick, 500);
/* boot with sessionStorage rejoin */
try { net.hello(); } catch (e) {}
loadLocal(); render();
setTimeout(function () { if (!net.isHost) { try { net.send('need_state', { from: ME }); } catch (e) {} } }, 500);
})();
