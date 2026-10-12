'use strict';
// Temp: prove internet multiplayer. In-process server + real cloudflared tunnel
// (spawned direct exe, piped stdio), then join a table THROUGH the public URL.
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 3100;
const CF = process.env.CF_EXE || path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'cloudflared', 'bin', 'cloudflared.exe');

function get(url) {
  return new Promise((resolve, reject) => {
    const req = (url.startsWith('https') ? require('https') : http).get(url, (res) => {
      let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('error', reject); req.setTimeout(20000, () => { req.destroy(); reject(new Error('get timeout')); });
  });
}

(async () => {
  const { server } = require('../server/index');
  await new Promise((r) => server.listen(PORT, r));
  console.log('local server up on', PORT);

  const cf = spawn(CF, ['tunnel', '--url', `http://localhost:${PORT}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  cf.on('error', (e) => console.error('cf spawn error', e.message));
  let url = null;
  const scan = (b) => { const m = b.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i); if (m && !url) { url = m[0]; console.log('public url:', url); } };
  cf.stdout.on('data', scan);
  cf.stderr.on('data', scan);
  const t0 = Date.now();
  while (!url && Date.now() - t0 < 90000) {
    if (cf.exitCode !== null) throw new Error('cloudflared exited early code=' + cf.exitCode);
    await sleep(1000);
  }
  if (!url) throw new Error('tunnel gave no URL in 90s');

  let h = null;
  const t2 = Date.now();
  while (Date.now() - t2 < 120000) {
    try { h = await get(url + '/health'); if (h.status === 200) break; } catch (e) { console.log('waiting for public DNS/edge...', e.message); }
    h = null; await sleep(4000);
  }
  if (!h) throw new Error('public health never came up');
  console.log('public /health:', h.status, h.body.slice(0, 120));

  const ws = new WebSocket(url.replace(/^http/, 'ws') + '/');
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  const msgs = [];
  ws.on('message', (raw) => { try { msgs.push(JSON.parse(raw.toString())); } catch (_) {} });
  ws.send(JSON.stringify({ t: 'hello' }));
  await sleep(1500);
  ws.send(JSON.stringify({ t: 'create', name: 'TunnelFriend' }));
  let code = null;
  const t1 = Date.now();
  while (!code && Date.now() - t1 < 20000) { const r = [...msgs].reverse().find((m) => m.t === 'room'); if (r) code = r.room.code; else await sleep(200); }
  if (!code) throw new Error('no room through tunnel');
  console.log('TUNNEL MP OK: created room', code, 'through public URL');
  ws.close();
  cf.kill(); server.close();
  await sleep(500);
  process.exit(0);
})().catch((e) => { console.error('TUNNEL FAIL:', e.message); process.exit(1); });
