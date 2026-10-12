// One WebSocket, token-based identity, auto-reconnect, dead-socket detection.
const listeners = {};
export const on = (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); };
const emit = (t, m) => (listeners[t] || []).forEach((fn) => { try { fn(m); } catch (e) { console.error(e); } });

export const net = { ws: null, open: false, token: null, tries: 0, timer: null, pingTimer: null, lastPong: 0, wantCode: null, name: '' };
try { net.token = localStorage.getItem('lbf_token') || null; net.name = localStorage.getItem('lbf_name') || ''; } catch (_) {}

const url = () => (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/';

export function connect() {
  if (net.ws && (net.ws.readyState === 0 || net.ws.readyState === 1)) return;
  clearTimeout(net.timer);
  let ws; try { ws = new WebSocket(url()); } catch (e) { return schedule(); }
  net.ws = ws;
  ws.onopen = () => {
    net.open = true; net.tries = 0; net.lastPong = Date.now();
    const hello = { t: 'hello', token: net.token || undefined, name: net.name || undefined };
    if (net.wantCode) hello.code = net.wantCode;
    ws.send(JSON.stringify(hello));
    clearInterval(net.pingTimer);
    net.pingTimer = setInterval(() => {
      if (ws.readyState !== 1) return;
      if (Date.now() - net.lastPong > 22000) { try { ws.close(); } catch (_) {} return; }   // half-open socket
      ws.send('{"t":"ping"}');
    }, 8000);
    emit('open');
  };
  ws.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
    net.lastPong = Date.now();
    if (m.t === 'hi' && m.token) { net.token = m.token; try { localStorage.setItem('lbf_token', m.token); } catch (_) {} }
    if (m.t === 'pong') return;
    emit(m.t, m); emit('*', m);
  };
  ws.onclose = (ev) => {
    if (net.ws !== ws) return;
    net.open = false; clearInterval(net.pingTimer); emit('close', ev);
    if (ev && (ev.code === 4400 || ev.code === 4001)) return;      // kicked / replaced by another tab: do not fight for the seat
    schedule();
  };
  ws.onerror = () => {};
}
function schedule() { clearTimeout(net.timer); net.tries++; net.timer = setTimeout(connect, Math.min(4000, 250 * Math.pow(1.6, net.tries))); }
export function send(m) { if (net.ws && net.ws.readyState === 1) { net.ws.send(JSON.stringify(m)); return true; } return false; }
export function setName(n) { net.name = n; try { localStorage.setItem('lbf_name', n); } catch (_) {} }
export function forget() { net.token = null; try { localStorage.removeItem('lbf_token'); } catch (_) {} }

// Phones freeze background tabs: reconnect the moment we are visible again.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { if (!net.open || (net.ws && net.ws.readyState > 1)) { net.tries = 0; connect(); } else send({ t: 'ping' }); } });
addEventListener('online', () => { net.tries = 0; connect(); });
