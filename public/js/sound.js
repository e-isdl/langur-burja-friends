// WebAudio synth. No audio files. Muted state persists.
let ctx = null, master = null;
let muted = false; try { muted = localStorage.getItem('lbf_mute') === '1'; } catch (_) {}
function ensure() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination); return ctx;
}
addEventListener('pointerdown', () => ensure(), { passive: true });
function tone(freq, dur, { type = 'sine', vol = 0.3, at = 0, slide = 0, attack = 0.005 } = {}) {
  if (muted) return; const c = ensure(); if (!c) return;
  const t = c.currentTime + at; const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.03);
}
function noise(dur, { vol = 0.25, at = 0, lp = 3000, hp = 200 } = {}) {
  if (muted) return; const c = ensure(); if (!c) return;
  const t = c.currentTime + at; const len = Math.floor(c.sampleRate * dur); const buf = c.createBuffer(1, len, c.sampleRate); const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = c.createBufferSource(); s.buffer = buf; const f1 = c.createBiquadFilter(); f1.type = 'lowpass'; f1.frequency.value = lp; const f2 = c.createBiquadFilter(); f2.type = 'highpass'; f2.frequency.value = hp;
  const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f1); f1.connect(f2); f2.connect(g); g.connect(master); s.start(t);
}
export const Sound = {
  get muted() { return muted; },
  setMuted(m) { muted = !!m; try { localStorage.setItem('lbf_mute', m ? '1' : '0'); } catch (_) {} },
  tap() { noise(0.045, { vol: 0.15, lp: 3200, hp: 500 }); tone(300, 0.06, { vol: 0.1, slide: -70 }); },
  card() { noise(0.07, { vol: 0.3, lp: 4500, hp: 900 }); tone(180, 0.06, { vol: 0.12 }); },
  deal() { for (let i = 0; i < 5; i++) noise(0.05, { vol: 0.2, at: i * 0.07, lp: 4800, hp: 1200 }); },
  shuffle() { for (let i = 0; i < 9; i++) noise(0.05, { vol: 0.15, at: i * 0.045, lp: 4200, hp: 700 }); },
  chip() { noise(0.05, { vol: 0.17, lp: 7000, hp: 3200 }); tone(1750, 0.09, { vol: 0.1, slide: -450 }); tone(2600, 0.06, { vol: 0.045, at: 0.02 }); },
  turn() { tone(784, 0.5, { vol: 0.16, attack: 0.004 }); tone(1568, 0.3, { vol: 0.05, at: 0.012 }); },
  win() { [523.25, 659.25, 784].forEach((f, i) => tone(f, 0.7, { vol: 0.11, at: i * 0.055, attack: 0.06 })); tone(1046.5, 0.5, { vol: 0.05, at: 0.26, attack: 0.1 }); },
  lose() { tone(392, 0.42, { vol: 0.13, slide: -70, attack: 0.01 }); tone(196, 0.5, { vol: 0.07, at: 0.12 }); },
  tick() { tone(1100, 0.03, { type: 'triangle', vol: 0.05 }); },
  error() { tone(150, 0.1, { vol: 0.14 }); noise(0.05, { vol: 0.08, lp: 900, hp: 120, at: 0.14 }); tone(150, 0.1, { vol: 0.12, at: 0.14 }); },
  dice() { for (let i = 0; i < 10; i++) { noise(0.05, { vol: 0.22, at: i * 0.11 + Math.random() * 0.03, lp: 2500, hp: 400 }); tone(140 + Math.random() * 90, 0.05, { type: 'triangle', vol: 0.1, at: i * 0.11 }); } },
  react() { tone(740, 0.1, { vol: 0.14 }); tone(988, 0.1, { vol: 0.12, at: 0.06 }); },
  vibe(ms = 20) { try { navigator.vibrate && navigator.vibrate(ms); } catch (_) {} },
};
