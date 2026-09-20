/* Shared ws-client: server-backed realtime (express+ws) + legacy offline-first.
   Server API (used by shell.js lobby):
     new WSClient(url?) -> client with on/createRoom/joinRoom/relay/
       startGame/endGame/kick/setChips/leave/reconnect/close
     + auto-reconnect + ws/wss autodetect
   Legacy APIs (used by existing games, preserved):
     WSClient.join/connect/send/relay/on/onMessage/isHost/rejoin
     and LBFNet.join. Transport: BroadcastChannel + localStorage.
   No dependencies. */
(function () {
  'use strict';
  /* ============ Server-backed client (shell.js lobby) ============ */
  function autodetectUrl() {
    try {
      var proto = (window.location && window.location.protocol === 'https:') ? 'wss://' : 'ws://';
      var host = (window.location && window.location.host) || 'localhost:3000';
      return proto + host + '/';
    } catch (e) { return 'ws://localhost:3000/'; }
  }
  function ServerWSClient(url) {
    if (!(this instanceof ServerWSClient)) return new ServerWSClient(url);
    this.url = url || autodetectUrl();
    this.handlers = {}; // ev -> [fn]
    this.connected = false;
    this._ws = null;
    this._wantClose = false;
    this._reconnectAttempts = 0;
    this._reconnectTimer = null;
    this._queue = []; // messages waiting for open
    this._lastJoin = null; // {code,name,chips} for auto-rejoin
    this._connect();
  }
  ServerWSClient.prototype.on = function (ev, fn) {
    (this.handlers[ev] = this.handlers[ev] || []).push(fn);
    return this;
  };
  ServerWSClient.prototype._emit = function (ev, data) {
    var arr = this.handlers[ev] || [];
    for (var i = 0; i < arr.length; i++) { try { arr[i](data); } catch (e) {} }
  };
  ServerWSClient.prototype._sendRaw = function (obj) {
    if (this._ws && this._ws.readyState === 1) {
      try { this._ws.send(JSON.stringify(obj)); return true; } catch (e) { return false; }
    }
    this._queue.push(obj);
    return false;
  };
  ServerWSClient.prototype._flush = function () {
    while (this._queue.length && this._ws && this._ws.readyState === 1) {
      var o = this._queue.shift();
      try { this._ws.send(JSON.stringify(o)); } catch (e) { this._queue.unshift(o); break; }
    }
  };
  ServerWSClient.prototype._connect = function () {
    var self = this;
    if (self._wantClose) return;
    var ws;
    try { ws = new WebSocket(self.url); } catch (e) { self._scheduleReconnect(); return; }
    self._ws = ws;
    ws.onopen = function () {
      self.connected = true;
      self._reconnectAttempts = 0;
      self._flush();
      // auto-rejoin last room so refresh/resume keeps seat
      if (self._lastJoin) {
        try { ws.send(JSON.stringify({ type: 'join', code: self._lastJoin.code, name: self._lastJoin.name, chips: self._lastJoin.chips })); } catch (e) {}
      } else if (self._lastCreate) {
        try { ws.send(JSON.stringify({ type: 'create', name: self._lastCreate.name, chips: self._lastCreate.chips })); } catch (e) {}
      }
      self._emit('connect', {});
    };
    ws.onmessage = function (e) {
      var msg;
      try { msg = JSON.parse(e.data); } catch (_) { return; }
      var t = msg && msg.type;
      if (t === 'pong') return;
      if (t === 'joined') {
        // normalise: server sends {you:{id,name,...}, room:{code,...}}
        var norm = { room: msg.room || null, you: msg.you || null };
        if (msg.you) { norm.id = msg.you.id; norm.playerId = msg.you.id; norm.myId = msg.you.id; norm.name = msg.you.name; }
        if (msg.room) { norm.code = msg.room.code; }
        if (msg.reconnected) norm.reconnected = true;
        if (msg.you && msg.you.reconnected) norm.reconnected = true;
        // keep raw too
        for (var k in msg) { if (!(k in norm)) norm[k] = msg[k]; }
        if (norm.room && norm.room.code && norm.you) {
          self._lastJoin = { code: String(norm.room.code).toUpperCase(), name: norm.you.name, chips: norm.you.chips };
        }
        self._emit('joined', norm);
        if (norm.room) self._emit('room', { room: norm.room });
        return;
      }
      if (t === 'room') { self._emit('room', msg); return; }
      if (t === 'action') { self._emit('action', msg); self._emit('relay', msg); return; }
      if (t === 'game-start') { self._emit('game-start', msg); self._emit('game_start', msg); return; }
      if (t === 'game-end') { self._emit('game-end', msg); self._emit('game_end', msg); return; }
      if (t === 'kicked') { self._emit('kicked', msg); return; }
      if (t === 'error') { self._emit('error', msg); return; }
      self._emit(t || 'message', msg);
    };
    ws.onclose = function (e) {
      self.connected = false;
      // 4400 = kicked by host: do not auto-reconnect, surface event
      if (e && e.code === 4400) { self._emit('kicked', { code: 4400 }); self._emit('disconnect', { kicked: true }); return; }
      self._emit('disconnect', { code: e && e.code });
      if (!self._wantClose) self._scheduleReconnect();
    };
    ws.onerror = function () { try { ws.close(); } catch (e) {} };
  };
  ServerWSClient.prototype._scheduleReconnect = function () {
    var self = this;
    if (self._wantClose) return;
    if (self._reconnectTimer) return;
    self._reconnectAttempts += 1;
    var wait = Math.min(1000 * Math.pow(1.5, Math.min(self._reconnectAttempts, 8)), 10000);
    self._reconnectTimer = setTimeout(function () {
      self._reconnectTimer = null;
      self._connect();
    }, wait);
  };
  ServerWSClient.prototype.reconnect = function () {
    this._wantClose = false;
    try { if (this._ws) this._ws.close(); } catch (e) {}
    this._connect();
  };
  ServerWSClient.prototype.close = function () {
    this._wantClose = true;
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
    try { this._sendRaw({ type: 'leave' }); } catch (e) {}
    try { if (this._ws) this._ws.close(); } catch (e) {}
    this.connected = false;
  };
  ServerWSClient.prototype.createRoom = function (name, chips) {
    this._wantClose = false;
    this._lastCreate = { name: name, chips: chips };
    this._lastJoin = null;
    this._sendRaw({ type: 'create', name: name, chips: chips });
  };
  ServerWSClient.prototype.joinRoom = function (code, name, chips) {
    this._wantClose = false;
    this._lastJoin = { code: String(code || '').toUpperCase(), name: name, chips: chips };
    this._lastCreate = null;
    this._sendRaw({ type: 'join', code: code, name: name, chips: chips });
  };
  ServerWSClient.prototype.relay = function (data) {
    this._sendRaw({ type: 'action', data: data });
  };
  // aliases used by some games
  ServerWSClient.prototype.sendAction = ServerWSClient.prototype.relay;
  ServerWSClient.prototype.send = function (data) {
    if (data && typeof data === 'object' && data.type && (data.type === 'action' || data.type === 'relay')) {
      this.relay(data.data !== undefined ? data.data : data);
    } else {
      this.relay(data);
    }
  };
  ServerWSClient.prototype.broadcast = ServerWSClient.prototype.relay;
  ServerWSClient.prototype.startGame = function (game) {
    this._sendRaw({ type: 'start-game', game: game });
  };
  ServerWSClient.prototype.endGame = function (results) {
    this._sendRaw({ type: 'end-game', results: results || [] });
  };
  ServerWSClient.prototype.kick = function (playerId) {
    this._sendRaw({ type: 'kick', playerId: playerId });
  };
  ServerWSClient.prototype.setChips = function (chips) {
    this._sendRaw({ type: 'set-chips', chips: chips });
  };
  ServerWSClient.prototype.leave = function () {
    this._sendRaw({ type: 'leave' });
    this._lastJoin = null; this._lastCreate = null;
  };
  ServerWSClient.prototype.ping = function () { this._sendRaw({ type: 'ping' }); };
  function qs(k) { try { return new URLSearchParams(location.search).get(k); } catch (e) { return null; } }
  function uid(p) { return (p || 'p') + '_' + Math.random().toString(36).slice(2, 8); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]); }); }
  var buses = {}; // room -> bus
  function getBus(room) {
    if (buses[room]) return buses[room];
    var handlers = [];
    var bc = null; try { bc = new BroadcastChannel('lbg_' + room); } catch (e) {}
    var bus = { room: room, handlers: handlers, bc: bc, ws: null };
    if (bc) bc.onmessage = function (e) { fire(room, e.data); };
    window.addEventListener('storage', function (e) {
      if (e.key === 'lbg_bc_' + room && e.newValue) { try { fire(room, JSON.parse(e.newValue)); } catch (_) {} }
    });
    var wsUrl = qs('ws');
    if (wsUrl) { try { bus.ws = new WebSocket(wsUrl); bus.ws.onmessage = function (e) { try { fire(room, JSON.parse(e.data)); } catch (_) {} }; } catch (e) {} }
    buses[room] = bus;
    return bus;
  }
  function fire(room, msg) {
    var bus = buses[room]; if (!bus || !msg || msg.room !== room) return;
    bus.handlers.slice().forEach(function (fn) { try { fn(msg); } catch (e) {} });
  }
  function publish(room, msg) {
    var bus = getBus(room);
    try { bus.bc && bus.bc.postMessage(msg); } catch (e) {}
    try { localStorage.setItem('lbg_bc_' + room, JSON.stringify(Object.assign({ n: Date.now() }, msg))); } catch (e) {}
    if (bus.ws && bus.ws.readyState === 1) { try { bus.ws.send(JSON.stringify(msg)); } catch (e) {} }
  }
  function myIdent(room) {
    var pid = sessionStorage.getItem('lbg_pid_' + room);
    if (!pid) { pid = uid('p'); try { sessionStorage.setItem('lbg_pid_' + room, pid); } catch (e) {} }
    var nm = sessionStorage.getItem('lbg_name_' + room) || qs('name') || ('Player' + pid.slice(-3).toUpperCase());
    try { sessionStorage.setItem('lbg_name_' + room, nm); } catch (e) {}
    // legacy keys mirror
    try {
      if (!sessionStorage.getItem('lb_id')) sessionStorage.setItem('lb_id', pid);
      if (!sessionStorage.getItem('lb_name')) sessionStorage.setItem('lb_name', nm);
    } catch (e) {}
    return { pid: pid, name: nm };
  }
  function hostIdFor(room, pid) {
    var k = 'lbg_hostid_' + room, h = null;
    try { h = localStorage.getItem(k); } catch (e) {}
    if (!h || qs('host') === '1') { h = pid; try { localStorage.setItem(k, pid); } catch (e) {} }
    return h;
  }
  function chipsGet() { var v = parseInt(localStorage.getItem('lbg_chips') || '500', 10); return isNaN(v) ? 500 : v; }
  function chipsSet(v) { try { localStorage.setItem('lbg_chips', String(v)); } catch (e) {} var el = document.getElementById('chipCount') || document.getElementById('chipsMe'); if (el) el.textContent = v; }
  function showResult(title, winner, deltas, pid) {
    var ov = document.getElementById('overlay'); if (!ov) return;
    var myD = deltas && deltas[pid] != null ? ((deltas[pid] >= 0 ? '+' : '') + deltas[pid]) : '';
    ov.classList.add('show');
    ov.innerHTML = '<div class="modal"><h2>' + esc(title || 'Game Over') + '</h2><p>Winner: <b>' + esc(winner || '-') + '</b></p>' +
      '<p class="muted">Your chips change: <b>' + esc(myD || '0') + '</b> · Balance: <b>' + chipsGet() + '</b></p>' +
      '<div class="controls"><button class="btn btn-gold" onclick="document.getElementById(\'overlay\').classList.remove(\'show\')">Continue</button>' +
      '<button class="btn" onclick="location.reload()">Play Again</button></div></div>';
  }
  function makeClient(roomHint, nameHint) {
    var room = String(roomHint || qs('room') || sessionStorage.getItem('lb_code') || 'lobby').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'lobby';
    var id = myIdent(room);
    if (nameHint) { id.name = nameHint; try { sessionStorage.setItem('lbg_name_' + room, nameHint); } catch (e) {} }
    var hid = hostIdFor(room, id.pid);
    var peers = {}; peers[id.pid] = { name: id.name, ts: Date.now() };
    var typeHandlers = {};
    var renderCb = null;
    var bus = getBus(room);
    function emit(type, payload, from) { (typeHandlers[type] || []).forEach(function (fn) { try { fn(payload, from); } catch (e) {} }); }
    function onBus(msg) {
      if (!msg || msg.room !== room || msg.from === id.pid) return;
      if (msg.type === 'hello') { peers[msg.from] = { name: msg.name, ts: Date.now() }; if (renderCb) renderCb(); emit('peer', { id: msg.from, name: msg.name }, msg.from); return; }
      if (msg.type === 'game_over') { if (msg.payload && msg.payload.deltas && msg.payload.deltas[id.pid]) chipsSet(chipsGet() + msg.payload.deltas[id.pid]); showResult(msg.payload.title, msg.payload.winner, msg.payload.deltas, id.pid); try { window.Sound && (window.Sound.playWinChime ? window.Sound.playWinChime() : window.Sound.win && window.Sound.win()); } catch (e) {} }
      emit(msg.type, msg.payload, msg.from);
      emit('*', msg, msg.from);
    }
    bus.handlers.push(onBus);
    function sendRaw(type, payload) { publish(room, { room: room, from: id.pid, name: id.name, type: type, payload: payload }); }
    var client = {
      room: room, playerId: id.pid, playerName: id.name, peers: peers,
      get isHost() { var h = null; try { h = localStorage.getItem('lbg_hostid_' + room); } catch (e) {} return (h || hid) === id.pid; },
      on: function (t, fn) { (typeHandlers[t] = typeHandlers[t] || []).push(fn); },
      send: function (t, p) { sendRaw(t, p); },
      broadcast: function (t, p) { sendRaw(t, p); if (t === 'state') emit('state', p, id.pid); },
      hello: function () { sendRaw('hello', { name: id.name }); },
      onRender: function (fn) { renderCb = fn; },
      getChips: chipsGet, setChips: chipsSet,
      addChips: function (d) { var v = chipsGet() + d; chipsSet(v); return v; },
      _escape: esc,
      endGame: function (deltas, winnerName, title) {
        if (client.isHost) {
          Object.keys(deltas || {}).forEach(function (pid) { if (pid === id.pid) chipsSet(chipsGet() + deltas[pid]); });
          publish(room, { room: room, from: id.pid, name: id.name, type: 'game_over', payload: { deltas: deltas, winner: winnerName, title: title || 'Game Over' } });
          showResult(title || 'Game Over', winnerName, deltas, id.pid);
        } else {
          sendRaw('game_over_req', { deltas: deltas, winner: winnerName, title: title });
        }
      }
    };
    setTimeout(function () { try { client.hello(); } catch (e) {} }, 120);
    setInterval(function () { try { client.hello(); } catch (e) {} }, 9000);
    return client;
  }
  // ---- legacy WSClient singleton surface (teen-patti/kitti style) ----
  var legacy = { _client: null, _room: 'lobby' };
  function legClient() { if (!legacy._client) legacy._client = makeClient(legacy._room, null); return legacy._client; }
  var WS = {
    join: makeClient,
    connect: function (opts) { opts = opts || {}; legacy._room = opts.code || qs('room') || 'lobby'; legacy._client = makeClient(legacy._room, opts.name); return legacy._client; },
    send: function (o) { var c = legClient(); var t = (o && o.type) || 'relay'; c.send(t, o); },
    relay: function (o) { var c = legClient(); var t = (o && o.type) || 'relay'; c.send(t, o); },
    on: function (fn) { legClient().on('*', function (msg) { fn(msg && msg.payload ? msg.payload : msg); }); },
    onMessage: function (fn) { legClient().on('*', function (msg) { fn(msg && msg.payload ? msg.payload : msg); }); },
    isHost: function () { return legClient().isHost; },
    rejoin: function (code) { legacy._room = code || legacy._room; legacy._client = makeClient(legacy._room, null); try { legacy._client.hello(); } catch (e) {} }
  };
  // Server constructor + legacy statics: supports BOTH
  //   new WSClient(url) (server-backed, shell.js lobby) AND
  //   WSClient.connect/send/relay/on/... (games; now bridged to BOTH
  //   BroadcastChannel for same-device tabs AND live game server for online).
  // BUGFIX 2026-09-20: card games previously only used BroadcastChannel,
  // so online play across devices was broken. The bridge below opens a
  // server WS (same origin '/') on connect() and forwards relay() there.
  var srv = { ws: null, myId: null, hostId: null, code: null, handlers: [], connected: false };
  function srvUrl() {
    try { return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/'; }
    catch (e) { return 'ws://localhost:3000/'; }
  }
  function srvEmit(data) {
    // feed server action payload into legacy-style handlers
    var arr = srv.handlers.slice();
    for (var i = 0; i < arr.length; i++) { try { arr[i](data); } catch (e) {} }
  }
  function srvConnect(code, name) {
    srv.code = code;
    if (srv.ws) { try { srv.ws.close(); } catch (e) {} srv.ws = null; srv.connected = false; }
    if (!code || code === 'LOCAL' || code === 'lobby') return;
    if (location.protocol === 'file:') return;
    var ws;
    try { ws = new WebSocket(srvUrl()); } catch (e) { return; }
    srv.ws = ws;
    ws.onopen = function () {
      srv.connected = true;
      var chips = 200;
      try { chips = parseInt(sessionStorage.getItem('lb_chips') || localStorage.getItem('lbg_chips') || '200', 10) || 200; } catch (e) {}
      try { ws.send(JSON.stringify({ type: 'join', code: code, name: name || 'Guest', chips: chips })); } catch (e) {}
    };
    ws.onmessage = function (ev) {
      var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (!m || !m.type) return;
      if (m.type === 'joined') {
        if (m.you && m.you.id) srv.myId = m.you.id;
        try { sessionStorage.setItem('lb_id', srv.myId); } catch (e) {}
        if (m.room && m.room.hostId) srv.hostId = m.room.hostId;
      } else if (m.type === 'room') {
        if (m.room && m.room.hostId) srv.hostId = m.room.hostId;
      } else if (m.type === 'action' && m.data) {
        // unwrap server envelope -> legacy payload shape
        var d = m.data;
        srvEmit(d && d.payload !== undefined ? d.payload : d);
      }
    };
    ws.onclose = function () { srv.connected = false; };
    ws.onerror = function () { try { ws.close(); } catch (e) {} };
  }
  function srvRelay(obj) {
    if (!srv.ws || srv.ws.readyState !== 1) return;
    try { srv.ws.send(JSON.stringify({ type: 'action', data: obj })); } catch (e) {}
  }
  ServerWSClient.join = makeClient;
  ServerWSClient.connect = function (opts) {
    opts = opts || {};
    var code = opts.code || qs('room') || qs('code') || (function(){ try { return sessionStorage.getItem('lb_code'); } catch (e) { return null; } })() || 'lobby';
    var name = opts.name || (function(){ try { return sessionStorage.getItem('lb_name'); } catch (e) { return null; } })() || 'Guest';
    legacy._room = code; legacy._client = makeClient(legacy._room, name);
    try { srvConnect(code, name); } catch (e) {}
    return legacy._client;
  };
  ServerWSClient.send = function (o) { var c = legClient(); var t = (o && o.type) || 'relay'; try { c.send(t, o); } catch (e) {} srvRelay(o); };
  ServerWSClient.relay = function (o) { var c = legClient(); var t = (o && o.type) || 'relay'; try { c.send(t, o); } catch (e) {} srvRelay(o); };
  ServerWSClient.on = function (fn) {
    legClient().on('*', function (msg) { fn(msg && msg.payload ? msg.payload : msg); });
    srv.handlers.push(fn);
  };
  ServerWSClient.onMessage = function (fn) {
    legClient().on('*', function (msg) { fn(msg && msg.payload ? msg.payload : msg); });
    srv.handlers.push(fn);
  };
  ServerWSClient.isHost = function () {
    if (srv.myId && srv.hostId) return srv.myId === srv.hostId;
    try { return legClient().isHost; } catch (e) { return true; }
  };
  ServerWSClient.rejoin = function (code) {
    legacy._room = code || legacy._room; legacy._client = makeClient(legacy._room, null);
    try { legacy._client.hello(); } catch (e) {}
    try { var nm = (function(){ try { return sessionStorage.getItem('lb_name'); } catch (e) { return null; } })() || 'Guest'; srvConnect(legacy._room, nm); } catch (e) {}
  };
  ServerWSClient._srv = srv;
  window.WSClient = ServerWSClient;
  // ---- LBFNet rich surface (3D dice games: langur-burja / sic-bo / roulette) ----
  // Full host-authoritative roster API built on BroadcastChannel('lbf_'+room).
  // Minimal legacy surface preserved as window.LBFNet._minimal.
  (function () {
    var minimalJoin = window.LBFNet.join;
    window.LBFNet._minimal = minimalJoin;
    var BOT_NAMES = ['Asha', 'Bikash', 'Chandra', 'Deepa', 'Elina', 'Farhan', 'Gita', 'Hari'];
    function qsp(name, def) {
      try {
        var m = new RegExp('[?&]' + name + '=([^&]*)').exec(location.search);
        return m ? decodeURIComponent(m[1]) : def;
      } catch (e) { return def; }
    }
    function cryptoRand(n) {
      try {
        var a = new Uint32Array(1);
        (window.crypto || window.msCrypto).getRandomValues(a);
        return a[0] % n;
      } catch (e) { return Math.floor(Math.random() * n); }
    }
    window.LBFNet.join = function (roomName, opts) {
      opts = opts || {};
      var gameId = roomName || 'lobby';
      var minP = opts.min || 2, maxP = opts.max || 8;
      var fillBots = qsp('bots', '1') !== '0' && !qsp('name', null);
      var myName = qsp('name', 'You');
      var claimHost = qsp('host', '') === '1';
      var myId = 'p_' + Math.random().toString(36).slice(2, 8);
      var isHostFlag = !!claimHost;
      var claimedAt = Date.now();
      var players = [{ id: myId, name: myName, balance: 100, sitout: false, me: true }];
      var handlers = {}, betHandlers = [], playersHandlers = [];
      var chan = null;
      try { if ('BroadcastChannel' in window) chan = new BroadcastChannel('lbf_' + gameId); } catch (e) { chan = null; }
      var seenHellos = [];
      function emitPlayers(bcast) {
        var i;
        for (i = 0; i < playersHandlers.length; i++) { try { playersHandlers[i](players.slice()); } catch (e) {} }
        if (bcast !== false && isHostFlag && chan) {
          try { chan.postMessage({ t: '__roster', from: myId, data: players }); } catch (e) {}
        }
      }
      function emit(type, data, from) {
        var arr = handlers[type] || [];
        for (var i = 0; i < arr.length; i++) { try { arr[i](data, from || myId); } catch (e) {} }
      }
      if (chan) {
        chan.onmessage = function (ev) {
          var msg = ev.data || {};
          if (msg.t === '__hello') {
            seenHellos.push(msg);
            if (!claimHost && !isHostFlag) {
              var earliest = claimedAt, j;
              for (j = 0; j < seenHellos.length; j++) earliest = Math.min(earliest, seenHellos[j].at || Date.now());
              var forced = seenHellos.some(function (m) { return !!m.host; });
              if (!forced && claimedAt <= earliest) { isHostFlag = true; net.isHost = true; }
            }
            if (isHostFlag) {
              var found = players.some(function (p) { return p.id === msg.from; });
              if (!found && players.length < maxP) players.push({ id: msg.from, name: msg.name || 'Guest', balance: 100, sitout: false });
              emitPlayers(true);
            }
          } else if (msg.t === '__roster') {
            if (!isHostFlag && msg.data && msg.data.length) {
              var my = null, i;
              for (i = 0; i < players.length; i++) if (players[i].id === myId) my = players[i];
              players = msg.data.slice();
              var hasMe = false;
              for (i = 0; i < players.length; i++) {
                if (players[i].id === myId) { hasMe = true; if (my) players[i].balance = my.balance; players[i].me = true; }
              }
              if (!hasMe) players.push(my || { id: myId, name: myName, balance: 100, sitout: false, me: true });
              for (i = 0; i < playersHandlers.length; i++) { try { playersHandlers[i](players.slice()); } catch (e) {} }
            }
          } else if (msg.t === '__bye') {
            if (isHostFlag) { players = players.filter(function (p) { return p.id !== msg.from; }); emitPlayers(true); }
          } else {
            if (msg.t === 'bet' && isHostFlag) {
              for (var b = 0; b < betHandlers.length; b++) { try { betHandlers[b](msg.data, msg.from); } catch (e) {} }
            }
            emit(msg.t, msg.data, msg.from);
          }
        };
        try { chan.postMessage({ t: '__hello', from: myId, name: myName, at: claimedAt, host: claimHost }); } catch (e) {}
        window.addEventListener('beforeunload', function () { try { chan.postMessage({ t: '__bye', from: myId }); } catch (e) {} });
      }
      var net = {
        gameId: gameId, playerId: myId,
        isHost: isHostFlag,
        me: function () {
          for (var i = 0; i < players.length; i++) if (players[i].id === myId) return players[i];
          return players[0];
        },
        get players() { return players; },
        get playerName() { return myName; },
        onPlayers: function (fn) { playersHandlers.push(fn); try { fn(players.slice()); } catch (e) {} },
        on: function (type, fn) {
          // support both on(type, fn) and legacy on(fn)
          if (typeof type === 'function' && fn === undefined) { (handlers['*'] = handlers['*'] || []).push(type); return; }
          (handlers[type] = handlers[type] || []).push(fn);
        },
        onMessage: function (fn) { (handlers['*'] = handlers['*'] || []).push(fn); },
        onBet: function (fn) { betHandlers.push(fn); },
        broadcast: function (type, data) {
          if (chan) { try { chan.postMessage({ t: type, from: myId, data: data }); } catch (e) {} }
          if (type === 'bet' && isHostFlag) {
            for (var i = 0; i < betHandlers.length; i++) { try { betHandlers[i](data, myId); } catch (e) {} }
          }
          // local echo for non-bet types handled by callers' guards; emit but skip echo of roster internals
          if (type !== 'bet') emit(type, data, myId);
          var star = handlers['*'] || [];
          for (var s = 0; s < star.length; s++) { try { star[s]({ type: type, payload: data }); } catch (e) {} }
        },
        send: function (a, b) {
          // compat: send(type, payload) or send(obj)
          if (typeof a === 'string') this.broadcast(a, b);
          else if (a && a.type) this.broadcast(a.type, a.payload !== undefined ? a.payload : a);
          else this.broadcast('relay', a);
        },
        sendBet: function (data) { this.broadcast('bet', data); },
        setSitout: function (id, sit) {
          for (var i = 0; i < players.length; i++) if (players[i].id === id) players[i].sitout = !!sit;
          emitPlayers(true);
          this.broadcast('sitout', { id: id, sit: !!sit });
        },
        addBot: function () {
          if (!isHostFlag && !net.isHost) return null;
          if (players.length >= maxP) return null;
          var b = { id: 'bot_' + Math.random().toString(36).slice(2, 7), name: BOT_NAMES[cryptoRand(BOT_NAMES.length)] + ' (bot)', balance: 100, sitout: false, bot: true };
          players.push(b); emitPlayers(true); return b;
        },
        removePlayer: function (id) { players = players.filter(function (p) { return p.id !== id; }); emitPlayers(true); },
        applyDeltas: function (map) {
          for (var i = 0; i < players.length; i++) {
            var d = map[players[i].id];
            if (typeof d === 'number') players[i].balance += d;
          }
          emitPlayers(isHostFlag);
        },
        endGame: function (rows) { try { this.broadcast('game-over', { rows: rows || players }); } catch (e) {} },
        nextRound: function (n) { this.broadcast('next', { round: n }); },
        getChips: function () { var m = this.me(); return m ? m.balance : 0; }
      };
      net.on('sitout', function (d) {
        if (!d) return;
        for (var i = 0; i < players.length; i++) if (players[i].id === d.id) players[i].sitout = !!d.sit;
        for (var j = 0; j < playersHandlers.length; j++) { try { playersHandlers[j](players.slice()); } catch (e) {} }
      });
      setTimeout(function () {
        if (!seenHellos.length && !claimHost) { isHostFlag = true; net.isHost = true; }
        if (fillBots && players.length < minP && (isHostFlag || !chan)) {
          var need = Math.min(minP, maxP) - players.length;
          for (var i = 0; i < need; i++) {
            players.push({ id: 'bot_' + Math.random().toString(36).slice(2, 7), name: BOT_NAMES[(cryptoRand(40) + i) % BOT_NAMES.length] + ' (bot)', balance: 100, sitout: false, bot: true });
          }
          emitPlayers(true);
        }
        emitPlayers(false);
      }, 600);
      return net;
    };
  })();
})();
