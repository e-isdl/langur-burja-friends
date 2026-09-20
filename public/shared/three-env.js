/* ============================================================
   Langur Burja & Friends — shared/three-env.js
   window.ThreeEnv.createScene(canvas, opts)
   Requires THREE global (load three.min.js via CDN before use).
   Dark transparent casino ambience + felt table + flyTo rig.
   ============================================================ */
(function () {
  'use strict';

  function assertThree() {
    if (!window.THREE) {
      throw new Error('THREE not loaded. Add <script src="https://unpkg.com/three@0.160.0/build/three.min.js"><\/script> before three-env.js');
    }
    return window.THREE;
  }

  function makeFeltTexture(THREE, base1, base2) {
    var c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(256, 256, 20, 256, 256, 256);
    grad.addColorStop(0, base1 || '#2aa266');
    grad.addColorStop(0.55, '#1e8c52');
    grad.addColorStop(1, base2 || '#073520');
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 512);
    // subtle cloth noise
    for (var i = 0; i < 2600; i++) {
      g.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.03) + ')';
      g.fillRect(Math.random() * 512, Math.random() * 512, 1, 1);
    }
    // stitched rim
    g.strokeStyle = 'rgba(232,185,35,0.55)';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(256, 256, 238, 0, Math.PI * 2);
    g.stroke();
    var tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace || tex.encoding;
    return tex;
  }

  function createScene(canvas, opts) {
    var THREE = assertThree();
    opts = opts || {};
    if (!canvas) throw new Error('ThreeEnv.createScene(canvas) — canvas required');

    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(canvas.clientWidth || 800, canvas.clientHeight || 600, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    try {
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = opts.exposure || 1.05;
    } catch (e) {}

    var scene = new THREE.Scene();
    scene.background = null; // transparent over CSS felt gradient
    if (opts.fog !== false) {
      scene.fog = new THREE.FogExp2(0x04070a, 0.028);
    }

    var camera = new THREE.PerspectiveCamera(
      opts.fov || 50,
      (canvas.clientWidth || 800) / (canvas.clientHeight || 600),
      0.1,
      200
    );
    camera.position.set(
      (opts.camPos && opts.camPos[0]) || 0,
      (opts.camPos && opts.camPos[1]) || 7,
      (opts.camPos && opts.camPos[2]) || 10
    );

    // ---- lights: hemisphere + directional + gold spot ----
    var hemi = new THREE.HemisphereLight(0xbfd4ff, 0x0a2a18, 0.75);
    scene.add(hemi);
    var dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(6, 12, 6);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.camera.left = -12; dir.shadow.camera.right = 12;
    dir.shadow.camera.top = 12; dir.shadow.camera.bottom = -12;
    dir.shadow.radius = 4;
    scene.add(dir);
    var spot = new THREE.SpotLight(0xffd977, 60, 40, Math.PI / 5, 0.45, 1.6);
    spot.position.set(0, 12, 2);
    spot.castShadow = true;
    var spotTarget = new THREE.Object3D();
    spotTarget.position.set(0, 0, 0);
    scene.add(spotTarget);
    spot.target = spotTarget;
    scene.add(spot);

    var lights = { hemi: hemi, dir: dir, spot: spot };

    // ---- helpers ----
    function makeFeltTable(radius) {
      radius = radius || 6;
      var tex = makeFeltTexture(THREE);
      var geo = new THREE.CircleGeometry(radius, 72);
      var mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0.0 });
      var mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.receiveShadow = true;
      scene.add(mesh);
      // dark rim ring
      var rimGeo = new THREE.RingGeometry(radius, radius + 0.35, 72);
      var rimMat = new THREE.MeshStandardMaterial({ color: 0x2a1f08, roughness: 0.5, metalness: 0.4 });
      var rim = new THREE.Mesh(rimGeo, rimMat);
      rim.rotation.x = -Math.PI / 2;
      rim.position.y = 0.01;
      rim.receiveShadow = true;
      scene.add(rim);
      return mesh;
    }

    // ---- camera flyTo rig ----
    var fly = null;
    function flyTo(pos, lookAt, dur) {
      fly = {
        t: 0,
        dur: Math.max(0.01, dur || 1.2),
        fromPos: camera.position.clone(),
        toPos: new THREE.Vector3(pos[0], pos[1], pos[2]),
        fromLook: currentLook.clone(),
        toLook: new THREE.Vector3(lookAt[0], lookAt[1], lookAt[2])
      };
    }
    var currentLook = new THREE.Vector3(0, 0, 0);
    if (opts.lookAt) currentLook.set(opts.lookAt[0], opts.lookAt[1], opts.lookAt[2]);
    camera.lookAt(currentLook);

    function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

    // ---- animate loop ----
    var raf = 0;
    var clock = new THREE.Clock();
    var disposed = false;
    var onTick = opts.onTick || null;

    function frame() {
      if (disposed) return;
      raf = requestAnimationFrame(frame);
      var dt = Math.min(clock.getDelta(), 0.05);
      if (fly) {
        fly.t += dt / fly.dur;
        var k = easeInOut(Math.min(1, fly.t));
        camera.position.lerpVectors(fly.fromPos, fly.toPos, k);
        currentLook.lerpVectors(fly.fromLook, fly.toLook, k);
        camera.lookAt(currentLook);
        if (fly.t >= 1) fly = null;
      }
      if (onTick) { try { onTick(dt, { scene: scene, camera: camera }); } catch (e) {} }
      renderer.render(scene, camera);
    }
    frame();

    // ---- resize ----
    function resize() {
      var w = canvas.clientWidth || canvas.parentElement.clientWidth || 800;
      var h = canvas.clientHeight || canvas.parentElement.clientHeight || 600;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
    }
    window.addEventListener('resize', resize);
    var ro = null;
    try {
      if (window.ResizeObserver && canvas.parentElement) {
        ro = new ResizeObserver(resize);
        ro.observe(canvas.parentElement);
      }
    } catch (e) {}
    // initial fit after layout
    setTimeout(resize, 50);

    function dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      if (ro) { try { ro.disconnect(); } catch (e) {} }
      scene.traverse(function (o) {
        if (o.geometry) { try { o.geometry.dispose(); } catch (e) {} }
        if (o.material) {
          var mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach(function (m) {
            if (m.map) { try { m.map.dispose(); } catch (e) {} }
            try { m.dispose(); } catch (e) {}
          });
        }
      });
      try { renderer.dispose(); } catch (e) {}
    }

    return {
      scene: scene,
      camera: camera,
      renderer: renderer,
      lights: lights,
      makeFeltTable: makeFeltTable,
      flyTo: flyTo,
      resize: resize,
      setOnTick: function (fn) { onTick = fn; },
      dispose: dispose
    };
  }

  window.ThreeEnv = { createScene: createScene };

  /* ---- Compat layer for 3D dice games (langur-burja / sic-bo / roulette) ----
   * Provides init/makeTable/canvasTexture/get on top of createScene.
   * init(opts): {canvasId, containerId, cameraPos, lookAt, fov, bg}
   * returns {scene, camera, renderer, container, canvas, look, flyTo, onTick, ...}
   */
  (function () {
    if (window.ThreeEnv.init) return;
    function toCss(bg) {
      try {
        var h = (bg >>> 0).toString(16);
        while (h.length < 6) h = '0' + h;
        return '#' + h;
      } catch (e) { return '#0b1e14'; }
    }
    window.ThreeEnv.init = function (opts) {
      opts = opts || {};
      var canvas = document.getElementById(opts.canvasId);
      var container = (opts.containerId && document.getElementById(opts.containerId)) || (canvas && canvas.parentElement);
      var ticks = [];
      var r = createScene(canvas, {
        camPos: opts.cameraPos || [0, 9.2, 13.5],
        lookAt: opts.lookAt || [0, 0, 0],
        fov: opts.fov || 46,
        onTick: function (dt, ctx) {
          for (var i = 0; i < ticks.length; i++) { try { ticks[i](dt, ctx); } catch (e) {} }
        }
      });
      if (opts.bg !== undefined && container) {
        try { container.style.background = 'radial-gradient(circle at 50% 30%, #14532d 0%, ' + toCss(opts.bg) + ' 72%)'; } catch (e) {}
      }
      var look = new window.THREE.Vector3(
        (opts.lookAt && opts.lookAt[0]) || 0,
        (opts.lookAt && opts.lookAt[1]) || 0,
        (opts.lookAt && opts.lookAt[2]) || 0
      );
      // keep look in sync when flyTo used via wrapper
      var origFly = r.flyTo;
      function flyTo(pos, lk, dur, done) {
        try { origFly(pos, lk || [look.x, look.y, look.z], dur || 1.1); } catch (e) {}
        if (lk) look.set(lk[0], lk[1], lk[2]);
        // camera.lookAt applied each frame by createScene using its own currentLook;
        if (done) setTimeout(function () { try { done(); } catch (e) {} }, Math.max(50, (dur || 1.1) * 1000));
      }
      return {
        scene: r.scene, camera: r.camera, renderer: r.renderer,
        container: container, canvas: canvas, look: look,
        flyTo: flyTo,
        onTick: function (fn) { ticks.push(fn); },
        lookAt: function (x, y, z) { look.set(x, y, z); try { r.camera.lookAt(look); } catch (e) {} },
        resize: r.resize, dispose: r.dispose,
        _base: r
      };
    };
    window.ThreeEnv.get = function () { return null; };
    window.ThreeEnv.makeTable = function (scene, opts) {
      opts = opts || {};
      var THREE = window.THREE;
      var R = opts.radius || 6.2;
      var feltColor = opts.felt || 0x0e6b3a;
      var felt = new THREE.Mesh(
        new THREE.CylinderGeometry(R, R * 1.02, 0.35, 56),
        new THREE.MeshStandardMaterial({ color: feltColor, roughness: 0.92, metalness: 0.02 })
      );
      felt.position.y = -0.18;
      felt.receiveShadow = true;
      scene.add(felt);
      var bumper = new THREE.Mesh(
        new THREE.TorusGeometry(R + 0.22, 0.42, 18, 72),
        new THREE.MeshStandardMaterial({ color: 0x5a2d0c, roughness: 0.55, metalness: 0.08 })
      );
      bumper.rotation.x = Math.PI / 2;
      bumper.position.y = 0.18;
      bumper.castShadow = true;
      scene.add(bumper);
      var ring = new THREE.Mesh(
        new THREE.TorusGeometry(R - 0.55, 0.035, 8, 80),
        new THREE.MeshStandardMaterial({ color: 0xd9c9a3, roughness: 0.8 })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.02;
      scene.add(ring);
      var ground = new THREE.Mesh(
        new THREE.CircleGeometry(22, 48),
        new THREE.ShadowMaterial({ opacity: 0.22 })
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.4;
      ground.receiveShadow = true;
      scene.add(ground);
      return { felt: felt, bumper: bumper, radius: R };
    };
    window.ThreeEnv.canvasTexture = function (draw, w, h) {
      w = w || 128; h = h || 128;
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      draw(c.getContext('2d'), w, h);
      var t = new window.THREE.CanvasTexture(c);
      try { t.colorSpace = window.THREE.SRGBColorSpace; } catch (e) {}
      t.anisotropy = 4;
      return t;
    };
  })();
})();
