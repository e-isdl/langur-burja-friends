/* Sic Bo 3D — host-authoritative, 30s betting, 3 pip dice.
 * Bets per player: multiple {kind, sel, stake}.
 * kinds: small,big,trip(n),anytrip,double(n),total(n),single(n),two([a,b]),three([a,b,c])
 * Payouts: small/big 1:1 excl triple; specific triple 150:1; any triple 24:1;
 * double 8:1 (>=2 of rank); totals {4:50,5:18,6:14,7:12,8:8,9:6,10:6,11:6,12:6,13:8,14:12,15:14,16:18,17:50};
 * single 1/2/3 dice -> 1:1/2:1/3:1; two-combo 5:1; three-combo exact set 30:1.
 */
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  function rng(n) {
    try { var a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; }
    catch (e) { return Math.floor(Math.random() * n); }
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function betKey(b) { return b.kind + ':' + JSON.stringify(b.sel); }

  var TOTAL_PAY = { 4: 50, 5: 18, 6: 14, 7: 12, 8: 8, 9: 6, 10: 6, 11: 6, 12: 6, 13: 8, 14: 12, 15: 14, 16: 18, 17: 50 };
  var CAM = {
    start: { pos: [0, 8.6, 11.5], look: [0, 0, 0] },
    roll: { pos: [0, 14.6, 1.2], look: [0, 0, 0.4] },
    result: { pos: [0, 10.6, 4.2], look: [0, 0, 0.2] }
  };

  var net = window.LBFNet.join('sic-bo', { min: 2, max: 8 });
  var isHost = function () { return net.isHost; };

  var round = 1, phase = 'bet';
  var myChip = 5;
  var myBets = [];       // local player's bets this round
  var allBets = {};      // host view: pid -> bets[]
  var lastDice = [1, 2, 3];
  var betSecs = 30, betLeft = 30, betTimer = null;
  var twoSel = [], threeSel = [];

  // ---------- chips ----------
  Array.prototype.slice.call(document.querySelectorAll('.chip')).forEach(function (b) {
    b.addEventListener('click', function () {
      window.GameSound.click();
      Array.prototype.slice.call(document.querySelectorAll('.chip')).forEach(function (x) { x.classList.remove('sel'); });
      b.classList.add('sel');
      myChip = parseInt(b.getAttribute('data-c'), 10) || 5;
    });
  });

  // ---------- build grids ----------
  function pipBtn(label, sub) { return label + '<small>' + sub + '</small>'; }
  var tripGrid = $('tripGrid'), dblGrid = $('dblGrid'), totalGrid = $('totalGrid'),
      singleGrid = $('singleGrid'), twoPick = $('twoPick'), threePick = $('threePick');
  var i, b;
  for (i = 1; i <= 6; i++) {
    b = document.createElement('button'); b.className = 'bet'; b.innerHTML = pipBtn('⚀⚁⚂⚃⚄⚅'.charAt(i - 1) + ' ' + i + i + i, '150:1');
    b.setAttribute('data-k', 'trip'); b.setAttribute('data-n', String(i)); tripGrid.appendChild(b);
  }
  for (i = 1; i <= 6; i++) {
    b = document.createElement('button'); b.className = 'bet'; b.innerHTML = pipBtn('Pair ' + i + i, '8:1');
    b.setAttribute('data-k', 'double'); b.setAttribute('data-n', String(i)); dblGrid.appendChild(b);
  }
  for (i = 4; i <= 17; i++) {
    b = document.createElement('button'); b.className = 'bet'; b.innerHTML = pipBtn(String(i), TOTAL_PAY[i] + ':1');
    b.setAttribute('data-k', 'total'); b.setAttribute('data-n', String(i)); totalGrid.appendChild(b);
  }
  var PIPS = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  for (i = 1; i <= 6; i++) {
    b = document.createElement('button'); b.className = 'bet'; b.innerHTML = pipBtn(PIPS[i - 1] + ' ' + i, '1-3:1');
    b.setAttribute('data-k', 'single'); b.setAttribute('data-n', String(i)); singleGrid.appendChild(b);
  }
  for (i = 1; i <= 6; i++) {
    b = document.createElement('button'); b.className = 'bet'; b.textContent = PIPS[i - 1] + ' ' + i;
    b.setAttribute('data-pick', String(i)); twoPick.appendChild(b);
    b.addEventListener('click', function () {
      window.GameSound.click();
      var n = parseInt(this.getAttribute('data-pick'), 10);
      var ix = twoSel.indexOf(n);
      if (ix >= 0) twoSel.splice(ix, 1);
      else { twoSel.push(n); if (twoSel.length > 2) twoSel.shift(); }
      paintPicks();
    });
  }
  for (i = 1; i <= 6; i++) {
    b = document.createElement('button'); b.className = 'bet'; b.textContent = PIPS[i - 1] + ' ' + i;
    b.setAttribute('data-pick3', String(i)); threePick.appendChild(b);
    b.addEventListener('click', function () {
      window.GameSound.click();
      var n = parseInt(this.getAttribute('data-pick3'), 10);
      var ix = threeSel.indexOf(n);
      if (ix >= 0) threeSel.splice(ix, 1);
      else { threeSel.push(n); if (threeSel.length > 3) threeSel.shift(); }
      paintPicks();
    });
  }
  function paintPicks() {
    Array.prototype.slice.call(twoPick.children).forEach(function (c) {
      var n = parseInt(c.getAttribute('data-pick'), 10);
      c.classList.toggle('mine', twoSel.indexOf(n) >= 0);
    });
    Array.prototype.slice.call(threePick.children).forEach(function (c) {
      var n = parseInt(c.getAttribute('data-pick3'), 10);
      c.classList.toggle('mine', threeSel.indexOf(n) >= 0);
    });
  }
  $('addTwoBtn').addEventListener('click', function () {
    window.GameSound.chip();
    if (twoSel.length !== 2) { $('status').textContent = 'Pick exactly 2 numbers for a 2-combo.'; return; }
    addMyBet({ kind: 'two', sel: twoSel.slice().sort(), stake: myChip });
  });
  $('addThreeBtn').addEventListener('click', function () {
    window.GameSound.chip();
    if (threeSel.length !== 3) { $('status').textContent = 'Pick exactly 3 numbers for a 3-combo.'; return; }
    addMyBet({ kind: 'three', sel: threeSel.slice().sort(), stake: myChip });
  });
  $('clearPickBtn').addEventListener('click', function () { twoSel = []; paintPicks(); });

  // generic bet buttons (stack chips)
  Array.prototype.slice.call(document.querySelectorAll('.bet[data-k]')).forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (phase !== 'bet') return;
      window.GameSound.chip();
      var k = btn.getAttribute('data-k');
      var n = btn.getAttribute('data-n');
      var bet = { kind: k, stake: myChip, sel: null };
      if (k === 'trip' || k === 'double' || k === 'total' || k === 'single') bet.sel = parseInt(n, 10);
      addMyBet(bet);
    });
  });

  function addMyBet(bet) {
    if (phase !== 'bet') return;
    var me = net.me();
    if (me && me.sitout) { $('status').textContent = 'You are sitting out.'; return; }
    myBets.push(bet);
    paintMyBets();
    pushBets();
  }
  $('clearBetsBtn').addEventListener('click', function () {
    myBets = []; paintMyBets(); pushBets();
  });
  function paintMyBets() {
    var box = $('myBets');
    if (!myBets.length) { box.textContent = 'No bets yet.'; paintMine(); return; }
    var tot = myBets.reduce(function (s, x) { return s + x.stake; }, 0);
    box.innerHTML = myBets.map(function (x, ix) {
      return '<span style="display:inline-block;background:#1c3a28;border:1px solid #e8b64c;border-radius:8px;padding:2px 7px;margin:2px">' +
        esc(describe(x)) + ' <a href="#" data-ix="' + ix + '" style="color:#f87171">×</a></span>';
    }).join('') + '<div style="color:#9fb8a6;margin-top:4px">Total staked: ' + tot + '</div>';
    Array.prototype.slice.call(box.querySelectorAll('a')).forEach(function (a) {
      a.addEventListener('click', function (ev) {
        ev.preventDefault();
        myBets.splice(parseInt(a.getAttribute('data-ix'), 10), 1);
        paintMyBets(); pushBets();
      });
    });
    paintMine();
  }
  function describe(x) {
    var nm = { small: 'Small', big: 'Big', anytrip: 'AnyTrip' }[x.kind];
    if (nm) return nm + ' ' + x.stake;
    if (x.kind === 'trip') return 'Trip ' + x.sel + '×3 ' + x.stake;
    if (x.kind === 'double') return 'Pair ' + x.sel + ' ' + x.stake;
    if (x.kind === 'total') return 'Total ' + x.sel + ' ' + x.stake;
    if (x.kind === 'single') return PIPS[x.sel - 1] + ' ' + x.sel + ' ' + x.stake;
    if (x.kind === 'two') return '2-combo ' + x.sel.join('+') + ' ' + x.stake;
    if (x.kind === 'three') return '3-combo ' + x.sel.join('+') + ' ' + x.stake;
    return x.kind + ' ' + x.stake;
  }
  function paintMine() {
    // highlight buttons I hold
    var mine = {};
    myBets.forEach(function (x) { mine[betKey(x)] = (mine[betKey(x)] || 0) + x.stake; });
    Array.prototype.slice.call(document.querySelectorAll('.bet[data-k]')).forEach(function (btn) {
      var k = btn.getAttribute('data-k'), n = btn.getAttribute('data-n');
      var tmp = { kind: k, sel: null };
      if (k === 'trip' || k === 'double' || k === 'total' || k === 'single') tmp.sel = parseInt(n, 10);
      var key = betKey(tmp);
      var has = !!mine[key];
      btn.classList.toggle('mine', has);
      var old = btn.querySelector('.dots');
      if (old) old.remove();
      if (has) { var s = document.createElement('span'); s.className = 'dots'; s.textContent = mine[key]; btn.appendChild(s); }
    });
  }

  function pushBets() {
    net.sendBet({ bets: myBets });
    if (isHost()) { allBets[net.playerId] = myBets.slice(); renderPlayers(); }
  }
  net.onBet(function (data, from) {
    if (!isHost()) return;
    if (data && data.bets) {
      allBets[from] = data.bets.slice(0, 24);
      net.broadcast('bets-echo', { all: allBets });
      renderPlayers();
    }
  });
  net.on('bets-echo', function (d) {
    if (isHost()) return;
    if (d && d.all) { allBets = d.all; renderPlayers(); }
  });

  // ---------- three: felt + 3 pip dice + bowl ----------
  var env = window.ThreeEnv.init({
    canvasId: 'stage', containerId: 'stageWrap',
    cameraPos: CAM.start.pos, lookAt: CAM.start.look, fov: 46, bg: 0x0a1410
  });
  window.ThreeEnv.makeTable(env.scene, { radius: 5.4, felt: 0x10402a });

  function pipTexture(v) {
    return window.ThreeEnv.canvasTexture(function (g, w, h) {
      g.fillStyle = '#f8f6ee'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#b8ab84'; g.lineWidth = 5; g.strokeRect(5, 5, w - 10, h - 10);
      var pos = {
        1: [[0.5, 0.5]], 2: [[0.3, 0.3], [0.7, 0.7]], 3: [[0.28, 0.28], [0.5, 0.5], [0.72, 0.72]],
        4: [[0.32, 0.32], [0.68, 0.32], [0.32, 0.68], [0.68, 0.68]],
        5: [[0.3, 0.3], [0.7, 0.3], [0.5, 0.5], [0.3, 0.7], [0.7, 0.7]],
        6: [[0.32, 0.28], [0.68, 0.28], [0.32, 0.5], [0.68, 0.5], [0.32, 0.72], [0.68, 0.72]]
      }[v];
      g.fillStyle = (v === 1 || v === 4) ? '#c02727' : '#1c1c1c';
      pos.forEach(function (p) {
        g.beginPath(); g.arc(p[0] * w, p[1] * h, w * 0.085, 0, Math.PI * 2); g.fill();
      });
    });
  }
  var pipTex = {};
  for (var pv = 1; pv <= 6; pv++) pipTex[pv] = pipTexture(pv);

  // standard die opposite faces sum to 7: +x=1,-x=6,+y=2,-y=5,+z=3,-z=4
  var SLOT_VAL = [1, 6, 2, 5, 3, 4];
  function dieMats() {
    return SLOT_VAL.map(function (v) {
      return new THREE.MeshPhysicalMaterial({ map: pipTex[v], roughness: 0.3, metalness: 0.02, clearcoat: 0.9, clearcoatRoughness: 0.25 });
    });
  }
  var dice = [], DIE_Y = 0.5, TABLE_R = 4.4;
  for (var di = 0; di < 3; di++) {
    var mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), dieMats());
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0x8a7a4a })));
    mesh.position.set((di - 1) * 1.3, DIE_Y, 0.3);
    env.scene.add(mesh);
    dice.push({ mesh: mesh, vel: new THREE.Vector3(), ang: new THREE.Vector3(), tumbling: false, targetQ: new THREE.Quaternion() });
  }
  var bowl = new THREE.Group();
  (function () {
    var wood = new THREE.MeshStandardMaterial({ color: 0x7a4a1e, roughness: 0.6, side: THREE.DoubleSide });
    var cup = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 2.0, 2.2, 36, 1, true), wood);
    var bot = new THREE.Mesh(new THREE.CircleGeometry(2.0, 36), new THREE.MeshStandardMaterial({ color: 0x5a3410 }));
    bot.rotation.x = -Math.PI / 2; bot.position.y = -1.1;
    var rim = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.2, 12, 52),
      new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.95, roughness: 0.25 }));
    rim.rotation.x = Math.PI / 2; rim.position.y = 1.1;
    bowl.add(cup); bowl.add(bot); bowl.add(rim);
    bowl.visible = false; env.scene.add(bowl);
  })();

  function quatForValue(v) {
    var slot = SLOT_VAL.indexOf(v), e;
    if (slot === 2) e = new THREE.Euler(0, 0, 0);
    else if (slot === 3) e = new THREE.Euler(Math.PI, 0, 0);
    else if (slot === 0) e = new THREE.Euler(0, 0, Math.PI / 2);
    else if (slot === 1) e = new THREE.Euler(0, 0, -Math.PI / 2);
    else if (slot === 4) e = new THREE.Euler(-Math.PI / 2, 0, 0);
    else e = new THREE.Euler(Math.PI / 2, 0, 0);
    var q = new THREE.Quaternion().setFromEuler(e);
    var yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng(4) * Math.PI / 2);
    return yaw.multiply(q);
  }

  var anim = { active: false, stage: '', t: 0, results: [1, 2, 3], settleFrom: [], settleQ: [] };
  function beginRoll(payload) {
    phase = 'rolling';
    lastDice = payload.results.slice();
    if (isHost()) allBets = JSON.parse(JSON.stringify(payload.bets || allBets));
    stopBetClock();
    $('rollBtn').disabled = true; $('nextBtn').style.display = 'none';
    $('resultPanel').classList.remove('show');
    clearMarks();
    $('status').textContent = 'No more bets — shaking…';
    window.GameSound.bowl();
    env.flyTo(CAM.roll.pos, CAM.roll.look, 1.1);
    bowl.visible = true; bowl.position.set(0, 2.2, 0.3); bowl.rotation.set(0, 0, 0);
    anim.active = true; anim.stage = 'shake'; anim.t = 0; anim.results = lastDice.slice();
  }
  function dropDice() {
    for (var k = 0; k < 3; k++) {
      var d = dice[k], a = Math.random() * Math.PI * 2;
      d.mesh.position.set(Math.cos(a) * 1.4, 7 + k * 0.8, Math.sin(a) * 1.4 + 0.3);
      d.vel.set((Math.random() - 0.5) * 3, -1.5, (Math.random() - 0.5) * 3);
      d.ang.set((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9);
      d.tumbling = true;
    }
    window.GameSound.dice();
  }
  function physics(dt) {
    for (var k = 0; k < 3; k++) {
      var d = dice[k];
      if (!d.tumbling) continue;
      d.vel.y += -14.5 * dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      d.mesh.rotation.x += d.ang.x * dt;
      d.mesh.rotation.y += d.ang.y * dt;
      d.mesh.rotation.z += d.ang.z * dt;
      if (d.mesh.position.y < DIE_Y) {
        d.mesh.position.y = DIE_Y;
        if (Math.abs(d.vel.y) > 0.8) window.GameSound.clack();
        d.vel.y *= -0.45; d.vel.x *= 0.7; d.vel.z *= 0.7; d.ang.multiplyScalar(0.6);
        if (Math.abs(d.vel.y) < 0.6) d.vel.y = 0;
      }
      var rr = Math.hypot(d.mesh.position.x, d.mesh.position.z - 0.3);
      if (rr > TABLE_R) {
        var nx = d.mesh.position.x / rr, nz = (d.mesh.position.z - 0.3) / rr;
        d.mesh.position.x = nx * TABLE_R; d.mesh.position.z = 0.3 + nz * TABLE_R;
        var dot = d.vel.x * nx + d.vel.z * nz;
        d.vel.x -= 1.7 * dot * nx; d.vel.z -= 1.7 * dot * nz;
        d.vel.multiplyScalar(0.7); window.GameSound.clack();
      }
      if (d.mesh.position.y <= DIE_Y + 0.001) {
        d.vel.x *= (1 - 1.6 * dt); d.vel.z *= (1 - 1.6 * dt); d.ang.multiplyScalar(1 - 1.8 * dt);
      }
    }
  }
  env.onTick(function (dt) {
    if (!anim.active) return;
    anim.t += dt;
    if (anim.stage === 'shake') {
      bowl.position.x = Math.sin(anim.t * 30) * 0.3;
      bowl.position.z = 0.3 + Math.cos(anim.t * 26) * 0.26;
      bowl.position.y = 2.2 + Math.abs(Math.sin(anim.t * 9)) * 0.3;
      bowl.rotation.y += dt * 2.4;
      if (anim.t >= 2.0) { anim.stage = 'fly'; anim.t = 0; }
    } else if (anim.stage === 'fly') {
      bowl.position.y += dt * 13; bowl.rotation.x += dt * 3;
      if (bowl.position.y > 18) { bowl.visible = false; anim.stage = 'tumble'; anim.t = 0; dropDice(); }
    } else if (anim.stage === 'tumble') {
      physics(dt);
      if (anim.t >= 3.0) {
        anim.settleFrom = dice.map(function (d) { return d.mesh.position.clone(); });
        anim.settleQ = dice.map(function (d) { return d.mesh.quaternion.clone(); });
        for (var k = 0; k < 3; k++) { dice[k].targetQ = quatForValue(anim.results[k]); dice[k].vel.set(0, 0, 0); }
        anim.stage = 'settle'; anim.t = 0; window.GameSound.reveal();
      }
    } else if (anim.stage === 'settle') {
      var k2 = Math.min(1, anim.t / 1.0), e = k2 * k2 * (3 - 2 * k2), done = k2 >= 1;
      for (var j = 0; j < 3; j++) {
        var home = new THREE.Vector3((j - 1) * 1.3, DIE_Y, 0.3);
        dice[j].mesh.position.lerpVectors(anim.settleFrom[j], home, e);
        dice[j].mesh.quaternion.slerpQuaternions(anim.settleQ[j], dice[j].targetQ, e);
        dice[j].tumbling = false;
      }
      if (done) finishReveal();
    }
  });

  // ---------- evaluate ----------
  function isTriple(d) { return d[0] === d[1] && d[1] === d[2]; }
  function evalBet(bet, d) {
    var sum = d[0] + d[1] + d[2], trip = isTriple(d);
    switch (bet.kind) {
      case 'small': if (trip) return -bet.stake; return (sum >= 4 && sum <= 10) ? bet.stake : -bet.stake;
      case 'big': if (trip) return -bet.stake; return (sum >= 11 && sum <= 17) ? bet.stake : -bet.stake;
      case 'trip': return (trip && d[0] === bet.sel) ? bet.stake * 150 : -bet.stake;
      case 'anytrip': return trip ? bet.stake * 24 : -bet.stake;
      case 'double': { var c = d.filter(function (x) { return x === bet.sel; }).length; return c >= 2 ? bet.stake * 8 : -bet.stake; }
      case 'total': return sum === bet.sel ? bet.stake * (TOTAL_PAY[bet.sel] || 6) : -bet.stake;
      case 'single': { var n = d.filter(function (x) { return x === bet.sel; }).length; return n === 0 ? -bet.stake : bet.stake * n; }
      case 'two': return (d.indexOf(bet.sel[0]) >= 0 && d.indexOf(bet.sel[1]) >= 0) ? bet.stake * 5 : -bet.stake;
      case 'three': {
        var s = d.slice().sort().join(','), t = bet.sel.slice().sort().join(',');
        return s === t ? bet.stake * 30 : -bet.stake;
      }
      default: return 0;
    }
  }
  function finishReveal() {
    anim.active = false; phase = 'reveal';
    env.flyTo(CAM.result.pos, CAM.result.look, 1.1);
    var rows, deltas = {};
    if (isHost()) {
      rows = [];
      Object.keys(allBets).forEach(function (pid) {
        var arr = allBets[pid] || [], netp = 0;
        arr.forEach(function (bet) { netp += evalBet(bet, lastDice); });
        // players with no bets: 0
        var p = net.players.filter(function (x) { return x.id === pid; })[0];
        deltas[pid] = netp;
        rows.push({ id: pid, name: p ? p.name : '?', net: netp, n: arr.length });
      });
      // include active players with zero bets
      net.players.forEach(function (p) {
        if (deltas[p.id] === undefined && !p.sitout) { deltas[p.id] = 0; rows.push({ id: p.id, name: p.name, net: 0, n: 0 }); }
      });
      net.applyDeltas(deltas);
      net.broadcast('roll-result', { results: lastDice, rows: rows, deltas: deltas, round: round });
      showResult(rows);
      $('nextBtn').style.display = 'block';
    } else {
      // estimate locally until host packet arrives
      var mine = 0;
      myBets.forEach(function (bet) { mine += evalBet(bet, lastDice); });
      showResult([{ id: net.playerId, name: 'You', net: mine, n: myBets.length }]);
    }
    var me = rows ? rows.filter(function (r) { return r.id === net.playerId; })[0] : null;
    var anyWin = rows ? rows.some(function (r) { return r.net > 0; }) : false;
    if (me) { if (me.net > 0) window.GameSound.win(); else if (me.net < 0) window.GameSound.loss(); }
    else if (anyWin) window.GameSound.win();
    markBets();
    renderPlayers();
    $('status').textContent = 'Dice: ' + lastDice.join('-') + ' (sum ' + (lastDice[0] + lastDice[1] + lastDice[2]) + ')' + (isTriple(lastDice) ? ' • TRIPLE!' : '');
  }
  net.on('roll-result', function (d) {
    if (isHost()) return;
    if (!d) return;
    if (d.results) lastDice = d.results.slice();
    if (d.deltas) net.applyDeltas(d.deltas);
    if (d.rows) showResult(d.rows);
    markBets();
    renderPlayers();
  });
  function showResult(rows) {
    var p = $('resultPanel');
    var faces = lastDice.map(function (v) { return PIPS[v - 1]; }).join(' ');
    var html = '<h4>Round ' + round + ' — ' + faces + ' = ' + (lastDice[0] + lastDice[1] + lastDice[2]) + '</h4>';
    rows.forEach(function (r) {
      var cls = r.net > 0 ? 'pos' : (r.net < 0 ? 'neg' : '');
      html += '<div style="display:flex;justify-content:space-between;gap:8px"><span>' + esc(r.name) + ' (' + r.n + ' bets)</span><b class="' + cls + '">' + (r.net > 0 ? '+' : '') + r.net + '</b></div>';
    });
    if (!isHost()) html += '<div style="color:#9fb8a6">Waiting for host: Next…</div>';
    p.innerHTML = html; p.classList.add('show');
  }
  function clearMarks() {
    Array.prototype.slice.call(document.querySelectorAll('.bet.hit,.bet.miss')).forEach(function (x) { x.classList.remove('hit', 'miss'); });
  }
  function markBets() {
    // highlight each generic button by whether that bet type won this roll
    Array.prototype.slice.call(document.querySelectorAll('.bet[data-k]')).forEach(function (btn) {
      var k = btn.getAttribute('data-k'), n = btn.getAttribute('data-n');
      var tmp = { kind: k, sel: null, stake: 5 };
      if (k === 'trip' || k === 'double' || k === 'total' || k === 'single') tmp.sel = parseInt(n, 10);
      var v = evalBet(tmp, lastDice);
      btn.classList.remove('hit', 'miss');
      btn.classList.add(v > 0 ? 'hit' : 'miss');
    });
  }

  // ---------- host roll + timer ----------
  function hostRoll() {
    if (!isHost() || phase !== 'bet') return;
    // fill bots
    net.players.forEach(function (p) {
      if (p.bot && !p.sitout && (!allBets[p.id] || !allBets[p.id].length)) {
        allBets[p.id] = randomBotBets();
      }
    });
    var res = [1 + rng(6), 1 + rng(6), 1 + rng(6)];
    var payload = { results: res, bets: JSON.parse(JSON.stringify(allBets)), round: round };
    net.broadcast('roll-start', payload);
    beginRoll(payload);
  }
  function randomBotBets() {
    var out = [], nb = 1 + rng(3), k;
    var kinds = ['small', 'big', 'total', 'single', 'double', 'two'];
    for (k = 0; k < nb; k++) {
      var kind = kinds[rng(kinds.length)], st = [5, 10, 25][rng(3)];
      if (kind === 'small' || kind === 'big') out.push({ kind: kind, sel: null, stake: st });
      else if (kind === 'total') out.push({ kind: 'total', sel: 4 + rng(14), stake: st });
      else if (kind === 'single') out.push({ kind: 'single', sel: 1 + rng(6), stake: st });
      else if (kind === 'double') out.push({ kind: 'double', sel: 1 + rng(6), stake: st });
      else { var a = 1 + rng(6), b2 = 1 + rng(6); if (a === b2) b2 = (b2 % 6) + 1; out.push({ kind: 'two', sel: [a, b2].sort(), stake: st }); }
    }
    return out;
  }
  net.on('roll-start', function (p) { if (isHost()) return; beginRoll(p); if (p && p.bets) allBets = p.bets; });

  $('rollBtn').addEventListener('click', function () { window.GameSound.click(); hostRoll(); });
  $('nextBtn').addEventListener('click', function () {
    if (!isHost()) return;
    window.GameSound.click();
    round++; myBets = []; allBets = {}; twoSel = []; threeSel = [];
    phase = 'bet';
    paintMyBets(); paintPicks(); clearMarks();
    $('resultPanel').classList.remove('show');
    $('nextBtn').style.display = 'none';
    for (var k = 0; k < 3; k++) { dice[k].mesh.position.set((k - 1) * 1.3, DIE_Y, 0.3); dice[k].mesh.rotation.set(0, 0, 0); }
    env.flyTo(CAM.start.pos, CAM.start.look, 1.0);
    net.broadcast('next', { round: round });
    $('status').textContent = 'Place bets — 30s window.';
    startBetClock(); renderPlayers();
    setTimeout(function () {
      if (!isHost()) return;
      net.players.forEach(function (p) { if (p.bot && !p.sitout) allBets[p.id] = randomBotBets(); });
      net.broadcast('bets-echo', { all: allBets }); renderPlayers();
    }, 1500);
  });
  net.on('next', function (d) {
    if (isHost()) return;
    if (d && d.round) round = d.round;
    myBets = []; twoSel = []; threeSel = []; phase = 'bet';
    paintMyBets(); paintPicks(); clearMarks();
    $('resultPanel').classList.remove('show');
    $('nextBtn').style.display = 'none';
    for (var k = 0; k < 3; k++) { dice[k].mesh.position.set((k - 1) * 1.3, DIE_Y, 0.3); dice[k].mesh.rotation.set(0, 0, 0); }
    env.flyTo(CAM.start.pos, CAM.start.look, 1.0);
    startBetClock(); renderPlayers();
  });

  function startBetClock() {
    stopBetClock();
    betLeft = betSecs;
    paintClock();
    betTimer = setInterval(function () {
      betLeft -= 1;
      paintClock();
      if (betLeft <= 0) {
        stopBetClock();
        if (isHost()) { $('status').textContent = 'Time! Rolling…'; hostRoll(); }
        else $('status').textContent = 'Time! Host is rolling…';
      }
    }, 1000);
  }
  function stopBetClock() { if (betTimer) clearInterval(betTimer); betTimer = null; }
  function paintClock() {
    var pill = $('timerPill');
    pill.textContent = phase === 'bet' ? ('Bets ' + betLeft + 's • R' + round) : ('Round ' + round);
    pill.classList.toggle('hot', betLeft <= 8 && phase === 'bet');
    var bar = $('betBar');
    if (bar) bar.style.width = Math.max(0, (betLeft / betSecs) * 100) + '%';
  }

  // ---------- roster ----------
  function renderPlayers() {
    $('hostPill').style.display = isHost() ? 'inline-block' : 'none';
    $('rollBtn').style.display = isHost() ? 'block' : 'none';
    $('addBotBtn').style.display = isHost() ? 'inline-block' : 'none';
    $('pcount').textContent = String(net.players.length);
    var ul = $('playerList'); ul.innerHTML = '';
    net.players.forEach(function (p) {
      var li = document.createElement('li');
      if (p.id === net.playerId) li.className = 'me';
      var arr = (p.id === net.playerId) ? myBets : (allBets[p.id] || []);
      var tot = arr.reduce(function (s, x) { return s + x.stake; }, 0);
      li.innerHTML = '<div style="display:flex;justify-content:space-between"><b>' + esc(p.name) + '</b><span class="bal">' + p.balance + '</span></div>' +
        '<div style="color:#9fb8a6">' + (p.sitout ? 'sitting out' : (arr.length ? arr.length + ' bets • ' + tot : '…choosing')) + '</div>';
      if (isHost()) {
        var lab = document.createElement('label');
        lab.style.cssText = 'display:flex;gap:5px;align-items:center;color:#9fb8a6;font-size:11px;margin-top:4px';
        var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!p.sitout;
        cb.addEventListener('change', function () { net.setSitout(p.id, cb.checked); setTimeout(renderPlayers, 60); });
        var sp = document.createElement('span'); sp.textContent = 'sit-out';
        lab.appendChild(cb); lab.appendChild(sp); li.appendChild(lab);
      }
      ul.appendChild(li);
    });
    paintClock();
  }
  net.onPlayers(renderPlayers);
  net.on('sitout', function () { setTimeout(renderPlayers, 60); });

  $('addBotBtn').addEventListener('click', function () {
    var b = net.addBot();
    if (b && isHost()) { allBets[b.id] = randomBotBets(); net.broadcast('bets-echo', { all: allBets }); }
    renderPlayers();
  });
  $('copyLinkBtn').addEventListener('click', function () {
    var url = location.href.split('?')[0] + '?game=sic-bo';
    try { if (navigator.clipboard) navigator.clipboard.writeText(url); } catch (e) {}
    $('status').textContent = 'Invite: ' + url;
  });
  $('soundBtn').addEventListener('click', function () {
    var on = window.GameSound.toggle();
    $('soundBtn').textContent = on ? '🔊' : '🔇';
  });
  function podium(rows) {
    rows = (rows || net.players).slice().sort(function (a, b) { return b.balance - a.balance; });
    $('podiumRows').innerHTML = rows.map(function (p, ix) {
      var m = ix === 0 ? '🥇' : ix === 1 ? '🥈' : ix === 2 ? '🥉' : (ix + 1) + '.';
      return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #234d33"><span>' + m + ' ' + esc(p.name) + '</span><b style="color:#e8b64c">' + p.balance + '</b></div>';
    }).join('');
    $('podium').classList.add('show');
  }
  $('endBtn').addEventListener('click', function () { podium(); if (isHost()) net.endGame(net.players); });
  $('endBtn2').addEventListener('click', function () { podium(); if (isHost()) net.endGame(net.players); });
  net.on('game-over', function (d) { podium(d && d.rows); });
  $('closePodium').addEventListener('click', function () { $('podium').classList.remove('show'); });
  $('restartBtn').addEventListener('click', function () {
    if (!isHost()) return;
    net.players.forEach(function (p) { p.balance = 100; });
    round = 1; myBets = []; allBets = {}; phase = 'bet';
    $('podium').classList.remove('show');
    net.broadcast('restart', {}); net.broadcast('next', { round: 1 });
    paintMyBets(); startBetClock(); renderPlayers();
  });
  net.on('restart', function () {
    if (isHost()) return;
    net.players.forEach(function (p) { p.balance = 100; });
    round = 1; myBets = []; phase = 'bet';
    $('podium').classList.remove('show');
    paintMyBets(); renderPlayers();
  });

  paintMyBets(); paintPicks(); renderPlayers(); startBetClock();
})();
