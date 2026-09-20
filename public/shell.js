/* ============================================================
   Langur Burja & Friends — shell.js (plain script, no modules)
   Depends on globals: window.WSClient, window.Sound
   ============================================================ */
(function () {
  'use strict';

  // ---------- tiny helpers ----------
  var $ = function (id) { return document.getElementById(id); };

  function qsCode() {
    try {
      var m = new URLSearchParams(window.location.search).get('code');
      return (m || '').trim().toUpperCase().slice(0, 8);
    } catch (e) { return ''; }
  }

  function inviteLink(code) {
    return window.location.origin + window.location.pathname + '?code=' + encodeURIComponent(code);
  }

  var toastTimer = null;
  function toast(msg, ok) {
    var el = $('error-toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('ok', !!ok);
    el.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 3800);
  }

  function play(fn) {
    try {
      if (window.Sound && typeof window.Sound[fn] === 'function') window.Sound[fn]();
    } catch (e) { /* ignore */ }
  }

  // ---------- state ----------
  var state = {
    myId: sessionStorage.getItem('lb_id') || null,
    name: sessionStorage.getItem('lb_name') || '',
    code: sessionStorage.getItem('lb_code') || '',
    chips: 200,
    room: null, // { code, players:[{id,name,chips,host}], startingChips, hostId }
    isHost: false,
    connected: false,
    reconnectAttempts: 0
  };

  var client = null;
  var reconnectTimer = null;

  // ---------- DOM refs (resolved on boot) ----------
  var els = {};

  function cacheEls() {
    els.joinScreen = $('join-screen');
    els.lobbyScreen = $('lobby-screen');
    els.playerName = $('player-name');
    els.chipsInput = $('chips-input');
    els.createBtn = $('create-btn');
    els.joinCode = $('join-code');
    els.joinBtn = $('join-btn');
    els.roomCode = $('room-code');
    els.copyLinkBtn = $('copy-link-btn');
    els.leaveBtn = $('leave-btn');
    els.playersGrid = $('players-grid');
    els.playerCount = $('player-count');
    els.startingChips = $('starting-chips');
    els.hostOnlyTag = $('host-only-tag');
    els.waitingMsg = $('waiting-msg');
    els.gameGrid = $('game-grid');
    els.muteBtn = $('mute-btn');
    els.rulesBtn = $('rules-btn');
    els.rulesModal = $('rules-modal');
    els.rulesClose = $('rules-close');
    els.banner = $('reconnect-banner');
    els.bannerText = $('reconnect-text');
    els.connStatus = $('conn-status');
  }

  // ---------- rendering ----------
  function renderJoin() {
    els.joinScreen.hidden = false;
    els.lobbyScreen.hidden = true;
  }

  function renderLobby() {
    els.joinScreen.hidden = true;
    els.lobbyScreen.hidden = false;
    var room = state.room;
    if (!room) return;

    els.roomCode.textContent = room.code || '------';
    els.playerCount.textContent = String((room.players || []).length);

    // starting chips box: host can edit, guests read-only
    els.startingChips.value = String(room.startingChips != null ? room.startingChips : state.chips);
    els.startingChips.disabled = !state.isHost;
    if (els.hostOnlyTag) els.hostOnlyTag.style.display = state.isHost ? '' : 'none';

    renderPlayers(room);
    renderGameButtons();
  }

  function renderPlayers(room) {
    var players = room.players || [];
    els.playersGrid.innerHTML = '';
    if (!players.length) {
      var empty = document.createElement('div');
      empty.className = 'player player-empty';
      empty.textContent = 'No players yet…';
      els.playersGrid.appendChild(empty);
      return;
    }
    players.forEach(function (p) {
      var div = document.createElement('div');
      div.className = 'player' + (p.id === state.myId ? ' me' : '');
      div.setAttribute('role', 'listitem');

      var av = document.createElement('div');
      av.className = 'player-avatar';
      av.textContent = (p.name || '?').charAt(0).toUpperCase();
      av.setAttribute('aria-hidden', 'true');

      var meta = document.createElement('div');
      meta.className = 'player-meta';
      var nm = document.createElement('div');
      nm.className = 'player-name';
      nm.textContent = p.name + (p.id === state.myId ? ' (you)' : '');
      var ch = document.createElement('div');
      ch.className = 'player-chips';
      ch.textContent = '🪙 ' + (p.chips != null ? p.chips : 0);

      meta.appendChild(nm);
      meta.appendChild(ch);
      div.appendChild(av);
      div.appendChild(meta);

      var isHostRow = (room.hostId && p.id === room.hostId) || p.host || p.isHost;
      if (isHostRow) {
        var b = document.createElement('span');
        b.className = 'host-badge';
        b.textContent = 'HOST';
        div.appendChild(b);
      }

      // host can kick others (click name with confirm) — small affordance
      if (state.isHost && p.id !== state.myId) {
        div.title = 'Click to kick ' + p.name;
        div.style.cursor = 'pointer';
        div.addEventListener('click', function () {
          if (confirm('Kick ' + p.name + '?')) {
            play('playClick');
            client.kick(p.id);
          }
        });
      }
      els.playersGrid.appendChild(div);
    });
  }

  function renderGameButtons() {
    var btns = els.gameGrid.querySelectorAll('.start-btn');
    btns.forEach(function (btn) {
      btn.style.display = state.isHost ? '' : 'none';
    });
    if (els.waitingMsg) els.waitingMsg.hidden = state.isHost;
  }

  function setBanner(show, text) {
    if (!els.banner) return;
    els.banner.hidden = !show;
    if (text && els.bannerText) els.bannerText.textContent = text;
    if (els.connStatus) {
      els.connStatus.textContent = show ? '○ reconnecting…' : '● connected';
      els.connStatus.className = 'conn ' + (show ? 'conn-bad' : 'conn-ok');
    }
  }

  // ---------- WS wiring ----------
  function wsUrl() {
    var proto = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    return proto + window.location.host + '/';
  }

  function ensureClient() {
    if (client) return client;
    if (!window.WSClient) {
      toast('Realtime library failed to load. Refresh the page.');
      throw new Error('WSClient missing');
    }
    client = new window.WSClient(wsUrl());

    client.on('connect', function () {
      state.connected = true;
      state.reconnectAttempts = 0;
      setBanner(false);
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      // if we were in a room, re-join silently
      if (state.code && state.name && !state.room) {
        try { client.joinRoom(state.code, state.name, state.chips); } catch (e) { /* handled via error */ }
      }
    });

    client.on('disconnect', function () {
      state.connected = false;
      setBanner(true, 'Connection lost. Reconnecting…');
      scheduleReconnect();
    });

    client.on('joined', function (msg) {
      var you = (msg && msg.you) || null;
      state.myId = (msg && (msg.id || msg.playerId || msg.myId)) || (you && you.id) || state.myId;
      if (you && you.name) state.name = you.name;
      if (msg && msg.code) state.code = String(msg.code).toUpperCase();
      if (msg && msg.room && msg.room.code) state.code = String(msg.room.code).toUpperCase();
      persist();
      if (msg && msg.room) applyRoom(msg.room);
    });

    client.on('room', function (msg) {
      var room = msg.room || msg;
      applyRoom(room);
    });

    client.on('action', function (msg) {
      // lobby-level relay actions (e.g. chips update echoes as room anyway)
      if (msg && msg.data && msg.data.t === 'chips-echo' && msg.data.startingChips != null) {
        if (state.room) { state.room.startingChips = msg.data.startingChips; renderLobby(); }
      }
    });

    client.on('game-start', function (msg) {
      var game = msg.game || msg.gameId || msg.g;
      var code = (msg.code || state.code || '').toUpperCase();
      if (!game) return;
      play('playYourTurn');
      persist();
      // preserve session then navigate
      var target = '/games/' + encodeURIComponent(game) + '.html?code=' + encodeURIComponent(code);
      window.location.href = target;
    });

    client.on('game-end', function (msg) {
      var s = 'Game over';
      if (msg) {
        if (msg.results && !Array.isArray(msg.results) && msg.results.winner) {
          s += ' — winner: ' + msg.results.winner;
        } else if (Array.isArray(msg.results) && msg.results.length) {
          s += ' — chips updated';
        }
      }
      toast(s, true);
      play('playWinChime');
      if (msg && msg.room) applyRoom(msg.room);
    });

    client.on('kicked', function () {
      toast('You were removed by host.');
      try { if (client) client.close(); } catch (e) {}
      state.room = null; state.isHost = false; state.code = '';
      try { sessionStorage.removeItem('lb_code'); } catch (e) {}
      client = null;
      renderJoin();
      setBanner(false);
    });

    client.on('error', function (msg) {
      var m = (msg && (msg.message || msg.error)) || 'Something went wrong';
      toast(m);
      play('playLossThud');
      // if join failed, go back to join screen
      if (!state.room) renderJoin();
      setBanner(false);
    });

    return client;
  }

  function applyRoom(room) {
    // normalise: server may send {code, players, hostId, startingChips|chips}
    state.room = room;
    if (room.code) state.code = String(room.code).toUpperCase();
    var hostId = room.hostId || room.host || null;
    if (!hostId && room.players) {
      for (var i = 0; i < room.players.length; i++) {
        if (room.players[i].host || room.players[i].isHost) { hostId = room.players[i].id; break; }
      }
    }
    if (!hostId && room.players && room.players.length) hostId = room.players[0].id;
    state.isHost = !!state.myId && state.myId === hostId;
    if (room.startingChips == null && room.chips != null) room.startingChips = room.chips;
    persist();
    renderLobby();
    setBanner(false);
  }

  function persist() {
    try {
      if (state.name) sessionStorage.setItem('lb_name', state.name);
      if (state.code) sessionStorage.setItem('lb_code', state.code);
      if (state.myId) sessionStorage.setItem('lb_id', state.myId);
    } catch (e) { /* private mode */ }
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    state.reconnectAttempts += 1;
    var wait = Math.min(2000 * state.reconnectAttempts, 10000);
    setBanner(true, 'Connection lost. Retrying in ' + Math.round(wait / 1000) + 's…');
    reconnectTimer = setTimeout(function () {
      reconnectTimer = null;
      try {
        ensureClient().reconnect();
      } catch (e) { scheduleReconnect(); }
    }, wait);
  }

  // ---------- actions ----------
  function validName(n) { return !!(n && n.trim().length >= 2 && n.trim().length <= 20); }
  function validCode(c) { return /^[A-Za-z0-9]{4,8}$/.test((c || '').trim()); }
  function chipsVal(el, fallback) {
    var n = parseInt(el && el.value, 10);
    if (!isFinite(n)) return fallback;
    return Math.max(10, Math.min(10000, n));
  }

  function doCreate() {
    var name = (els.playerName.value || '').trim();
    if (!validName(name)) { toast('Enter your name (2–20 letters).'); els.playerName.focus(); return; }
    state.name = name;
    state.chips = chipsVal(els.chipsInput, 200);
    state.room = null;
    persist();
    play('playClick');
    ensureClient().createRoom(name, state.chips);
    toast('Creating room…', true);
  }

  function doJoin(codeOverride) {
    var name = (els.playerName.value || '').trim();
    var code = ((codeOverride != null ? codeOverride : els.joinCode.value) || '').trim().toUpperCase();
    if (!validName(name)) { toast('Enter your name (2–20 letters).'); els.playerName.focus(); return; }
    if (!validCode(code)) { toast('Enter a valid 4–8 character room code.'); els.joinCode.focus(); return; }
    state.name = name;
    state.code = code;
    state.chips = chipsVal(els.chipsInput, 200);
    state.room = null;
    persist();
    play('playClick');
    ensureClient().joinRoom(code, name, state.chips);
    toast('Joining ' + code + '…', true);
  }

  function doCopyLink() {
    if (!state.room || !state.room.code) { toast('Join a room first.'); return; }
    var link = inviteLink(state.room.code);
    play('playToggle');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(
        function () { toast('Invite link copied! 🔗', true); },
        function () { fallbackCopy(link); }
      );
    } else { fallbackCopy(link); }
  }

  function fallbackCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      toast('Invite link copied! 🔗', true);
    } catch (e) { toast(text); }
  }

  // ---------- boot ----------
  function bindEvents() {
    els.createBtn.addEventListener('click', doCreate);
    els.joinBtn.addEventListener('click', function () { doJoin(); });
    els.joinCode.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') doJoin();
    });
    els.playerName.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var hasCode = (els.joinCode.value || '').trim().length > 0;
        if (hasCode) doJoin(); else doCreate();
      }
    });
    els.copyLinkBtn.addEventListener('click', doCopyLink);
    if (els.leaveBtn) els.leaveBtn.addEventListener('click', function () {
      play('playUndo');
      try { if (client) client.close(); } catch (e) {}
      state.room = null; state.isHost = false; state.code = '';
      try { sessionStorage.removeItem('lb_code'); } catch (e) {}
      client = null;
      renderJoin();
      toast('Left the room.', true);
    });

    // starting chips (host only) — debounce broadcast
    var chipsDeb = null;
    els.startingChips.addEventListener('input', function () {
      if (!state.isHost || !client) return;
      if (chipsDeb) clearTimeout(chipsDeb);
      chipsDeb = setTimeout(function () {
        var n = chipsVal(els.startingChips, 200);
        state.chips = n;
        try { client.setChips(n); } catch (e) { toast('Could not update chips.'); }
      }, 400);
    });

    // game start buttons (event delegation)
    els.gameGrid.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.start-btn') : null;
      if (!btn) return;
      if (!state.isHost) { toast('Only the host can start games.'); return; }
      var g = btn.getAttribute('data-game');
      if (!g) return;
      play('playDiceClack');
      try { client.startGame(g); }
      catch (err) { toast('Could not start game. Reconnecting…'); }
    });

    // mute
    function refreshMute() {
      var muted = window.Sound ? window.Sound.isMuted() : false;
      els.muteBtn.textContent = muted ? '🔇' : '🔊';
      els.muteBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
      els.muteBtn.setAttribute('aria-label', muted ? 'Unmute sounds' : 'Mute sounds');
    }
    els.muteBtn.addEventListener('click', function () {
      if (!window.Sound) return;
      window.Sound.setMuted(!window.Sound.isMuted());
      try { localStorage.setItem('lb_muted', window.Sound.isMuted() ? '1' : '0'); } catch (e) {}
      refreshMute();
      play('playToggle');
    });
    try {
      if (localStorage.getItem('lb_muted') === '1' && window.Sound) window.Sound.setMuted(true);
    } catch (e) {}
    refreshMute();

    // rules modal
    els.rulesBtn.addEventListener('click', function () {
      play('playClick');
      els.rulesModal.hidden = false;
    });
    els.rulesClose.addEventListener('click', function () {
      play('playUndo');
      els.rulesModal.hidden = true;
    });
    els.rulesModal.addEventListener('click', function (e) {
      if (e.target === els.rulesModal) els.rulesModal.hidden = true;
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !els.rulesModal.hidden) els.rulesModal.hidden = true;
    });
  }

  function boot() {
    cacheEls();
    bindEvents();

    // restore session + ?code= autofill
    var q = qsCode();
    var storedCode = '';
    try { storedCode = (sessionStorage.getItem('lb_code') || '').toUpperCase(); } catch (e) {}
    var initialCode = q || storedCode || '';
    if (initialCode && els.joinCode) els.joinCode.value = initialCode;
    try {
      var storedName = sessionStorage.getItem('lb_name') || '';
      if (storedName && els.playerName) els.playerName.value = storedName;
    } catch (e) {}

    renderJoin();
    // pre-connect so creating is instant
    try { ensureClient(); } catch (e) { /* toast already shown */ }

    // expose for game pages / debugging
    window.Shell = {
      get room() { return state.room; },
      get myId() { return state.myId; },
      get isHost() { return state.isHost; },
      get code() { return state.code; },
      client: function () { return ensureClient(); },
      toast: toast
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
