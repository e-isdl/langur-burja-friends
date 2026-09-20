/* One-click runner: `node live.js` or `npm run live`
 * Starts server.js (port 3000) + cloudflared tunnel, prints the public URL,
 * opens the lobby in your browser. Ctrl+C stops both. */
const { spawn } = require('child_process');
const http = require('http');

const PORT = process.env.PORT || 3000;
let server, tunnel, opened = false;

function waitForServer(tries = 40) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      n++;
      http.get(`http://localhost:${PORT}/health`, (res) => {
        if (res.statusCode === 200) return resolve();
        if (n >= tries) return reject(new Error('server did not start'));
        setTimeout(tick, 500);
      }).on('error', () => {
        if (n >= tries) return reject(new Error('server did not start'));
        setTimeout(tick, 500);
      });
    };
    tick();
  });
}

function openBrowser(url) {
  if (opened) return;
  opened = true;
  const cmd = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try { spawn(cmd, args, { stdio: 'ignore', detached: true }).unref(); } catch (_) {}
}

process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());

console.log('🎲 Starting Langur Burja & Friends…');
// Reuse an already-running server (e.g. double-clicked twice) instead of
// crashing with EADDRINUSE. Only spawn our own if nothing answers /health.
let ownServer = false;
async function ensureServer() {
  try {
    await waitForServer(4); // ~2s: is one already up?
    console.log('ℹ️  Server already running — reusing it (close other game windows to avoid this).');
    return;
  } catch (_) {}
  ownServer = true;
  server = spawn(process.execPath, ['server.js'], { cwd: __dirname, stdio: 'inherit' });
  server.on('error', (e) => console.error('server spawn error:', e.message));
  await waitForServer(40);
}
function shutdown() {
  try { if (ownServer && server) server.kill(); } catch (_) {}
  try { tunnel && tunnel.kill(); } catch (_) {}
  process.exit(0);
}

ensureServer().then(() => {
  console.log(`✅ Server up: http://localhost:${PORT}`);
  openBrowser(`http://localhost:${PORT}`);
  console.log('🌐 Starting Cloudflare tunnel (getting public link)…');
  // Windows: npm-installed cloudflared is cloudflared.cmd — needs shell:true
  const cfCmd = process.platform === 'win32' ? 'cloudflared.cmd' : 'cloudflared';
  tunnel = spawn(cfCmd, ['tunnel', '--url', `http://localhost:${PORT}`], { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
  let printed = false;
  const scan = (buf) => {
    const text = buf.toString();
    process.stderr.write(text);
    const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (m && !printed) {
      printed = true;
      console.log('\n═══════════════════════════════════════════');
      console.log('📲 SEND THIS TO FRIENDS:');
      console.log('   ' + m[0]);
      console.log('   (they open it, enter name + your room code)');
      console.log('═══════════════════════════════════════════\n');
      openBrowser(m[0]);
    }
  };
  tunnel.stdout.on('data', scan);
  tunnel.stderr.on('data', scan);
  tunnel.on('error', (e) => {
    console.error('\n❌ cloudflared failed to start:', e.message);
    console.error('   Install: https://github.com/cloudflare/cloudflared/releases');
    console.error('   The game still works locally at http://localhost:' + PORT);
  });
  tunnel.on('exit', (code) => {
    if (!printed) console.log(`\n(tunnel exited code=${code} — local play still at http://localhost:${PORT})`);
  });
}).catch((e) => {
  console.error('❌ ' + e.message);
  shutdown();
});
