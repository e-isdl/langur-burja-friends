/* ============================================================
   Langur Burja & Friends — shared/sound.js
   window.Sound — tiny WebAudio synth, no assets needed.
   Lazy AudioContext on first pointerdown. All calls guarded.
   ============================================================ */
(function () {
  'use strict';

  var ctx = null;
  var muted = false;
  var noiseBuffer = null;

  function ensureAudio() {
    if (muted) return null;
    try {
      if (!ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch (e) {
      return null;
    }
  }

  // Unlock on first gesture (autoplay policy)
  function unlock() { ensureAudio(); }
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && ctx && ctx.state === 'suspended' && !muted) {
        try { ctx.resume(); } catch (e) {}
      }
    });
  }

  function setMuted(m) {
    muted = !!m;
    if (muted && ctx) {
      try { ctx.suspend(); } catch (e) {}
    } else if (!muted && ctx) {
      try { ctx.resume(); } catch (e) {}
    }
  }
  function isMuted() { return muted; }

  // --- primitives ---
  // tone(freq, dur, type, vol, when): `when` = seconds offset from now
  function tone(freq, dur, type, vol, when) {
    var ac = ensureAudio();
    if (!ac || muted) return;
    try {
      var t0 = ac.currentTime + (when || 0);
      var osc = ac.createOscillator();
      var g = ac.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol || 0.15), t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    } catch (e) {}
  }

  // toneSlide(f0, f1, dur, type, vol, when)
  function toneSlide(f0, f1, dur, type, vol, when) {
    var ac = ensureAudio();
    if (!ac || muted) return;
    try {
      var t0 = ac.currentTime + (when || 0);
      var osc = ac.createOscillator();
      var g = ac.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(f0, t0);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol || 0.15), t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    } catch (e) {}
  }

  function getNoiseBuffer(ac) {
    if (noiseBuffer) return noiseBuffer;
    var len = Math.floor(ac.sampleRate * 0.5);
    var buf = ac.createBuffer(1, len, ac.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    noiseBuffer = buf;
    return buf;
  }

  // noise(dur, filterFreq): filtered white-noise burst
  function noise(dur, filterFreq, vol, when, type) {
    var ac = ensureAudio();
    if (!ac || muted) return;
    try {
      var t0 = ac.currentTime + (when || 0);
      var src = ac.createBufferSource();
      src.buffer = getNoiseBuffer(ac);
      src.loop = true;
      var f = ac.createBiquadFilter();
      f.type = type || 'bandpass';
      f.frequency.value = filterFreq || 2000;
      f.Q.value = 0.9;
      var g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol || 0.12), t0 + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f);
      f.connect(g);
      g.connect(ac.destination);
      src.start(t0);
      src.stop(t0 + dur + 0.05);
    } catch (e) {}
  }

  // --- game sounds ---
  function playClick() { tone(880, 0.06, 'square', 0.06, 0); }
  function playUndo() { toneSlide(520, 260, 0.12, 'sine', 0.12, 0); }
  function playToggle() { tone(520, 0.07, 'triangle', 0.12, 0); }
  function playCardDeal() { noise(0.06, 3200, 0.1, 0); }
  function playCardFlip() { noise(0.05, 5200, 0.09, 0); tone(1320, 0.04, 'sine', 0.05, 0.01); }
  function playChip() {
    tone(180, 0.09, 'sine', 0.22, 0);
    noise(0.05, 4500, 0.08, 0);
  }
  function playDiceClack() {
    noise(0.05, 2800, 0.14, 0);
    tone(200, 0.07, 'triangle', 0.14, 0.02);
    noise(0.04, 3600, 0.1, 0.07);
  }

  var bowlTimer = null;
  function playBowlRattle() {
    // ~2s of interval bursts (Langur Burja bowl shake)
    var ac = ensureAudio();
    if (!ac || muted) return;
    stopBowlRattle();
    var i = 0;
    bowlTimer = setInterval(function () {
      if (muted) { stopBowlRattle(); return; }
      noise(0.05, 2200 + Math.random() * 2200, 0.12, 0);
      tone(150 + Math.random() * 120, 0.05, 'triangle', 0.08, 0);
      i += 1;
      if (i >= 14) stopBowlRattle();
    }, 130);
  }
  function stopBowlRattle() {
    if (bowlTimer) { clearInterval(bowlTimer); bowlTimer = null; }
  }

  function playWinChime() {
    // C5 - E5 - G5 - C6 arpeggio
    var notes = [523.25, 659.25, 783.99, 1046.5];
    for (var i = 0; i < notes.length; i++) {
      tone(notes[i], 0.35, 'sine', 0.14, i * 0.11);
      tone(notes[i] * 2, 0.2, 'sine', 0.04, i * 0.11);
    }
  }
  function playLossThud() { toneSlide(140, 110, 0.25, 'sine', 0.2, 0); }
  function playJackpot() {
    var notes = [392, 523.25, 659.25, 783.99, 1046.5, 1318.5];
    for (var i = 0; i < notes.length; i++) {
      tone(notes[i], 0.22, 'triangle', 0.13, i * 0.09);
    }
    noise(0.3, 6000, 0.05, 0.45, 'highpass');
  }
  function playYourTurn() {
    tone(660, 0.1, 'sine', 0.14, 0);
    tone(660, 0.12, 'sine', 0.14, 0.14);
  }

  window.Sound = {
    setMuted: setMuted,
    isMuted: isMuted,
    toggleMuted: function () { setMuted(!muted); return muted; },
    ensureAudio: ensureAudio,
    tone: tone,
    noise: noise,
    playClick: playClick,
    playUndo: playUndo,
    playToggle: playToggle,
    playCardDeal: playCardDeal,
    playCardFlip: playCardFlip,
    playChip: playChip,
    playDiceClack: playDiceClack,
    playBowlRattle: playBowlRattle,
    stopBowlRattle: stopBowlRattle,
    playWinChime: playWinChime,
    playLossThud: playLossThud,
    playJackpot: playJackpot,
    playYourTurn: playYourTurn
  };

  /* ---- Compat: GameSound + LBSound + SoundFX for 3D dice games ----
   * Maps onto the primitives above. No assets. */
  (function () {
    if (window.GameSound) return;
    function sndEnabled() { return !muted; }
    var G = {
      isEnabled: sndEnabled,
      toggle: function () {
        setMuted(!muted);
        try { localStorage.setItem('lbf_sound', muted ? 'off' : 'on'); } catch (e) {}
        return !muted;
      },
      click: function () { playClick(); },
      chip: function () { playChip(); },
      clack: function () { playDiceClack(); },
      dice: function () {
        playDiceClack();
        setTimeout(playDiceClack, 110);
        setTimeout(playDiceClack, 230);
      },
      bowl: function () { playBowlRattle(); },
      rattle: function () { noise(0.2, 1600, 0.12, 0); },
      spin: function () {
        for (var i = 0; i < 8; i++) tone(880 + (i % 4) * 70, 0.05, 'square', 0.05, i * 0.16);
      },
      reveal: function () { toneSlide(440, 880, 0.35, 'sine', 0.14, 0); },
      win: function () { playWinChime(); },
      loss: function () { playLossThud(); }
    };
    try {
      if (localStorage.getItem('lbf_sound') === 'off') setMuted(true);
    } catch (e) {}
    window.GameSound = G;
    // legacy aliases used by card games
    window.LBSound = {
      play: function (n) {
        if (n === 'win') G.win();
        else if (n === 'chip') G.chip();
        else if (n === 'dice' || n === 'roll') G.dice();
        else if (n === 'click') G.click();
        else if (n === 'loss' || n === 'fold') G.loss();
        else G.click();
      },
      setMuted: function (m) { setMuted(!!m); }
    };
    window.SoundFX = window.LBSound;
  })();
})();
