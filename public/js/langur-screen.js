// Langur Burja fullscreen screen (v2).
// The offline game's look and physics (ivory symbol dice, wood/felt table,
// bowl with brass rim, ACES, bowl-shake -> throw -> tumble -> 3x2 settle),
// but the SERVER is authoritative: dice settle to exactly v.faces, betting
// goes through {t:'act'}, the server auto-rolls when betting completes.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Sound } from './sound.js';
import { send } from './net.js';
import { S, isHost, gameInfo } from './state.js';
import { openKhata, openRules, toast } from './ui.js';

/* ================= symbol art (offline benchmark) ================= */
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function drawFlag(ctx, R) { ctx.lineCap = 'round'; ctx.lineWidth = R * 0.16; ctx.beginPath(); ctx.moveTo(-R * 0.56, R * 0.88); ctx.lineTo(-R * 0.56, -R * 0.88); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-R * 0.56, -R * 0.84); ctx.lineTo(R * 0.88, -R * 0.46); ctx.lineTo(-R * 0.56, -R * 0.04); ctx.closePath(); ctx.fill(); }
function drawTower(ctx, R, bg) { const w = R * 1.12, x0 = -w / 2; ctx.beginPath(); ctx.rect(x0, -R * 0.3, w, R * 0.96); ctx.fill(); for (let i = 0; i < 3; i++) { const bw = w / 5; const cx = x0 + (w * (2 * i + 1)) / 6; ctx.fillRect(cx - bw / 2, -R * 0.64, bw, R * 0.36); } ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(-R * 0.19, R * 0.66); ctx.lineTo(-R * 0.19, R * 0.14); ctx.arc(0, R * 0.14, R * 0.19, Math.PI, Math.PI * 2); ctx.lineTo(R * 0.19, R * 0.66); ctx.closePath(); ctx.fill(); }
function drawBrick(ctx, R, bg) { rr(ctx, -R * 0.96, -R * 0.62, R * 1.92, R * 1.24, R * 0.15); ctx.fill(); ctx.save(); ctx.strokeStyle = bg; ctx.lineWidth = R * 0.13; ctx.lineCap = 'butt'; ctx.beginPath(); ctx.moveTo(-R * 0.96, 0); ctx.lineTo(R * 0.96, 0); ctx.moveTo(-R * 0.32, -R * 0.62); ctx.lineTo(-R * 0.32, 0); ctx.moveTo(R * 0.32, 0); ctx.lineTo(R * 0.32, R * 0.62); ctx.stroke(); ctx.restore(); }
function drawSpade(ctx, R) { ctx.beginPath(); ctx.moveTo(0, -R * 0.96); ctx.bezierCurveTo(-R * 0.16, -R * 0.58, -R * 0.88, -R * 0.34, -R * 0.88, R * 0.06); ctx.bezierCurveTo(-R * 0.88, R * 0.48, -R * 0.36, R * 0.52, -R * 0.21, R * 0.26); ctx.lineTo(-R * 0.36, R * 0.8); ctx.lineTo(R * 0.36, R * 0.8); ctx.lineTo(R * 0.21, R * 0.26); ctx.bezierCurveTo(R * 0.36, R * 0.52, R * 0.88, R * 0.48, R * 0.88, R * 0.06); ctx.bezierCurveTo(R * 0.88, -R * 0.34, R * 0.16, -R * 0.58, 0, -R * 0.96); ctx.closePath(); ctx.fill(); }
function drawClub(ctx, R) { ctx.beginPath(); ctx.arc(0, -R * 0.48, R * 0.46, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(-R * 0.47, R * 0.16, R * 0.46, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(R * 0.47, R * 0.16, R * 0.46, 0, 7); ctx.fill(); ctx.beginPath(); ctx.moveTo(-R * 0.32, R * 0.88); ctx.lineTo(-R * 0.15, R * 0.34); ctx.lineTo(R * 0.15, R * 0.34); ctx.lineTo(R * 0.32, R * 0.88); ctx.closePath(); ctx.fill(); }
function drawHeart(ctx, R) { ctx.beginPath(); ctx.moveTo(0, R * 0.9); ctx.bezierCurveTo(-R * 1.02, R * 0.14, -R * 0.76, -R * 0.78, 0, -R * 0.3); ctx.bezierCurveTo(R * 0.76, -R * 0.78, R * 1.02, R * 0.14, 0, R * 0.9); ctx.closePath(); ctx.fill(); }

const SYMBOLS = [
  { name: 'Jhandi', sub: 'Flag', color: '#c0201c', draw: drawFlag },
  { name: 'Burja', sub: 'Tower', color: '#1e40af', draw: drawTower },
  { name: 'Itta', sub: 'Brick', color: '#b45309', draw: drawBrick },
  { name: 'Hukum', sub: 'Spade', color: '#0a0a0a', draw: drawSpade },
  { name: 'Chidi', sub: 'Club', color: '#065f46', draw: drawClub },
  { name: 'Paan', sub: 'Heart', color: '#b91c40', draw: drawHeart },
];
const _rb = new Uint32Array(1);
function rfloat() { try { crypto.getRandomValues(_rb); return _rb[0] / 0x100000000; } catch (_) { return Math.random(); } }
function rrange(a, b) { return a + rfloat() * (b - a); }

function makeFaceCanvas(i, size = 512) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, size * 0.7, size);
  g.addColorStop(0, '#f5ead0'); g.addColorStop(0.55, '#ead6ab'); g.addColorStop(1, '#d6bd8a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  const e = ctx.createRadialGradient(size / 2, size / 2, size * 0.28, size / 2, size / 2, size * 0.78);
  e.addColorStop(0, 'rgba(0,0,0,0)'); e.addColorStop(1, 'rgba(90,60,20,0.20)');
  ctx.fillStyle = e; ctx.fillRect(0, 0, size, size);
  ctx.save(); ctx.translate(size / 2, size / 2);
  ctx.save(); ctx.translate(size * 0.006, size * 0.008);
  ctx.fillStyle = 'rgba(70,45,15,0.30)'; ctx.strokeStyle = 'rgba(70,45,15,0.30)';
  SYMBOLS[i].draw(ctx, size * 0.30, '#ead6ab'); ctx.restore();
  ctx.fillStyle = SYMBOLS[i].color; ctx.strokeStyle = SYMBOLS[i].color;
  SYMBOLS[i].draw(ctx, size * 0.30, '#ead6ab'); ctx.restore();
  return c;
}
function makeWoodCanvas(size = 512, hue = 22, sat = 42) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = `hsl(${hue}, ${sat}%, 20%)`; ctx.fillRect(0, 0, size, size);
  for (let o = 0; o < 2; o++) {
    const cx = size * (0.32 + o * 0.36), cy = size * (0.45 + o * 0.1);
    for (let i = 0; i < 160; i++) {
      const t = i / 160, r = 12 + t * size * 1.05;
      ctx.strokeStyle = `hsla(${hue + rfloat() * 8 - 4}, ${sat}%, ${14 + rfloat() * 20}%, ${0.03 + rfloat() * 0.08})`;
      ctx.lineWidth = 0.4 + rfloat() * 2.4;
      ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 1.08, rfloat() * 0.4, 0, Math.PI * 2); ctx.stroke();
    }
  }
  return c;
}

/* ================= css (offline look, scoped .lgfs) ================= */
// The table/lobby stylesheets define a lot of generic class names (.rail, .dock,
// .btn, .sym, ...). Everything in this screen lives under .lgfs, so wipe any
// inherited author styles first and rebuild the look from scratch here.
const CSS = `
.lgfs, .lgfs *{all:revert}
.lgfs button{-webkit-appearance:none;appearance:none}
.lgfs{position:fixed;inset:0;z-index:10;background:#04070a;color:#e8eef7;font-family:'Mukta',system-ui,sans-serif;overflow:hidden;user-select:none;-webkit-user-select:none}
.lgfs canvas#lgScene{position:absolute;inset:0;width:100%;height:100%;display:block}
.lgfs .vig{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 42%,transparent 45%,rgba(0,0,0,.20) 82%,rgba(0,0,0,.50) 100%)}
.lgfs .top{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;gap:8px;padding:10px 12px;background:linear-gradient(180deg,rgba(5,8,12,.94),rgba(5,8,12,0));z-index:20}
.lgfs .brand{font-family:'Playfair Display',serif;font-weight:900;font-size:17px;background:linear-gradient(180deg,#ffe9a8,#e8b923 60%,#a97c14);-webkit-background-clip:text;background-clip:text;color:transparent;white-space:nowrap}
.lgfs .pill{font-size:11.5px;font-weight:700;color:#9fb0c6;padding:5px 12px;border-radius:999px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);white-space:nowrap}
.lgfs .pill b{color:#ffd964}
.lgfs .sp{flex:1}
.lgfs .gh{padding:7px 13px;border-radius:11px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:700;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.11);color:#c8d5e6}
.lgfs .rail{position:absolute;top:52px;left:10px;right:10px;display:flex;gap:6px;overflow-x:auto;z-index:20;padding-bottom:4px;scrollbar-width:none}
.lgfs .rail::-webkit-scrollbar{display:none}
.lgfs .pc{flex:0 0 auto;min-width:108px;max-width:150px;display:flex;align-items:center;gap:6px;padding:5px 7px;border-radius:11px;background:linear-gradient(160deg,rgba(28,37,50,.82),rgba(12,17,24,.85));border:1px solid rgba(255,255,255,.07)}
.lgfs .pc.me{border-color:rgba(232,185,35,.6)}
.lgfs .pc.act{border-color:rgba(232,185,35,.85);box-shadow:0 0 14px rgba(232,185,35,.25)}
.lgfs .pc.out{opacity:.4;filter:grayscale(.7)}
.lgfs .pc.done{border-color:rgba(232,185,35,.55)}
.lgfs .av{width:24px;height:24px;border-radius:8px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:#08121c}
.lgfs .pn{font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lgfs .pm{font-size:9.5px;color:#93a5bd;font-variant-numeric:tabular-nums}
.lgfs .dock{position:absolute;left:0;right:0;bottom:0;z-index:25;pointer-events:none;padding:0 12px calc(10px + env(safe-area-inset-bottom));display:flex;flex-direction:column;align-items:center;gap:8px}
.lgfs .dock>*{pointer-events:auto}
.lgfs .turn{display:flex;align-items:center;gap:8px;padding:7px 14px;border-radius:999px;font-size:12.5px;background:rgba(13,18,26,.94);border:1px solid rgba(232,185,35,.32);max-width:96vw}
.lgfs .turn b{color:#ffd964;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:40vw}
.lgfs .turn span{color:#8b9bb4;font-size:11.5px;white-space:nowrap}
.lgfs .bw{width:min(840px,100%);padding:9px;border-radius:18px;background:linear-gradient(180deg,rgba(22,30,42,.92),rgba(9,13,19,.95));border:1px solid rgba(255,255,255,.08);box-shadow:0 20px 60px rgba(0,0,0,.6)}
.lgfs .bb{display:flex;align-items:center;gap:7px;padding:6px 8px;margin-bottom:5px;border-bottom:1px solid rgba(255,255,255,.06)}
.lgfs .bb .lb{font-size:10.5px;font-weight:700;letter-spacing:1.2px;color:#8b9bb4}
.lgfs .bb button{min-width:48px;padding:6px 10px;font-size:12px;font-weight:800;border-radius:10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#c8d5e6;cursor:pointer;font-family:inherit}
.lgfs .bb button.on{background:linear-gradient(180deg,#ffe08a,#e8b923 60%,#c9920f);color:#2a1c00;border-color:#ffe9a8}
.lgfs .bb .inf{font-size:11px;color:#8296ae;margin-left:auto;text-align:right}
.lgfs .bb .inf b{color:#ffd964}
.lgfs .bd{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}
.lgfs .sym{position:relative;display:flex;flex-direction:column;align-items:center;gap:3px;padding:7px 3px 6px;border-radius:13px;cursor:pointer;font-family:inherit;color:inherit;background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.02));border:1px solid rgba(255,255,255,.09);min-height:44px}
.lgfs .sym img{width:clamp(30px,6vw,40px);height:clamp(30px,6vw,40px);border-radius:9px;box-shadow:0 4px 12px rgba(0,0,0,.45)}
.lgfs .sym small{font-size:10.5px;font-weight:800}
.lgfs .sym em{font-size:8.5px;color:#7e8fa6;font-style:normal;text-transform:uppercase;letter-spacing:.5px}
.lgfs .sym.hasbet{border-color:rgba(232,185,35,.7)}
.lgfs .sym.won{border-color:#45cf8e;box-shadow:0 0 0 2px rgba(69,207,142,.28),0 0 22px rgba(69,207,142,.28)}
.lgfs .sym.dis{pointer-events:none;opacity:.55}
.lgfs .sym .n{position:absolute;top:-6px;right:-4px;min-width:22px;height:20px;padding:0 5px;border-radius:10px;background:linear-gradient(180deg,#ffe08a,#e0a800);color:#2a1c00;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;border:1.5px solid rgba(255,255,255,.55)}
.lgfs .db{display:flex;align-items:center;gap:8px;margin-top:8px}
.lgfs .db .fl{flex:1}
.lgfs .btn{padding:10px 20px;border-radius:12px;border:none;cursor:pointer;font-family:inherit;font-weight:800;font-size:13px;background:linear-gradient(180deg,#ffe08a,#e8b923 55%,#c9920f);color:#2a1c00}
.lgfs .btn:disabled{opacity:.35}
.lgfs .btn.ghost{background:rgba(255,255,255,.06);color:#c8d5e6;border:1px solid rgba(255,255,255,.12)}
.lgfs .rs{position:absolute;left:12px;top:116px;width:252px;z-index:22;padding:12px;border-radius:15px;background:linear-gradient(165deg,rgba(28,38,52,.95),rgba(10,15,22,.97));border:1px solid rgba(232,185,35,.28);box-shadow:0 18px 50px rgba(0,0,0,.65);max-height:calc(100vh - 360px);overflow:auto;scrollbar-width:thin}
.lgfs .rs h4{font-family:'Playfair Display',serif;text-align:center;margin:0 0 8px;background:linear-gradient(180deg,#fff3c4,#e8b923 60%,#a97c14);-webkit-background-clip:text;background-clip:text;color:transparent}
.lgfs .rs .dc{display:flex;gap:4px;justify-content:center;margin-bottom:8px;flex-wrap:wrap}
.lgfs .rs .dc img{width:28px;height:28px;border-radius:6px;border:1px solid rgba(255,255,255,.16)}
.lgfs .rs .rw{display:flex;justify-content:space-between;font-size:11.5px;font-weight:600;padding:4px 7px;border-radius:7px;background:rgba(255,255,255,.045);margin-bottom:3px}
.lgfs .rs .rw .w{color:#45cf8e;font-weight:800}.rs .rw .l{color:#ef7f70;font-weight:800}.rs .rw .f{color:#93a5bd;font-weight:800}
.lgfs .rs .btn{width:100%;margin-top:8px;padding:8px;font-size:12px}
@media (max-width:700px){.lgfs .bd{grid-template-columns:repeat(3,1fr)}.lgfs .rs{left:8px;right:8px;top:114px;bottom:auto;width:auto;padding:9px;max-height:calc(100vh - 480px)}.lgfs .brand{font-size:14px}.lgfs .top{padding:8px 8px;gap:5px}.lgfs .gh{padding:6px 9px;font-size:11px}}
`;
let cssOn = false;

/* ================= module state ================= */
let root = null, hooks = null, mounted = false;
let renderer, scene, camera, composer, dice = [], bowlGroup, faceTex = [], faceURL = [];
let camPos, camLook, camTrans = null, camShake = 0, parallax = { x: 0, y: 0 }, parK = 1, parT = 1;
let raf = 0, ro = null, clockInt = 0;
let lastHand = -1, lastPhase = '', stakeSel = 10, timers = [];
let lastCanBet = false;
let els = {};
const DIE = 0.62, HALF = DIE / 2, GRAV = -20, DT = 1 / 180, WALL = 4.0;
const RATTLE = 2.0, THROW = 0.7, ARR_DUR = 0.85, MAXPHYS = 11;
const BOWL_HOME = { x: 0, y: 2.3, z: 0 };
const FACE_UP_Q = [];
const CORNERS = [];
let lastMsg = null;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const seatName = (i) => {
  if (!lastMsg) return 'Player ' + (i + 1);
  const pid = lastMsg.seatPids && lastMsg.seatPids[i];
  const p = pid && S.room ? S.room.players.find((q) => q.pid === pid) : null;
  return p ? p.name : 'Player ' + (i + 1);
};
const seatKhata = (i) => {
  if (!lastMsg) return 0;
  const pid = lastMsg.seatPids && lastMsg.seatPids[i];
  const p = pid && S.room ? S.room.players.find((q) => q.pid === pid) : null;
  return p ? p.khata : 0;
};
const AVC = ['#7fb0e0', '#e0998c', '#dfc06a', '#7fc9a8', '#a699dd', '#d995b5', '#8fa9dd', '#e0a878'];
const initials = (n) => (n || '?').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };

/* ================= three setup ================= */
function easeIO(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
function makeBackdrop() {
  const Sz = 512, c = document.createElement('canvas'); c.width = c.height = Sz;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(Sz / 2, Sz * 0.3, Sz * 0.05, Sz / 2, Sz * 0.5, Sz * 0.9);
  g.addColorStop(0, '#141e2a'); g.addColorStop(0.5, '#0a0f18'); g.addColorStop(1, '#030508');
  x.fillStyle = g; x.fillRect(0, 0, Sz, Sz);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function setCam(name, dur = 0.8) {
  const V = {
    idle: [[0, 12.5, 18.0], [0, -2.6, -0.6]],
    overhead: [[0, 22.0, 7.0], [0, -1.0, -1.0]],
    result: [[0, 14.5, 15.5], [0, -2.3, -0.8]],
  }[name];
  camTrans = { fp: camPos.clone(), fl: camLook.clone(), tp: new THREE.Vector3(...V[0]), tl: new THREE.Vector3(...V[1]), t0: performance.now(), dur: dur * 1000 };
  parT = name === 'idle' ? 1 : 0;
}
function makeFelt() {
  const Sz = 1024, c = document.createElement('canvas'); c.width = c.height = Sz;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(Sz / 2, Sz / 2, Sz * 0.03, Sz / 2, Sz / 2, Sz * 0.55);
  g.addColorStop(0, '#1e8c52'); g.addColorStop(0.5, '#136b3c'); g.addColorStop(1, '#073520');
  x.fillStyle = g; x.fillRect(0, 0, Sz, Sz);
  x.globalAlpha = 0.05;
  for (let i = 0; i < 20000; i++) { x.fillStyle = rfloat() > 0.5 ? '#fff' : '#000'; x.fillRect(rfloat() * Sz, rfloat() * Sz, 1.6, 1.6); }
  x.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
function makeEnv(r) {
  const W = 512, Hh = 256, c = document.createElement('canvas'); c.width = W; c.height = Hh;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, Hh);
  g.addColorStop(0, '#0c1420'); g.addColorStop(0.5, '#2e1d10'); g.addColorStop(1, '#080402');
  x.fillStyle = g; x.fillRect(0, 0, W, Hh);
  [[110, 65, 90], [260, 50, 75], [405, 70, 85]].forEach(([lx, ly, lr]) => {
    const rg = x.createRadialGradient(lx, ly, 0, lx, ly, lr);
    rg.addColorStop(0, 'rgba(255,215,155,0.9)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = rg; x.fillRect(lx - lr, ly - lr, lr * 2, lr * 2);
  });
  const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
  const pm = new THREE.PMREMGenerator(r); pm.compileEquirectangularShader();
  const rt = pm.fromEquirectangular(t); t.dispose(); pm.dispose();
  return rt.texture;
}
function roundedBox(w, h, d, r) {
  const g = new THREE.BoxGeometry(w, h, d, 6, 6, 6);
  const pos = g.attributes.position, hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    const cx = Math.max(-hw, Math.min(hw, v.x)), cy = Math.max(-hh, Math.min(hh, v.y)), cz = Math.max(-hd, Math.min(hd, v.z));
    const dx = v.x - cx, dy = v.y - cy, dz = v.z - cz, len = Math.hypot(dx, dy, dz);
    if (len > 1e-6) { const s = r / len; pos.setXYZ(i, cx + dx * s, cy + dy * s, cz + dz * s); }
  }
  g.computeVertexNormals(); return g;
}
function initScene(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.35;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  scene.environment = makeEnv(renderer);
  scene.background = makeBackdrop();
  camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200);
  camPos = new THREE.Vector3(0, 12.5, 18.0); camLook = new THREE.Vector3(0, -2.6, -0.6);
  camera.position.copy(camPos); camera.lookAt(camLook);
  scene.add(new THREE.HemisphereLight(0xa8c4e8, 0x3a2410, 0.55));
  const key = new THREE.DirectionalLight(0xfff0d6, 2.4);
  key.position.set(-4, 9, 6); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 30 });
  key.shadow.bias = -0.0008; key.shadow.normalBias = 0.03; key.shadow.radius = 5;
  scene.add(key);
  const lamp = new THREE.PointLight(0xffc890, 42, 22, 2); lamp.position.set(-3.5, 6.5, 2); scene.add(lamp);
  const fill = new THREE.PointLight(0x9dbcff, 16, 20, 2); fill.position.set(5, 4.5, 5); scene.add(fill);
  const rim = new THREE.PointLight(0x7ea8ff, 24, 18, 2); rim.position.set(6, 4, -5); scene.add(rim);
  const woodTex = new THREE.CanvasTexture(makeWoodCanvas(512)); woodTex.colorSpace = THREE.SRGBColorSpace;
  woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping; woodTex.repeat.set(3, 3);
  const wood = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 5.6, 0.95, 72),
    new THREE.MeshStandardMaterial({ map: woodTex, color: 0xb8855a, roughness: 0.62, envMapIntensity: 0.5 }));
  wood.position.y = -0.475; wood.receiveShadow = true; scene.add(wood);
  const felt = new THREE.Mesh(new THREE.CylinderGeometry(4.9, 4.9, 1.0, 72),
    new THREE.MeshStandardMaterial({ map: makeFelt(), roughness: 0.96, envMapIntensity: 0.25 }));
  felt.position.y = -0.475; felt.receiveShadow = true; scene.add(felt);
  const bumper = new THREE.Mesh(new THREE.TorusGeometry(4.9, 0.22, 14, 90),
    new THREE.MeshStandardMaterial({ color: 0x1a0a06, roughness: 0.72, envMapIntensity: 0.5 }));
  bumper.rotation.x = Math.PI / 2; bumper.position.y = 0.02; bumper.castShadow = true; scene.add(bumper);
  faceTex = SYMBOLS.map((_, i) => { const t = new THREE.CanvasTexture(makeFaceCanvas(i)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; });
  const mats = faceTex.map((t) => new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.32, clearcoat: 0.85, clearcoatRoughness: 0.1, envMapIntensity: 0.75 }));
  const geo = roundedBox(DIE, DIE, DIE, DIE * 0.1);
  dice = [];
  for (let i = 0; i < 6; i++) {
    const mesh = new THREE.Mesh(geo, mats);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.visible = false;
    scene.add(mesh);
    dice.push({ mesh, pos: new THREE.Vector3(0, -10, 0), vel: new THREE.Vector3(), quat: new THREE.Quaternion(), ang: new THREE.Vector3(), slow: 0 });
  }
  if (!CORNERS.length) for (const x of [-HALF, HALF]) for (const y of [-HALF, HALF]) for (const z of [-HALF, HALF]) CORNERS.push(new THREE.Vector3(x, y, z));
  if (!FACE_UP_Q.length) {
    FACE_UP_Q.push(
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2),
      new THREE.Quaternion(),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
  }
  const prof = [[0, -0.62], [0.55, -0.62], [0.92, -0.58], [1.18, -0.42], [1.36, -0.16], [1.48, 0.18], [1.53, 0.5], [1.55, 0.58], [1.53, 0.62], [1.46, 0.6], [1.4, 0.52], [1.34, 0.28], [1.2, -0.1], [0.9, -0.42], [0.52, -0.55], [0, -0.57]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const btex = new THREE.CanvasTexture(makeWoodCanvas(512, 18, 38)); btex.colorSpace = THREE.SRGBColorSpace;
  btex.wrapS = btex.wrapT = THREE.RepeatWrapping; btex.repeat.set(3, 2);
  bowlGroup = new THREE.Group();
  const bm = new THREE.Mesh(new THREE.LatheGeometry(prof, 48),
    new THREE.MeshStandardMaterial({ map: btex, color: 0xc88f58, roughness: 0.55, envMapIntensity: 0.6, side: THREE.DoubleSide }));
  bm.castShadow = true; bowlGroup.add(bm);
  const brim = new THREE.Mesh(new THREE.TorusGeometry(1.54, 0.045, 10, 48),
    new THREE.MeshStandardMaterial({ color: 0xb87a3c, roughness: 0.32, metalness: 0.85, envMapIntensity: 1.3 }));
  brim.rotation.x = Math.PI / 2; brim.position.y = 0.6; bowlGroup.add(brim);
  bowlGroup.scale.set(0.68, 0.68, 0.68); bowlGroup.visible = false;
  scene.add(bowlGroup);
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new OutputPass());
  faceURL = SYMBOLS.map((_, i) => makeFaceCanvas(i, 256).toDataURL());
}

/* ================= dice physics (offline) ================= */
const _rc = { v: null };
let RC, VC, RX, IM, TQ, AX, TV, RT;
function vecs() {
  if (RC) return;
  RC = new THREE.Vector3(); VC = new THREE.Vector3(); RX = new THREE.Vector3(); IM = new THREE.Vector3();
  TQ = new THREE.Quaternion(); AX = new THREE.Vector3(); TV = new THREE.Vector3(); RT = new THREE.Vector3();
}
const UP = { v: null }; let UPV;
function stepDie(d, rest) {
  d.vel.y += GRAV * DT; d.vel.multiplyScalar(0.9997); d.ang.multiplyScalar(0.9988);
  d.pos.addScaledVector(d.vel, DT);
  const om = d.ang.length();
  if (om > 1e-6) { AX.copy(d.ang).divideScalar(om); TQ.setFromAxisAngle(AX, om * DT); d.quat.premultiply(TQ).normalize(); }
  let pen = 0;
  for (let ci = 0; ci < 8; ci++) {
    RC.copy(CORNERS[ci]).applyQuaternion(d.quat);
    const cy = d.pos.y + RC.y;
    if (cy < 0) {
      if (-cy > pen) pen = -cy;
      VC.copy(d.vel).add(new THREE.Vector3().crossVectors(d.ang, RC));
      if (VC.y < 0) {
        RX.crossVectors(RC, UPV);
        const j = -(1 + rest) * VC.y / (1 + (6 / (DIE * DIE)) * RX.lengthSq());
        d.vel.y += j;
        IM.crossVectors(RC, UPV).multiplyScalar(j * (6 / (DIE * DIE)));
        d.ang.add(IM);
      }
    }
  }
  if (pen > 0.001) d.pos.y += pen * 0.85;
  const rxz = Math.hypot(d.pos.x, d.pos.z);
  if (rxz > WALL) {
    const nx = -d.pos.x / rxz, nz = -d.pos.z / rxz;
    d.pos.x = d.pos.x / rxz * WALL; d.pos.z = d.pos.z / rxz * WALL;
    const vn = d.vel.x * nx + d.vel.z * nz;
    if (vn < 0) { d.vel.x -= 1.4 * vn * nx; d.vel.z -= 1.4 * vn * nz; d.ang.multiplyScalar(0.88); }
  }
  void _rc;
}
function collide(a, b) {
  const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y, dz = b.pos.z - a.pos.z;
  const d2 = dx * dx + dy * dy + dz * dz, md = DIE * 1.05;
  if (d2 < md * md && d2 > 1e-6) {
    const dist = Math.sqrt(d2), nx = dx / dist, ny = dy / dist, nz = dz / dist, p = (md - dist) * 0.5;
    a.pos.x -= nx * p; a.pos.y -= ny * p; a.pos.z -= nz * p;
    b.pos.x += nx * p; b.pos.y += ny * p; b.pos.z += nz * p;
    const vn = (b.vel.x - a.vel.x) * nx + (b.vel.y - a.vel.y) * ny + (b.vel.z - a.vel.z) * nz;
    if (vn < 0) {
      const j = -(1.42) * vn / 2;
      a.vel.x -= j * nx; a.vel.y -= j * ny; a.vel.z -= j * nz;
      b.vel.x += j * nx; b.vel.y += j * ny; b.vel.z += j * nz;
    }
  }
}

/* ================= roll driver (cosmetic; server decides faces) ================= */
let phase3d = 'idle', pT0 = 0, acc = 0, lastF = 0, arrF = [], arrT = [], arrQF = [], arrQT = [], camShakeN = 0, overTrig = false;
function beginRoll() {
  phase3d = 'rattle'; pT0 = performance.now(); acc = 0; lastF = performance.now();
  camShakeN = 0.35; overTrig = false; setCam('idle', 0.4);
  bowlGroup.visible = true; bowlGroup.position.set(BOWL_HOME.x, BOWL_HOME.y, BOWL_HOME.z); bowlGroup.rotation.set(0, 0, 0);
  dice.forEach((d, i) => {
    const a = (i / 6) * Math.PI * 2;
    d.pos.set(BOWL_HOME.x + Math.cos(a) * 0.4, BOWL_HOME.y + 0.02, BOWL_HOME.z + Math.sin(a) * 0.4);
    d.quat.set(rfloat() - 0.5, rfloat() - 0.5, rfloat() - 0.5, rfloat() - 0.5).normalize();
    d.vel.set(0, 0, 0); d.ang.set(0, 0, 0); d.slow = 0;
    d.mesh.visible = true;
  });
  Sound.shuffle(); later(() => Sound.dice(), 1800);
}
function launch() {
  dice.forEach((d) => {
    d.pos.set(BOWL_HOME.x + rrange(-0.5, 0.5), BOWL_HOME.y + rrange(-0.3, 0.3), BOWL_HOME.z + rrange(-0.5, 0.5));
    d.vel.set(rrange(-4.5, 4.5), rrange(-4, -1), rrange(-4.5, 4.5));
    d.ang.set(rrange(-45, 45), rrange(-45, 45), rrange(-45, 45));
    d.slow = 0;
  });
}
function settleTo(faces) {
  phase3d = 'arrange'; pT0 = performance.now();
  const gap = DIE * 1.9, cx = 0, cz = 0.05;
  arrF = []; arrT = []; arrQF = []; arrQT = [];
  dice.forEach((d, i) => {
    d.mesh.visible = true;
    arrF.push(d.pos.clone()); arrQF.push(d.quat.clone());
    arrT.push(new THREE.Vector3(cx - gap + (i % 3) * gap, HALF, cz - gap / 2 + Math.floor(i / 3) * gap));
    const spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rfloat() * Math.PI * 2);
    arrQT.push(spin.multiply(FACE_UP_Q[faces[i]].clone()));
  });
  setCam('result', 0.9);
  later(() => Sound.dice(), 400);
}
// between hands the bowl rests on the felt and the dice wait beside it
function restTable() {
  phase3d = 'idle'; camShakeN = 0;
  bowlGroup.visible = true;
  bowlGroup.position.set(-0.3, 0.42, -0.5);
  bowlGroup.rotation.set(0, 0, 0);
  const spots = [[1.6, -1.6, 0.3], [2.5, -1.2, 1.1], [1.6, -0.6, 2.4], [2.5, -0.2, 0.7], [1.7, 0.4, 3.6], [2.6, 0.8, 1.9]];
  dice.forEach((d, i) => {
    const s = spots[i];
    d.pos.set(s[0], HALF, s[1]);
    d.quat.copy(UPV ? new THREE.Quaternion().setFromAxisAngle(UPV, s[2]) : d.quat);
    d.vel.set(0, 0, 0); d.ang.set(0, 0, 0); d.slow = 0;
    d.mesh.position.copy(d.pos); d.mesh.quaternion.copy(d.quat); d.mesh.visible = true;
  });
  setCam('idle', 0.7);
}
function stepRoll(now) {
  if (phase3d === 'idle') return;
  const t = (now - pT0) / 1000;
  let fdt = (now - lastF) / 1000; lastF = now;
  if (fdt > 0.06) fdt = 0.06;
  if (phase3d === 'rattle') {
    bowlGroup.position.set(BOWL_HOME.x + Math.sin(t * 26) * 0.16, BOWL_HOME.y + Math.sin(t * 34) * 0.07, BOWL_HOME.z + Math.cos(t * 22) * 0.16);
    bowlGroup.rotation.set(Math.cos(t * 18) * 0.14, Math.sin(t * 12) * 0.22, Math.sin(t * 20) * 0.16);
    dice.forEach((d, i) => {
      const a = t * 9 + i * 1.3, r = 0.28 + Math.sin(t * 7 + i) * 0.18;
      d.pos.set(bowlGroup.position.x + Math.cos(a) * r, bowlGroup.position.y + 0.02 + Math.sin(t * 12 + i) * 0.1, bowlGroup.position.z + Math.sin(a) * r);
      d.quat.setFromAxisAngle(new THREE.Vector3(Math.sin(t * 5 + i), Math.cos(t * 4 + i), Math.sin(t * 6 + i)).normalize(), t * 11 + i);
      d.mesh.position.copy(d.pos); d.mesh.quaternion.copy(d.quat);
    });
    if (t >= RATTLE) { phase3d = 'throw'; pT0 = now; launch(); }
    return;
  }
  if (phase3d === 'throw') {
    const k = t / THROW;
    bowlGroup.position.set(BOWL_HOME.x + k * k * 7, BOWL_HOME.y + k * 4, BOWL_HOME.z - k * k * 4);
    bowlGroup.rotation.x += fdt * 6; bowlGroup.rotation.y += fdt * 4; bowlGroup.rotation.z += fdt * 5;
    phys(fdt);
    if (t >= THROW) { bowlGroup.visible = false; phase3d = 'phys'; pT0 = now; lastF = now; }
    return;
  }
  if (phase3d === 'phys') {
    if (!overTrig) { overTrig = true; setCam('overhead', 2.6); }
    if (t > 3.0) {                       // settle assist: stop the drift so the reveal never waits on physics
      dice.forEach((d) => { d.vel.multiplyScalar(0.9); d.ang.multiplyScalar(0.88); });
    }
    phys(fdt);
    return;
  }
  if (phase3d === 'arrange') {
    const k = Math.min(1, t / ARR_DUR), e = easeIO(k);
    dice.forEach((d, i) => {
      d.pos.lerpVectors(arrF[i], arrT[i], e);
      d.pos.y = HALF + 0.28 * Math.sin(e * Math.PI);
      d.quat.slerpQuaternions(arrQF[i], arrQT[i], e);
      d.mesh.position.copy(d.pos); d.mesh.quaternion.copy(d.quat);
    });
    if (k >= 1) { phase3d = 'done'; dice.forEach((d, i) => { d.pos.copy(arrT[i]); d.quat.copy(arrQT[i]); d.mesh.position.copy(d.pos); d.mesh.quaternion.copy(d.quat); }); }
  }
}
function phys(fdt) {
  acc += fdt; let n = 0;
  while (acc >= DT && n < 8) {
    dice.forEach((d) => stepDie(d, 0.45));
    for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) collide(dice[i], dice[j]);
    acc -= DT; n++;
  }
  if (n >= 8) acc = 0;
  dice.forEach((d) => { d.mesh.position.copy(d.pos); d.mesh.quaternion.copy(d.quat); });
}

/* ================= DOM ================= */
function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
function buildDOM() {
  const r = el('div', 'lgfs');
  r.appendChild(el('canvas', null)).id = 'lgScene';
  const canvas = r.firstChild; canvas.id = 'lgScene';
  r.appendChild(el('div', 'vig'));
  const top = el('div', 'top');
  top.innerHTML = `<div class="brand">Langur Burja</div><div class="pill">Round <b id="lgRound">1</b></div><div class="sp"></div>`;
  const khBtn = el('button', 'gh', 'Khata'); khBtn.onclick = () => { Sound.tap(); openKhata(); };
  const rlBtn = el('button', 'gh', 'Rules'); rlBtn.onclick = () => { Sound.tap(); openRules(gameInfo('langur')); };
  const muBtn = el('button', 'gh', Sound.muted ? 'Muted' : 'Sound'); muBtn.onclick = () => { Sound.setMuted(!Sound.muted); muBtn.textContent = Sound.muted ? 'Muted' : 'Sound'; Sound.tap(); };
  const lvBtn = el('button', 'gh', 'Leave'); lvBtn.onclick = () => { if (confirm('Leave the table? A bot takes your seat.')) hooks.onLeave(); };
  top.append(khBtn, rlBtn, muBtn, lvBtn);
  r.appendChild(top);
  els.rail = el('div', 'rail'); r.appendChild(els.rail);
  els.rs = el('div', 'rs'); els.rs.style.display = 'none'; r.appendChild(els.rs);
  const dock = el('div', 'dock');
  els.turn = el('div', 'turn'); dock.appendChild(els.turn);
  const bw = el('div', 'bw');
  els.betbar = el('div', 'bb'); bw.appendChild(els.betbar);
  els.board = el('div', 'bd'); bw.appendChild(els.board);
  const db = el('div', 'db');
  els.sitBtn = el('button', 'btn ghost', 'Sit out');
  els.sitBtn.onclick = () => { Sound.tap(); if (send({ t: 'act', a: { t: 'sit' } })) toast('You are sitting out this round.'); };
  els.undoBtn = el('button', 'btn ghost', 'Undo bet');
  els.undoBtn.onclick = () => {
    Sound.tap();
    if (send({ t: 'act', a: { t: 'undo' } })) toast('Bet cleared. Pick again before the clock runs out.');
  };
  db.appendChild(els.sitBtn); db.appendChild(els.undoBtn); db.appendChild(el('div', 'fl'));
  els.status = el('div', 'pill', ''); db.appendChild(els.status);
  bw.appendChild(db); dock.appendChild(bw);
  r.appendChild(dock);
  return { root: r, canvas };
}

function renderRail(v) {
  els.rail.innerHTML = '';
  const mySeat = lastMsg ? lastMsg.seat : -2;
  for (let i = 0; i < v.n; i++) {
    const b = v.bets[i], nm = seatName(i), kh = seatKhata(i);
    const done = v.phase === 'bet' && !!b;
    const d = el('div', 'pc' + (i === mySeat ? ' me' : '') + (done ? ' done' : '') + (b && b.out ? ' out' : ''));
    let badge = '';
    if (b && !b.out && b.sym != null && (v.phase !== 'bet' || i === mySeat)) badge = `<div class="pm">${esc(SYMBOLS[b.sym].name)} · ₹${b.stake}</div>`;
    else if (b && b.out) badge = `<div class="pm">sitting out</div>`;
    else if (b) badge = `<div class="pm">bet placed</div>`;
    d.innerHTML = `<div class="av" style="background:${AVC[i % 8]}">${esc(initials(nm))}</div><div><div class="pn">${esc(nm)}${i === mySeat ? ' (you)' : ''}</div><div class="pm">khata ${kh >= 0 ? '+' : ''}${kh}</div>${badge}</div>`;
    els.rail.appendChild(d);
  }
}
function renderTurn(v) {
  if (v.phase === 'bet') {
    const mine = v.canBet, my = v.me;
    let head, sub;
    if (mine) { head = 'Your bet'; sub = 'pick a symbol'; }
    else if (my && my.out) { head = 'Sitting out'; sub = `${v.placed} of ${v.n} placed`; }
    else if (my) { head = 'Bet placed'; sub = `${SYMBOLS[my.sym].name} · ₹${my.stake}`; }
    else { head = 'Betting open'; sub = `${v.placed} of ${v.n} placed`; }
    els.turn.innerHTML = `<b>${esc(head)}</b><span>${esc(sub)}</span>`;
    if (mine && !lastCanBet) Sound.turn();
    lastCanBet = mine;
  } else if (v.phase === 'roll') els.turn.innerHTML = `<b>Rolling…</b><span>watch the bowl</span>`;
  else if (v.phase === 'reveal' || v.phase === 'over') els.turn.innerHTML = `<b>Round over</b><span>${v.verdict && v.verdict.noContest ? 'no winners, pot carries' : 'see results'}</span>`;
  else els.turn.innerHTML = `<b>Langur Burja</b>`;
  if (v.phase !== 'bet') lastCanBet = false;
}
function renderBoard(v) {
  els.betbar.innerHTML = '';
  els.betbar.appendChild(el('span', 'lb', 'Stake'));
  [5, 10, 15].forEach((s) => {
    const b = el('button', stakeSel === s ? 'on' : '', '₹' + s);
    b.onclick = () => { if (!v.canBet) return; stakeSel = s; Sound.tap(); renderBoard(v); };
    els.betbar.appendChild(b);
  });
  const mine = v.me;
  const placedN = v.placed || (v.bets || []).filter((b) => b).length;
  let info;
  if (v.phase !== 'bet') info = 'wait for the next hand';
  else if (mine && mine.out) info = `you sit out · ${placedN}/${v.n} placed`;
  else if (mine) info = `you: ${SYMBOLS[mine.sym].name} ₹${mine.stake} · ${placedN}/${v.n} placed`;
  else info = `${v.canBet ? 'tap a symbol' : 'waiting'} · ${placedN}/${v.n} placed`;
  els.betbar.appendChild(el('div', 'inf', info));
  els.board.innerHTML = '';
  const counts = [0, 0, 0, 0, 0, 0];
  (v.bets || []).forEach((b) => { if (b && !b.out && b.sym != null && (v.phase !== 'bet')) counts[b.sym]++; });
  const won = v.verdict && !v.verdict.noContest ? new Set(v.verdict.winners.map((seat) => v.bets[seat] && v.bets[seat].sym)) : new Set();
  SYMBOLS.forEach((s, i) => {
    const t = el('button', 'sym' + (v.canBet ? '' : ' dis') + (won.has(i) ? ' won' : ''));
    t.innerHTML = `<img src="${faceURL[i]}" alt="${s.name}" draggable="false"><small>${s.name}</small><em>${s.sub}</em>${counts[i] ? `<span class="n">${counts[i]}</span>` : ''}`;
    t.onclick = () => {
      if (!v.canBet) return;
      Sound.chip();
      if (send({ t: 'act', a: { t: 'bet', sym: i, stake: stakeSel } })) {
        toast(`Bet placed: ₹${stakeSel} on ${SYMBOLS[i].name}. Tap Undo bet to change it.`);
      }
    };
    els.board.appendChild(t);
  });
  els.sitBtn.style.display = v.canSit ? '' : 'none';
  els.sitBtn.disabled = !v.canSit;
  const canUndo = v.phase === 'bet' && !!mine;
  els.undoBtn.style.display = canUndo ? '' : 'none';
  els.undoBtn.disabled = !canUndo;
  if (canUndo) els.undoBtn.textContent = mine.out ? 'Undo sit out' : 'Undo bet';
  els.status.innerHTML = `Pot <b>₹${v.pot}</b>${v.carry ? ` (carry ₹${v.carry})` : ''}`;
  if (v.phase === 'bet' && (stakeSel == null || ![5, 10, 15].includes(stakeSel))) stakeSel = v.unit;
}
function renderResult(msg, v) {
  if (!msg.result || !v.faces) { els.rs.style.display = 'none'; return; }
  els.rs.style.display = '';
  const rows = msg.result.deltas.map((d, i) => ({ i, d })).sort((a, b) => b.d - a.d).map(({ i, d }) => {
    const b = v.bets[i];
    const sub = !b || b.out ? 'sat out' : `${b.sym != null ? SYMBOLS[b.sym].name : ''} ×${v.counts ? v.counts[b.sym] : ''}`;
    const cls = d > 0 ? 'w' : d < 0 ? 'l' : 'f';
    return `<div class="rw"><span>${esc(seatName(i))} <small style="color:#8296ae">· ${esc(sub)}</small></span><span class="${cls}">${d > 0 ? '+' : ''}${d}</span></div>`;
  }).join('');
  els.rs.innerHTML = `<h4>Round ${msg.hand}</h4><div class="dc">${v.faces.map((f) => `<img src="${faceURL[f]}" alt="">`).join('')}</div>${rows}` +
    (isHost() ? `<button class="btn" id="lgNext">Deal now</button>` : `<div style="font-size:11px;color:#8b9bb4;text-align:center">next hand starting…</div>`);
  const nx = document.getElementById('lgNext');
  if (nx) nx.onclick = () => { Sound.tap(); if (send({ t: 'next' })) toast('Dealing the next hand…'); };
}

/* ================= lifecycle ================= */
function onPhase(v) {
  if (v.phase === 'bet') {
    if (lastPhase !== 'bet') { restTable(); els.rs.style.display = 'none'; }
    if (v.unit && ![5, 10, 15].includes(stakeSel)) stakeSel = v.unit;
  } else if (v.phase === 'roll') {
    if (lastPhase !== 'roll') beginRoll();
  } else if ((v.phase === 'reveal' || v.phase === 'over') && v.faces) {
    if (lastPhase !== 'reveal' && lastPhase !== 'over') settleTo(v.faces);
    else if (phase3d === 'phys') settleTo(v.faces);
  }
  if (v.phase !== lastPhase && (v.phase === 'reveal' || v.phase === 'over') && lastMsg && lastMsg.result) {
    const md = lastMsg.seat >= 0 ? lastMsg.result.deltas[lastMsg.seat] : 0;
    if (md > 0) { Sound.win(); } else if (md < 0) Sound.lose();
  }
  lastPhase = v.phase;
}
let frames = 0;
function loop(now) {
  if (!mounted) return;
  raf = requestAnimationFrame(loop);
  if (frames++ < 5) fit();   // layout settles after mount; re-fit early frames
  if (camTrans) {
    const k = Math.min(1, (now - camTrans.t0) / camTrans.dur), e = easeIO(k);
    camPos.lerpVectors(camTrans.fp, camTrans.tp, e); camLook.lerpVectors(camTrans.fl, camTrans.tl, e);
    if (k >= 1) camTrans = null;
  }
  parK += (parT - parK) * 0.05;
  camera.position.set(camPos.x + parallax.x * 0.55 * parK, camPos.y - parallax.y * 0.28 * parK, camPos.z);
  if (camShakeN > 0.005) {
    camera.position.x += (rfloat() - 0.5) * camShakeN * 0.1;
    camera.position.y += (rfloat() - 0.5) * camShakeN * 0.1;
    camShakeN *= 0.92;
  }
  camera.lookAt(camLook);
  stepRoll(now);
  composer.render();
}
function fit() {
  if (!renderer || !root) return;
  const w = root.clientWidth || innerWidth, h = root.clientHeight || innerHeight;
  renderer.setSize(w, h, false); composer.setSize(w, h);
  const a = w / h;
  camera.aspect = a;
  // keep the table inside frame on narrow (phone) and ultrawide windows
  const design = 1.55, base = 34;
  camera.fov = a >= design ? base : Math.min(58, base * Math.pow(design / Math.max(a, 0.35), 0.8));
  camera.updateProjectionMatrix();
}

export function mountLangur(container, h) {
  hooks = h;
  if (!cssOn) { const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); cssOn = true; }
  const { root: r, canvas } = buildDOM();
  root = r; container.replaceChildren(root);
  mounted = true; lastHand = -1; lastPhase = ''; timers = []; frames = 0;
  vecs(); UPV = new THREE.Vector3(0, 1, 0);
  try {
    initScene(canvas);
  } catch (e) {
    canvas.outerHTML = '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#8b9bb4">3D unavailable, betting still works below</div>';
    renderer = null;
  }
  ro = new ResizeObserver(fit); ro.observe(root);
  addEventListener('resize', fit);
  root._fit = fit;
  fit();
  later(fit, 400);
  const par = (e) => { parallax.x = (e.clientX / innerWidth) * 2 - 1; parallax.y = (e.clientY / innerHeight) * 2 - 1; };
  addEventListener('pointermove', par, { passive: true });
  root._par = par;
  clockInt = setInterval(() => {
    if (!mounted || !lastMsg || !els.turn) return;
    const v = lastMsg.v, dl = lastMsg.deadline;
    const sp = els.turn.querySelector('span');
    if (!sp) return;
    if (!dl || !v || v.phase !== 'bet') { if (sp.dataset.orig) sp.textContent = sp.dataset.orig; return; }
    if (!sp.dataset.orig) sp.dataset.orig = sp.textContent;
    const s = Math.max(0, Math.ceil((dl - Date.now()) / 1000));
    sp.textContent = s > 0 ? `${sp.dataset.orig} · ${s}s` : sp.dataset.orig + ' · …';
  }, 500);
  raf = requestAnimationFrame(loop);
}
export function updateLangur(msg) {
  if (!mounted) return;
  if (msg.hand !== lastHand) { lastHand = msg.hand; lastPhase = ''; timers.forEach(clearTimeout); timers = []; }
  lastMsg = msg;
  const v = msg.v;
  const rn = document.getElementById('lgRound'); if (rn) rn.textContent = msg.hand;
  renderRail(v); renderTurn(v); renderBoard(v); renderResult(msg, v);
  onPhase(v);
}
export function unmountLangur() {
  mounted = false; lastMsg = null;
  cancelAnimationFrame(raf);
  if (ro) ro.disconnect();
  clearInterval(clockInt);
  timers.forEach(clearTimeout); timers = [];
  if (root && root._par) removeEventListener('pointermove', root._par);
  if (root && root._fit) removeEventListener('resize', root._fit);
  try { renderer && renderer.dispose(); } catch (_) {}
  renderer = scene = camera = composer = bowlGroup = null; dice = []; faceTex = [];
  root = null; els = {};
}
