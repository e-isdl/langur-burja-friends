import { $, h } from './dom.js';
import { S, gameInfo } from './state.js';
import { net, on, connect, send } from './net.js';
import { renderHome } from './home.js';
import { renderLobby } from './lobby.js';
import { mountTable, updateTable, unmountTable, tableMounted, registerGame, showBubble } from './table.js';
import { mountLangur, updateLangur, unmountLangur } from './langur-screen.js';
import { toast, sheet } from './ui.js';

const app = $('#app');
let screen = '';
const m = location.pathname.match(/^\/r\/([A-Za-z0-9]{4,8})/);
if (m) net.wantCode = m[1].toUpperCase();

function leaveLangur() {
  try { send({ t: 'leave' }); } catch (_) {}
  try { unmountLangur(); } catch (_) {}
  S.room = null; S.game = null; screen = 'home';
  renderHome(app);
}
function render() {
  const R = S.room;
  if (!R) {
    if (screen === 'langur') { try { unmountLangur(); } catch (_) {} }
    else if (screen !== 'home') unmountTable();
    screen = 'home'; renderHome(app); return;
  }
  if (R.phase === 'game' && S.game) {
    if (S.game.g === 'langur') {
      if (screen === 'table') unmountTable();
      if (screen !== 'langur') { screen = 'langur'; mountLangur(app, { onLeave: leaveLangur }); }
      updateLangur(S.game); return;
    }
    if (screen === 'langur') { try { unmountLangur(); } catch (_) {} }
    if (screen !== 'table') { screen = 'table'; mountTable(app); }
    updateTable(S.game); return;
  }
  if (screen === 'table') unmountTable();
  if (screen === 'langur') { try { unmountLangur(); } catch (_) {} }
  screen = 'lobby'; renderLobby(app);
}

on('hi', (msg) => {
  S.pid = msg.pid; S.code = msg.code; S.needName = msg.needName || null;
  if (!msg.pid) { S.room = null; S.game = null; render(); }
});
on('room', (msg) => {
  S.room = msg.room; S.code = msg.room.code; net.wantCode = null;
  if (location.pathname !== '/') history.replaceState(null, '', '/');
  if (S.room.phase === 'lobby') S.game = null;
  render();
});
on('state', (msg) => {
  S.game = msg;
  if (S.room && S.room.phase === 'game') {
    if (msg.g === 'langur') { if (screen !== 'langur') render(); else updateLangur(msg); }
    else if (screen !== 'table') render(); else updateTable(msg);
  }
});
on('lobby', () => { S.game = null; });
on('react', (msg) => showBubble(msg.pid, msg.e));
on('toast', (msg) => toast(msg.message));
on('error', (msg) => {
  toast(msg.message, true);
  if (msg.code === 'noroom') { net.wantCode = null; S.needName = null; if (!S.room) render(); }
});
on('kicked', () => { S.room = null; S.game = null; render(); toast('You were removed from the table', true); });

// connection banner
let bannerT = null, banner = null;
on('close', (ev) => {
  if (ev && ev.code === 4001) {
    S.room = null; S.game = null; render();
    sheet('Open in another tab', h('div', null, h('p', { style: { marginBottom: '14px' } }, 'This table was opened somewhere else, so this tab stepped aside.'), h('button', { class: 'btn primary wide', onclick: () => location.reload() }, 'Use this tab instead')));
    return;
  }
  clearTimeout(bannerT);
  bannerT = setTimeout(() => { if (!banner) { banner = h('div', { class: 'banner' }, h('i'), 'Reconnecting'); document.body.append(banner); } }, 1200);
});
on('open', () => { clearTimeout(bannerT); if (banner) { banner.remove(); banner = null; } });

// screen wake lock while a game is on: phones that sleep drop the socket
let lock = null;
async function wake() { try { if (navigator.wakeLock && S.room && S.room.phase === 'game' && document.visibilityState === 'visible' && !lock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } } catch (_) {} }
document.addEventListener('visibilitychange', wake);
on('state', wake);

async function boot() {
  try { S.catalog = await (await fetch('/games')).json(); } catch (_) { S.catalog = []; }
  await Promise.all(S.catalog.filter((g) => g.id !== 'langur').map((g) => import('/js/games/' + g.id + '.js').then((mod) => registerGame(g.id, mod.default)).catch((e) => console.warn('game ui missing', g.id, e))));
  render(); connect();
}
boot();
window.__lbf = { S, net, send };
