/* Roulette 3D (European 37) — host-authoritative, 30s betting, top-down wheel.
 * Bet kinds: straight(n) 35:1, split([a,b]) 17:1, street([a,b,c]) 11:1,
 * corner([4]) 8:1, line([6]) 5:1, col1/2/3 2:1, dozen1/2/3 2:1,
 * red/black/odd/even/low/high 1:1 (0 loses all outside).
 * Split/Street/Corner/Line via mode quick-pick that auto-covers adjacent numbers.
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
  var REDS = { 1: 1, 3: 1, 5: 1, 7: 1, 9: 1, 12: 1, 14: 1, 16: 1, 18: 1, 19: 1, 21: 1, 23: 1, 25: 1, 27: 1, 30: 1, 32: 1, 34: 1, 36: 1 };
  var EURO = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  var NUM2POCKET = {};
  EURO.forEach(function (n, ix) { NUM2POCKET[n] = ix; });
  function isRed(n) { return !!REDS[n]; }
  function colOf(n) { return ((n - 1) % 3) + 1; }
  function dozenOf(n) { return n <= 12 ? 1 : n <= 24 ? 2 : 3; }
  function rowOf(n) { return Math.floor((n - 1) / 3); }
  function streetFor(n) { var r = rowOf(n); return [r * 3 + 1, r * 3 + 2, r * 3 + 3]; }
  function lineFor(n) {
    var r = rowOf(n);
    if (r >= 11) r = 10;
    var a = r * 3 + 1, out = [];
    for (var k = 0; k < 6; k++) out.push(a + k);
    return out;
  }
  function cornerFor(n) {
    var r = rowOf(n), c = (n - 1) % 3;
    var r0 = r >= 11 ? 10 : r, c0 = c >= 2 ? 1 : c;
    return [r0 * 3 + c0 + 1, r0 * 3 + c0 + 2, (r0 + 1) * 3 + c0 + 1, (r0 + 1) * 3 + c0 + 2];
  }
  function adjacent(a, b) {
    if ((a === 0 || b === 0)) {
      var o = a === 0 ? b : a;
      return o === 1 || o === 2 || o === 3;
    }
    var ra = rowOf(a), ca = (a - 1) % 3, rb = rowOf(b), cb = (b - 1) % 3;
    return (ra === rb && Math.abs(ca - cb) === 1) || (ca === cb && Math.abs(ra - rb) === 1);
  }

  var CAM = {
    start: { pos: [0, 13.5, 5.4], look: [0, 0, 0] },
    spin: { pos: [0, 10.8, 3.1], look: [0, 0, 0] },
    result: { pos: [0, 12.6, 4.6], look: [0, 0, 0] }
  };

  var net = window.LBFNet.join('roulette', { min: 2, max: 8 });
  var isHost = function () { return net.isHost; };

  var round = 1, phase = 'bet';
  var myChip = 5, mode = 'straight', pendingSplit = null;
  var myBets = [];
  var allBets = {};
  var winNum = null;
  var betSecs = 30, betLeft = 30, betTimer = null;

  function pColor(id) {
    var h = 0, i;
    for (i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
    return 'hsl(' + h + ',70%,45%)';
  }

  // ---------- chips & modes ----------
  Array.prototype.slice.call(document.querySelectorAll('.chip')).forEach(function (b) {
    b.addEventListener('click', function () {
      window.GameSound.click();
      Array.prototype.slice.call(document.querySelectorAll('.chip')).forEach(function (x) { x.classList.remove('sel'); });
      b.classList.add('sel');
      myChip = parseInt(b.getAttribute('data-c'), 10) || 5;
    });
  });
  var HINTS = {
    straight: 'Tap a number for a straight-up bet.',
    split: 'Tap TWO adjacent numbers (first tap arms, second completes the split).',
    street: 'Tap any number — its row of 3 is covered (street).',
    corner: 'Tap any number — the 2×2 block containing it is covered (corner).',
    line: 'Tap any number — two adjacent rows (6 numbers) are covered (line).'
  };
  Array.prototype.slice.call(document.querySelectorAll('.mode')).forEach(function (b) {
    b.addEventListener('click', function () {
      window.GameSound.click();
      Array.prototype.slice.call(document.querySelectorAll('.mode')).forEach(function (x) { x.classList.remove('sel'); });
      b.classList.add('sel');
      mode = b.getAttribute('data-m');
      pendingSplit = null;
      $('modeHint').textContent = HINTS[mode];
    });
  });

  // ---------- number board ----------
  var numGrid = $('numGrid'), numBtns = {};
  for (var n = 1; n <= 36; n++) {
    (function (v) {
      var d = document.createElement('button');
      d.className = 'num ' + (isRed(v) ? 'red' : 'black');
      d.innerHTML = '<span>' + v + '</span><span class="chips"></span>';
      d.addEventListener('click', function () { onNumberTap(v); });
      numGrid.appendChild(d);
      numBtns[v] = d;
    })(n);
  }
  $('zero').addEventListener('click', function () { onNumberTap(0); });

  function onNumberTap(v) {
    if (phase !== 'bet') return;
    var me = net.me();
    if (me && me.sitout) { $('status').textContent = 'You are sitting out.'; return; }
    window.GameSound.chip();
    if (mode === 'straight') {
      addMyBet({ kind: 'straight', sel: v, stake: myChip });
    } else if (mode === 'split') {
      if (v === 0 && pendingSplit === null) { pendingSplit = 0; $('modeHint').textContent = '0 armed — tap 1, 2 or 3 to complete split.'; return; }
      if (pendingSplit === null) {
        pendingSplit = v;
        $('modeHint').textContent = v + ' armed — tap an adjacent number to complete split 17:1.';
        paintMine();
        return;
      }
      var a = pendingSplit, c = v;
      pendingSplit = null;
      $('modeHint').textContent = HINTS.split;
      if (a === c) return;
      if (!adjacent(a, c)) { $('status').textContent = a + ' + ' + c + ' are not adjacent — split needs neighbours.'; paintMine(); return; }
      var pair = [Math.min(a, c), Math.max(a, c)];
      // keep 0 first for display
      if (pair[1] === 0) pair = [0, pair[0]];
      if (a === 0 || c === 0) pair = [0, Math.max(a, c)];
      addMyBet({ kind: 'split', sel: pair, stake: myChip });
    } else if (mode === 'street') {
      if (v === 0) { $('status').textContent = 'Street needs 1–36 (0 has no street).'; return; }
      addMyBet({ kind: 'street', sel: streetFor(v), stake: myChip });
    } else if (mode === 'corner') {
      if (v === 0) { $('status').textContent = 'Corner needs 1–36.'; return; }
      addMyBet({ kind: 'corner', sel: cornerFor(v), stake: myChip });
    } else if (mode === 'line') {
      if (v === 0) { $('status').textContent = 'Line needs 1–36.'; return; }
      addMyBet({ kind: 'line', sel: lineFor(v), stake: myChip });
    }
  }

  Array.prototype.slice.call(document.querySelectorAll('.out[data-k]')).forEach(function (b) {
    b.addEventListener('click', function () {
      if (phase !== 'bet') return;
      window.GameSound.chip();
      addMyBet({ kind: b.getAttribute('data-k'), sel: null, stake: myChip });
    });
  });

  function betLabel(x) {
    switch (x.kind) {
      case 'straight': return 'Str ' + x.sel;
      case 'split': return 'Spl ' + x.sel.join('-');
      case 'street': return 'St ' + x.sel.join(',');
      case 'corner': return 'Cor ' + x.sel.join(',');
      case 'line': return 'Line ' + x.sel[0] + '-' + x.sel[5];
      case 'red': return 'RED'; case 'black': return 'BLACK';
      case 'odd': return 'ODD'; case 'even': return 'EVEN';
      case 'low': return '1-18'; case 'high': return '19-36';
      case 'dozen1': return '1st12'; case 'dozen2': return '2nd12'; case 'dozen3': return '3rd12';
      case 'col1': return 'Col1'; case 'col2': return 'Col2'; case 'col3': return 'Col3';
      default: return x.kind;
    }
  }
  function addMyBet(bet) {
    if (phase !== 'bet') return;
    myBets.push(bet);
    if (myBets.length > 30) myBets.shift();
    paintMyBets(); pushBets();
  }
  $('clearBetsBtn').addEventListener('click', function () { myBets = []; paintMyBets(); pushBets(); });
  function paintMyBets() {
    var box = $('myBets');
    if (!myBets.length) box.textContent = 'No bets yet.';
    else {
      var tot = myBets.reduce(function (s, x) { return s + x.stake; }, 0);
      box.innerHTML = myBets.map(function (x, ix) {
        return '<span style="display:inline-block;background:#16293a;border:1px solid #e8b64c;border-radius:8px;padding:2px 7px;margin:2px">' +
          esc(betLabel(x)) + '×' + x.stake + ' <a href="#" data-ix="' + ix + '" style="color:#f87171">×</a></span>';
      }).join('') + '<div style="color:#93a9b8">Staked: ' + tot + '</div>';
      Array.prototype.slice.call(box.querySelectorAll('a')).forEach(function (a) {
        a.addEventListener('click', function (ev) {
          ev.preventDefault();
          myBets.splice(parseInt(a.getAttribute('data-ix'), 10), 1);
          paintMyBets(); pushBets();
        });
      });
    }
    paintMine();
  }
  function covers(bet) {
    // numbers covered (for chip dots)
    if (bet.kind === 'straight') return [bet.sel];
    if (bet.kind === 'split' || bet.kind === 'street' || bet.kind === 'corner' || bet.kind === 'line') return bet.sel;
    return [];
  }
  function paintMine() {
    // clear
    Object.keys(numBtns).forEach(function (k) {
      var b = numBtns[k];
      b.classList.remove('mine');
      var c = b.querySelector('.chips'); if (c) c.innerHTML = '';
    });
    $('zero').classList.remove('mine');
    // my chips
    myBets.forEach(function (bet) {
      covers(bet).forEach(function (num) {
        var elc = num === 0 ? $('zero') : numBtns[num];
        if (!elc) return;
        elc.classList.add('mine');
        var holder = elc.querySelector('.chips');
        if (holder && holder.children.length < 4) {
          var s = document.createElement('span');
          s.className = 'cp'; s.style.background = pColor(net.playerId);
          s.textContent = String(bet.stake);
          s.title = betLabel(bet);
          holder.appendChild(s);
        }
      });
    });
    if (pendingSplit !== null && numBtns[pendingSplit]) numBtns[pendingSplit].classList.add('mine');
    // outside mine
    Array.prototype.slice.call(document.querySelectorAll('.out[data-k]')).forEach(function (b) {
      var k = b.getAttribute('data-k');
      b.classList.toggle('mine', myBets.some(function (x) { return x.kind === k; }));
    });
    // host view: overlay other players' chips faintly (from allBets when echoed)
    if (isHost() || allBets) {
      Object.keys(allBets).forEach(function (pid) {
        if (pid === net.playerId) return;
        (allBets[pid] || []).forEach(function (bet) {
          covers(bet).forEach(function (num) {
            var elc = num === 0 ? $('zero') : numBtns[num];
            if (!elc) return;
            var holder = elc.querySelector('.chips');
            if (holder && holder.children.length < 5) {
              var s = document.createElement('span');
              s.className = 'cp'; s.style.background = pColor(pid); s.style.opacity = '0.85';
              s.textContent = String(bet.stake);
              holder.appendChild(s);
            }
          });
        });
      });
    }
  }

  function pushBets() {
    net.sendBet({ bets: myBets });
    if (isHost()) { allBets[net.playerId] = myBets.slice(); renderPlayers(); paintMine(); }
  }
  net.onBet(function (data, from) {
    if (!isHost()) return;
    if (data && data.bets) {
      allBets[from] = data.bets.slice(0, 30);
      net.broadcast('bets-echo', { all: allBets });
      renderPlayers(); paintMine();
    }
  });
  net.on('bets-echo', function (d) {
    if (isHost()) return;
    if (d && d.all) { allBets = d.all; renderPlayers(); paintMine(); }
  });

  // ---------- three wheel ----------
  var env = window.ThreeEnv.init({
    canvasId: 'stage', containerId: 'stageWrap',
    cameraPos: CAM.start.pos, lookAt: CAM.start.look, fov: 44, bg: 0x0a1016
  });
  var wheel = new THREE.Group();
  env.scene.add(wheel);
  (function buildWheel() {
    var chrome = new THREE.MeshStandardMaterial({ color: 0xd7dde3, metalness: 0.9, roughness: 0.24 });
    var base = new THREE.Mesh(new THREE.CylinderGeometry(4.7, 5.0, 0.7, 56), chrome);
    base.position.y = 0; base.castShadow = true; base.receiveShadow = true;
    wheel.add(base);
    var wood = new THREE.Mesh(new THREE.TorusGeometry(5.0, 0.42, 16, 72),
      new THREE.MeshStandardMaterial({ color: 0x4a2c12, roughness: 0.5 }));
    wood.rotation.x = Math.PI / 2; wood.position.y = 0.32;
    wheel.add(wood);
    // pocket ring plate
    var plate = new THREE.Mesh(new THREE.CylinderGeometry(4.1, 4.1, 0.5, 56),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5, metalness: 0.4 }));
    plate.position.y = 0.55;
    wheel.add(plate);
    // 37 pockets
    for (var i = 0; i < 37; i++) {
      var num = EURO[i];
      var ang = (i / 37) * Math.PI * 2;
      var col = num === 0 ? 0x16a34a : (isRed(num) ? 0xb91c1c : 0x17171a);
      var box = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.42, 1.05),
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.5 }));
      var r = 3.55;
      box.position.set(Math.cos(ang) * r, 0.78, Math.sin(ang) * r);
      box.rotation.y = -ang + Math.PI / 2;
      box.castShadow = true;
      wheel.add(box);
      // number sprite
      var tex = window.ThreeEnv.canvasTexture(function (g, w, h) {
        g.fillStyle = num === 0 ? '#16a34a' : (isRed(num) ? '#b91c1c' : '#111');
        g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#fff'; g.lineWidth = 4; g.stroke();
        g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = 'bold ' + (String(num).length > 1 ? 44 : 56) + 'px sans-serif';
        g.fillText(String(num), w / 2, h / 2 + 2);
      }, 96, 96);
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
      sp.scale.set(0.62, 0.62, 1);
      sp.position.set(Math.cos(ang) * 2.72, 0.95, Math.sin(ang) * 2.72);
      wheel.add(sp);
      // separator
      var sep = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 1.05),
        new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.3 }));
      var a2 = ((i + 0.5) / 37) * Math.PI * 2;
      sep.position.set(Math.cos(a2) * 3.55, 0.78, Math.sin(a2) * 3.55);
      sep.rotation.y = -a2 + Math.PI / 2;
      wheel.add(sep);
    }
    // center cone + spindle
    var cone = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.3, 40),
      new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.85, roughness: 0.3 }));
    cone.position.y = 1.35; cone.castShadow = true;
    wheel.add(cone);
    var cap = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 20),
      new THREE.MeshStandardMaterial({ color: 0xfff2c0, metalness: 0.9, roughness: 0.2 }));
    cap.position.y = 2.1;
    wheel.add(cap);
  })();
  var ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 20),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.15, metalness: 0.1 }));
  ball.castShadow = true;
  env.scene.add(ball);
  var ballA = 0, ballR = 4.6, ballY = 1.3, ballV = 0.6;
  function placeBall() {
    ball.position.set(Math.cos(ballA) * ballR, ballY, Math.sin(ballA) * ballR);
  }
  placeBall();
  // idle motion
  var idleSpin = 0.25;
  env.onTick(function (dt) {
    if (!anim.active) {
      wheel.rotation.y += dt * idleSpin;
      ballA += dt * ballV;
      ballR = 4.6; ballY = 1.3;
      placeBall();
      return;
    }
    // spin animation handled below (anim.t driven)
    if (anim.stage === 'spin') {
      anim.t += dt;
      var t = anim.t;
      // wheel: fast then decay over 8s
      var wv = 7.5 * Math.exp(-t * 0.5) + 0.35;
      wheel.rotation.y += wv * dt;
      // ball opposite, radius shrink 5.2 -> 3.55
      var bv = -11 * Math.exp(-t * 0.42) - 0.9;
      ballA += bv * dt;
      var k = Math.min(1, t / 8);
      var e = k * k * (3 - 2 * k);
      ballR = 5.25 + (3.55 - 5.25) * e;
      ballY = 1.5 - 0.45 * e + Math.abs(Math.sin(t * 7)) * 0.08 * (1 - e);
      if (t >= 8) {
        // compute target: pocket world angle must equal ball angle
        var pi = NUM2POCKET[anim.result];
        var pocketA = (pi / 37) * Math.PI * 2;
        var target = pocketA + wheel.rotation.y;
        // nearest equivalent to current ballA
        var twoPi = Math.PI * 2;
        var cur = ((ballA % twoPi) + twoPi) % twoPi;
        var tgt = ((target % twoPi) + twoPi) % twoPi;
        var d = tgt - cur;
        if (d > Math.PI) d -= twoPi;
        if (d < -Math.PI) d += twoPi;
        // ball should keep moving forward (negative dir) — go the short way but bias negative
        anim.settleFrom = ballA;
        anim.settleTo = ballA + d;
        // if d positive large, still fine (ease)
        anim.stage = 'settle'; anim.t = 0;
        window.GameSound.reveal();
      }
      placeBall();
    } else if (anim.stage === 'settle') {
      anim.t += dt;
      var k2 = Math.min(1, anim.t / 1.4);
      var e2 = k2 * k2 * (3 - 2 * k2);
      ballA = anim.settleFrom + (anim.settleTo - anim.settleFrom) * e2;
      ballR = 3.55; ballY = 1.02;
      wheel.rotation.y += (0.35 * (1 - k2) + 0.05) * dt;
      // re-track target as wheel creeps: nudge ball with wheel delta
      placeBall();
      if (k2 >= 1) finishReveal();
    }
  });

  var anim = { active: false, stage: '', t: 0, result: 0, settleFrom: 0, settleTo: 0 };

  function beginSpin(payload) {
    phase = 'spinning';
    winNum = payload.result;
    if (isHost()) allBets = JSON.parse(JSON.stringify(payload.bets || allBets));
    stopClock();
    $('spinBtn').disabled = true; $('nextBtn').style.display = 'none';
    $('resultPanel').classList.remove('show');
    clearMarks();
    $('status').textContent = 'Spinning… good luck!';
    window.GameSound.spin();
    env.flyTo(CAM.spin.pos, CAM.spin.look, 1.4);
    anim.active = true; anim.stage = 'spin'; anim.t = 0; anim.result = winNum;
  }

  function hostSpin() {
    if (!isHost() || phase !== 'bet') return;
    net.players.forEach(function (p) {
      if (p.bot && !p.sitout && (!allBets[p.id] || !allBets[p.id].length)) allBets[p.id] = randomBotBets();
    });
    var result = rng(37);
    var payload = { result: result, bets: JSON.parse(JSON.stringify(allBets)), round: round };
    net.broadcast('spin-start', payload);
    beginSpin(payload);
  }
  function randomBotBets() {
    var out = [], nb = 1 + rng(3), i;
    var outs = ['red', 'black', 'odd', 'even', 'low', 'high', 'dozen1', 'dozen2', 'dozen3', 'col1', 'col2', 'col3'];
    for (i = 0; i < nb; i++) {
      var st = [5, 10, 25][rng(3)];
      if (rng(2) === 0) out.push({ kind: 'straight', sel: rng(37), stake: st });
      else {
        var k = outs[rng(outs.length)];
        out.push({ kind: k, sel: null, stake: st });
      }
    }
    return out;
  }
  net.on('spin-start', function (p) {
    if (isHost()) return;
    if (p) { if (p.bets) allBets = p.bets; beginSpin(p); }
  });

  // ---------- evaluate ----------
  function evalBet(bet, w) {
    var st = bet.stake;
    switch (bet.kind) {
      case 'straight': return w === bet.sel ? st * 35 : -st;
      case 'split': return bet.sel.indexOf(w) >= 0 ? st * 17 : -st;
      case 'street': return bet.sel.indexOf(w) >= 0 ? st * 11 : -st;
      case 'corner': return bet.sel.indexOf(w) >= 0 ? st * 8 : -st;
      case 'line': return bet.sel.indexOf(w) >= 0 ? st * 5 : -st;
      case 'col1': if (w === 0) return -st; return colOf(w) === 1 ? st * 2 : -st;
      case 'col2': if (w === 0) return -st; return colOf(w) === 2 ? st * 2 : -st;
      case 'col3': if (w === 0) return -st; return colOf(w) === 3 ? st * 2 : -st;
      case 'dozen1': if (w === 0) return -st; return w >= 1 && w <= 12 ? st * 2 : -st;
      case 'dozen2': if (w === 0) return -st; return w >= 13 && w <= 24 ? st * 2 : -st;
      case 'dozen3': if (w === 0) return -st; return w >= 25 && w <= 36 ? st * 2 : -st;
      case 'red': if (w === 0) return -st; return isRed(w) ? st : -st;
      case 'black': if (w === 0) return -st; return !isRed(w) ? st : -st;
      case 'odd': if (w === 0) return -st; return w % 2 === 1 ? st : -st;
      case 'even': if (w === 0) return -st; return w % 2 === 0 ? st : -st;
      case 'low': if (w === 0) return -st; return w >= 1 && w <= 18 ? st : -st;
      case 'high': if (w === 0) return -st; return w >= 19 && w <= 36 ? st : -st;
      default: return 0;
    }
  }

  function finishReveal() {
    anim.active = false; phase = 'reveal';
    env.flyTo(CAM.result.pos, CAM.result.look, 1.2);
    var rows, deltas = {};
    if (isHost()) {
      rows = [];
      Object.keys(allBets).forEach(function (pid) {
        var arr = allBets[pid] || [], netp = 0;
        arr.forEach(function (bet) { netp += evalBet(bet, winNum); });
        var p = net.players.filter(function (x) { return x.id === pid; })[0];
        deltas[pid] = netp;
        rows.push({ id: pid, name: p ? p.name : '?', net: netp, n: arr.length });
      });
      net.players.forEach(function (p) {
        if (deltas[p.id] === undefined && !p.sitout) { deltas[p.id] = 0; rows.push({ id: p.id, name: p.name, net: 0, n: 0 }); }
      });
      net.applyDeltas(deltas);
      net.broadcast('spin-result', { result: winNum, rows: rows, deltas: deltas, round: round });
      showResult(rows);
      $('nextBtn').style.display = 'block';
    } else {
      var mine = 0;
      myBets.forEach(function (bet) { mine += evalBet(bet, winNum); });
      showResult([{ id: net.playerId, name: 'You', net: mine, n: myBets.length }]);
    }
    var all = rows || [{ net: 0 }];
    var me = rows ? rows.filter(function (r) { return r.id === net.playerId; })[0] : null;
    if (me) { if (me.net > 0) window.GameSound.win(); else if (me.net < 0) window.GameSound.loss(); }
    else if (all.some(function (r) { return r.net > 0; })) window.GameSound.win();
    markWinners();
    renderPlayers(); paintMine();
    var col = winNum === 0 ? 'green' : (isRed(winNum) ? 'red' : 'black');
    $('status').textContent = 'Ball landed on ' + winNum + ' ' + col + '. Host taps Next.';
  }
  net.on('spin-result', function (d) {
    if (isHost() || !d) return;
    if (typeof d.result === 'number') winNum = d.result;
    if (d.deltas) net.applyDeltas(d.deltas);
    if (d.rows) showResult(d.rows);
    markWinners(); renderPlayers(); paintMine();
  });

  function showResult(rows) {
    var p = $('resultPanel');
    var col = winNum === 0 ? '#16a34a' : (isRed(winNum) ? '#dc2626' : '#e5e5e5');
    var html = '<div style="color:#93a9b8;font-size:11px">ROUND ' + round + ' • BALL</div>' +
      '<div class="big" style="color:' + col + '">' + winNum + '</div>' +
      '<div style="font-size:11px;color:#93a9b8">' + (winNum === 0 ? 'green • outside loses' : ((isRed(winNum) ? 'red' : 'black') + ' • ' + (winNum % 2 ? 'odd' : 'even') + ' • ' + (winNum <= 18 ? '1-18' : '19-36'))) + '</div>';
    rows.forEach(function (r) {
      var cls = r.net > 0 ? 'pos' : (r.net < 0 ? 'neg' : '');
      html += '<div style="display:flex;justify-content:space-between;gap:8px"><span>' + esc(r.name) + ' (' + r.n + ')</span><b class="' + cls + '">' + (r.net > 0 ? '+' : '') + r.net + '</b></div>';
    });
    if (!isHost()) html += '<div style="color:#93a9b8;font-size:11px">Waiting for host: Next…</div>';
    p.innerHTML = html; p.classList.add('show');
  }
  function clearMarks() {
    Array.prototype.slice.call(document.querySelectorAll('.hit,.miss')).forEach(function (x) { x.classList.remove('hit', 'miss'); });
  }
  function markWinners() {
    if (winNum === null) return;
    // numbers: hit if any of my/host bets covering win? mark straight cell hit, others fade
    Object.keys(numBtns).forEach(function (k) {
      var v = parseInt(k, 10), b = numBtns[k];
      b.classList.remove('hit', 'miss');
      b.classList.add(v === winNum ? 'hit' : 'miss');
    });
    var z = $('zero');
    z.classList.remove('hit', 'miss');
    z.classList.add(winNum === 0 ? 'hit' : 'miss');
    // outside buttons: evaluate a probe bet of that kind for highlight
    Array.prototype.slice.call(document.querySelectorAll('.out[data-k]')).forEach(function (b) {
      var k = b.getAttribute('data-k');
      var probe = { kind: k, sel: null, stake: 5 };
      // inside probe not applicable
      var v = 0;
      try { v = evalBet(probe, winNum); } catch (e) { v = 0; }
      b.classList.remove('hit', 'miss');
      // only mark outside/dozen/col kinds; straight etc not present here
      b.classList.add(v > 0 ? 'hit' : 'miss');
    });
    // fade losing straight chips is handled by .miss on cells
  }

  // ---------- spin / next / clock ----------
  $('spinBtn').addEventListener('click', function () { window.GameSound.click(); hostSpin(); });
  $('nextBtn').addEventListener('click', function () {
    if (!isHost()) return;
    window.GameSound.click();
    round++; myBets = []; allBets = {}; pendingSplit = null; winNum = null;
    phase = 'bet';
    paintMyBets(); clearMarks();
    // reset number cell fades
    Object.keys(numBtns).forEach(function (k) { numBtns[k].classList.remove('hit', 'miss'); });
    $('zero').classList.remove('hit', 'miss');
    $('resultPanel').classList.remove('show');
    $('nextBtn').style.display = 'none';
    env.flyTo(CAM.start.pos, CAM.start.look, 1.0);
    net.broadcast('next', { round: round });
    $('status').textContent = 'Place bets — 30s.';
    startClock(); renderPlayers();
    setTimeout(function () {
      if (!isHost()) return;
      net.players.forEach(function (p) { if (p.bot && !p.sitout) allBets[p.id] = randomBotBets(); });
      net.broadcast('bets-echo', { all: allBets }); renderPlayers(); paintMine();
    }, 1500);
  });
  net.on('next', function (d) {
    if (isHost()) return;
    if (d && d.round) round = d.round;
    myBets = []; pendingSplit = null; winNum = null; phase = 'bet';
    paintMyBets(); clearMarks();
    Object.keys(numBtns).forEach(function (k) { numBtns[k].classList.remove('hit', 'miss'); });
    $('zero').classList.remove('hit', 'miss');
    $('resultPanel').classList.remove('show');
    $('nextBtn').style.display = 'none';
    env.flyTo(CAM.start.pos, CAM.start.look, 1.0);
    startClock(); renderPlayers();
  });

  function startClock() {
    stopClock();
    betLeft = betSecs; paintClock();
    betTimer = setInterval(function () {
      betLeft -= 1; paintClock();
      if (betLeft <= 0) {
        stopClock();
        if (isHost()) { $('status').textContent = 'Time! Spinning…'; hostSpin(); }
        else $('status').textContent = 'Time! Host is spinning…';
      }
    }, 1000);
  }
  function stopClock() { if (betTimer) clearInterval(betTimer); betTimer = null; }
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
    $('spinBtn').style.display = isHost() ? 'block' : 'none';
    $('addBotBtn').style.display = isHost() ? 'inline-block' : 'none';
    $('pcount').textContent = String(net.players.length);
    var ul = $('playerList'); ul.innerHTML = '';
    net.players.forEach(function (p) {
      var li = document.createElement('li');
      if (p.id === net.playerId) li.className = 'me';
      var arr = (p.id === net.playerId) ? myBets : (allBets[p.id] || []);
      var tot = arr.reduce(function (s, x) { return s + x.stake; }, 0);
      li.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center"><b><span class="pdot" style="background:' +
        pColor(p.id) + '"></span>' + esc(p.name) + '</b><span class="bal">' + p.balance + '</span></div>' +
        '<div style="color:#93a9b8">' + (p.sitout ? 'sitting out' : (arr.length ? arr.length + ' bets • ' + tot : '…choosing')) + '</div>';
      if (isHost()) {
        var lab = document.createElement('label');
        lab.style.cssText = 'display:flex;gap:5px;align-items:center;color:#93a9b8;font-size:11px;margin-top:4px';
        var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!p.sitout;
        cb.addEventListener('change', function () { net.setSitout(p.id, cb.checked); setTimeout(renderPlayers, 60); });
        var sp = document.createElement('span'); sp.textContent = 'sit-out';
        lab.appendChild(cb); lab.appendChild(sp); li.appendChild(lab);
      }
      ul.appendChild(li);
    });
    var key = net.players.map(function (p) {
      return '<span class="pdot" style="background:' + pColor(p.id) + '"></span>' + esc(p.name);
    }).join(' &nbsp; ');
    $('colorKey').innerHTML = 'Chip colors: ' + key;
    paintClock();
  }
  net.onPlayers(renderPlayers);
  net.on('sitout', function () { setTimeout(renderPlayers, 60); });

  $('addBotBtn').addEventListener('click', function () {
    var b = net.addBot();
    if (b && isHost()) { allBets[b.id] = randomBotBets(); net.broadcast('bets-echo', { all: allBets }); }
    renderPlayers(); paintMine();
  });
  $('copyLinkBtn').addEventListener('click', function () {
    var url = location.href.split('?')[0] + '?game=roulette';
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
      return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #274357"><span>' + m + ' ' + esc(p.name) + '</span><b style="color:#e8b64c">' + p.balance + '</b></div>';
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
    round = 1; myBets = []; allBets = {}; winNum = null; phase = 'bet';
    $('podium').classList.remove('show');
    net.broadcast('restart', {}); net.broadcast('next', { round: 1 });
    paintMyBets(); startClock(); renderPlayers();
  });
  net.on('restart', function () {
    if (isHost()) return;
    net.players.forEach(function (p) { p.balance = 100; });
    round = 1; myBets = []; winNum = null; phase = 'bet';
    $('podium').classList.remove('show');
    paintMyBets(); renderPlayers();
  });

  if (!window.GameSound.isEnabled()) $('soundBtn').textContent = '🔇';
  paintMyBets(); renderPlayers(); startClock();
})();
