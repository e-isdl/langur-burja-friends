'use strict';
// End-to-end visual test for the Langur Burja fullscreen table.
// Drives the real UI in headless Chrome: home -> lobby -> deal -> 20s shared
// betting clock -> bet / undo / re-bet -> roll -> reveal -> result -> leave.
// The second player (page 2) sits on their hands until the UI shots are done,
// so the roll cannot start early and the betting screen is safe to capture.
// Usage: node test/langur-shots.js [outDir]   (W/H env sets the viewport)
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function loadPlaywright() {
  const g = execSync('npm root -g').toString().trim();
  for (const m of ['/playwright-core', '/playwright']) {
    try { return require(g + m); } catch (_) {}
  }
  return require('playwright-core');
}
function chromePath() {
  const c = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  return c.find((p) => fs.existsSync(p)) || undefined;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = process.argv[2] || path.join(require('os').tmpdir(), 'langur-shots');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const { chromium } = loadPlaywright();
  const { server } = require('../server/index');
  await new Promise((r) => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port;

  const browser = await chromium.launch({
    executablePath: chromePath(),
    headless: true,
    args: ['--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars'],
  });
  const VW = +(process.env.W || 1440), VH = +(process.env.H || 900);
  const blocked = [];
  const errors = [];
  const wire = async (page) => {
    // the game must be fully self-hosted: block every request that leaves localhost
    await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|\[::1\])/, (r) => { blocked.push(r.request().url()); r.abort(); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  };
  const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1, isMobile: VW < 700, hasTouch: VW < 700 });
  await wire(page);

  const shot = async (name) => {
    await page.evaluate((n) => {
      const d = document.createElement('div');
      d.id = '__shot'; d.textContent = n;
      d.style.cssText = 'position:fixed;top:150px;right:12px;z-index:99999;color:#39ff6a;font:bold 14px monospace;background:#000c;padding:5px 9px;border-radius:6px';
      document.body.appendChild(d);
    }, name);
    const ph = await phase();
    await page.screenshot({ path: path.join(OUT, name + '.png') });
    await page.evaluate(() => { const d = document.getElementById('__shot'); if (d) d.remove(); });
    console.log(Date.now(), 'shot', name, 'phase=' + ph);
  };
  const phase = () => page.evaluate(() => (window.__lbf && window.__lbf.S.game && window.__lbf.S.game.v) ? window.__lbf.S.game.v.phase : null);
  const waitPhase = async (p, ms = 45000) => {
    const t0 = Date.now();
    for (;;) {
      const cur = await phase();
      if (cur === p) return cur;
      if (Date.now() - t0 > ms) throw new Error('timeout waiting phase ' + p + ' (now ' + cur + ')');
      await sleep(200);
    }
  };
  const waitHand = async (n, ms = 20000) => {
    const t0 = Date.now();
    for (;;) {
      const h = await page.evaluate(() => (window.__lbf.S.game ? window.__lbf.S.game.hand : 0));
      if (h === n) return h;
      if (Date.now() - t0 > ms) throw new Error('hand ' + n + ' never started (at ' + h + ')');
      await sleep(150);
    }
  };
  const canBetNow = () => page.evaluate(() => !!(window.__lbf.S.game && window.__lbf.S.game.v && window.__lbf.S.game.v.canBet));
  const meBet = () => page.evaluate(() => !!(window.__lbf.S.game && window.__lbf.S.game.v && window.__lbf.S.game.v.me));
  const toastText = () => page.evaluate(() => Array.from(document.querySelectorAll('.toasts .toast')).map((t) => t.textContent).join(' | '));
  const anyFail = [];
  const fail = (what) => { anyFail.push(what); console.log(Date.now(), 'UI CHECKS: FAIL ' + what); };
  const until = async (fn, want, n = 60) => { for (let i = 0; i < n; i++) { if ((await fn()) === want) return true; await sleep(60); } return false; };
  const checkResultUI = async () => {
    const ui = await page.evaluate(() => {
      const $ = (s) => document.querySelector(s);
      const rs = $('.lgfs .rs'), rail = $('.lgfs .rail'), cv = $('canvas#lgScene'), dock = $('.lgfs .dock');
      const rcs = rail && getComputedStyle(rail);
      const cbr = cv && cv.getBoundingClientRect(), dbr = dock && dock.getBoundingClientRect();
      return {
        resultShown: !!rs && rs.style.display !== 'none' && /Round/.test(rs.textContent),
        resultUnderRail: !!rs && rs.getBoundingClientRect().top >= (rail ? rail.getBoundingClientRect().bottom - 1 : 0),
        resultAboveDock: !!(rs && dock) && rs.getBoundingClientRect().bottom <= dock.getBoundingClientRect().top + 1,
        railRow: rcs && rcs.flexDirection === 'row',
        railPlainBg: rcs && (rcs.backgroundColor === 'rgba(0, 0, 0, 0)' || rcs.backgroundColor === 'transparent'),
        canvasFits: !!cv && Math.abs(cbr.width - innerWidth) < 2 && Math.abs(cbr.height - innerHeight) < 2,
        dockAboveCanvas: !!(cbr && dbr) && dbr.bottom <= innerHeight + 1,
        betBar: !!$('.lgfs .bd') && document.querySelectorAll('.lgfs .bd .sym').length === 6,
      };
    });
    const bad = Object.entries(ui).filter(([k, v]) => v === false);
    console.log('ui:', JSON.stringify(ui));
    console.log('UI CHECKS:', bad.length ? 'FAIL ' + bad.map(([k]) => k).join(',') : 'all pass');
    if (bad.length) anyFail.push(...bad.map(([k]) => k));
    const info = await page.evaluate(() => {
      const v = window.__lbf.S.game.v, r = window.__lbf.S.game.result;
      return { phase: v.phase, faces: v.faces, counts: v.counts, deltas: r && r.deltas, seat: window.__lbf.S.game.seat };
    });
    console.log('state:', JSON.stringify(info));
    if (!info.deltas) fail('no result on the final phase');
    else if (info.deltas.reduce((a, b) => a + b, 0) !== 0) fail('deltas not zero-sum');
  };

  await page.goto(base + '/');
  await page.waitForSelector('.home');
  await sleep(700);
  await shot('01-home');

  await page.fill('input[aria-label="Your name"]', 'Ishan');
  await page.click('text=Start a table');
  await page.waitForSelector('.lobby');
  const code = await page.evaluate(() => window.__lbf.S.room && window.__lbf.S.room.code);
  if (!code) fail('no room code');

  // second player joins and waits in the lobby
  const page2 = await browser.newPage({ viewport: { width: 900, height: 620 } });
  await wire(page2);
  await page2.goto(base + '/');
  await page2.waitForSelector('.home');
  await page2.fill('input[aria-label="Your name"]', 'Riya');
  await page2.fill('input[aria-label="Table code"]', code);
  await page2.click('.joinrow button');
  await page2.waitForSelector('.lobby');
  const seated2 = await page2.evaluate(() => window.__lbf.S.room && window.__lbf.S.room.players.length);
  if (seated2 !== 2) fail('second player not in the room (' + seated2 + ')');

  await page.click('[data-key="tile:langur"]');
  await sleep(400);
  await shot('02-lobby-langur');

  await page.click('[data-key=deal]');
  await page.waitForSelector('.lgfs');
  await page2.waitForSelector('.lgfs');

  // second player locks in straight away (in parallel with A's checks)
  const bBet = page2.click('.lgfs .bd .sym:nth-child(1)', { timeout: 8000 })
    .catch((e) => console.log('note: second player could not bet:', String(e.message).split('\n')[0]));

  // ---- hand 1: the shared 20s clock, then the roll sequence ----
  const cd = await page.evaluate(() => ({
    txt: (document.querySelector('.lgfs .turn span') || {}).textContent || '',
    head: (document.querySelector('.lgfs .turn b') || {}).textContent || '',
    deadline: window.__lbf.S.game.deadline,
    win: window.__lbf.S.game.deadline - Date.now(),
  }));
  console.log(Date.now(), 'shared clock:', JSON.stringify(cd));
  if (!/\d+s/.test(cd.txt)) fail('countdown text');
  if (!cd.deadline || cd.win < 8000 || cd.win > 21000) fail('countdown window (' + cd.win + 'ms)');
  if (!/Your bet/i.test(cd.head)) fail('bet prompt');

  if (!(await canBetNow())) fail('cannot bet straight away (turn queue back?)');
  await page.click('.lgfs .bd .sym:nth-child(4)', { force: true });        // Hukum
  if (!(await until(meBet, true))) fail('bet not registered');
  const t1 = await toastText();
  console.log(Date.now(), 'toast after bet:', t1);
  if (!/Bet placed/i.test(t1)) fail('bet toast');
  await bBet;
  await waitPhase('roll');
  await sleep(1400);
  await shot('05-langur-roll');
  await waitPhase('reveal', 30000);
  await sleep(300);
  await shot('06-langur-reveal');
  await waitPhase('over', 30000);
  await sleep(600);
  await shot('07-langur-result');
  await checkResultUI();

  // ---- hand 2: fresh clock, warm page: the betting UI itself ----
  const lgNext = await page.$('#lgNext');
  if (lgNext) await lgNext.click();                       // host skips the result wait
  else fail('no Deal now button on the result panel');
  await waitHand(2);

  if (!(await canBetNow())) fail('hand 2: cannot bet');
  await page.click('.lgfs .bd .sym:nth-child(4)', { force: true });        // Hukum
  if (!(await until(meBet, true))) fail('hand 2 bet not registered');

  // the placed-bet UI (fast asserts, before the slow screenshots)
  const placedUI = await page.evaluate(() => ({
    pill: (document.querySelector('.lgfs .turn b') || {}).textContent || '',
    info: (document.querySelector('.lgfs .bb .inf') || {}).textContent || '',
    undoShown: (() => { const b = document.querySelectorAll('.lgfs .db button')[1]; return !!b && b.style.display !== 'none' && !b.disabled; })(),
    railMine: !!document.querySelector('.lgfs .pc.me'),
  }));
  console.log(Date.now(), 'placed ui:', JSON.stringify(placedUI));
  if (!/Bet placed/i.test(placedUI.pill)) fail('placed pill');
  if (!/you: Hukum/.test(placedUI.info)) fail('placed info (' + placedUI.info + ')');
  if (!placedUI.undoShown) fail('undo button hidden after bet');
  if (!placedUI.railMine) fail('my seat chip missing');

  // undo the mistake, then bet for real: every assert first, screenshots last
  const undoBtn = '.lgfs .db button:nth-child(2)';
  await page.click(undoBtn, { force: true });
  if (!(await until(meBet, false))) fail('undo did not clear the bet');
  const t2 = await toastText();
  if (!/cleared/i.test(t2)) fail('undo toast');
  if (!(await canBetNow())) fail('cannot re-bet after undo');
  await shot('04-langur-undone');

  await page.click('.lgfs .bd .sym:nth-child(4)', { force: true });
  if (!(await until(meBet, true))) fail('re-bet failed');
  const undoBack = await page.$eval(undoBtn, (b) => b.style.display !== 'none' && !b.disabled).catch(() => false);
  if (!undoBack) fail('undo not offered again after re-bet');
  const budget = await page.evaluate(() => ({ left: window.__lbf.S.game.deadline - Date.now(), phase: window.__lbf.S.game.v.phase }));
  console.log('hand2 clock left after dance:', JSON.stringify(budget));
  if (budget.left < 1500 || budget.phase !== 'bet') fail('hand 2 ran out of clock');
  await shot('03-langur-bet');

  // back to lobby path: leave the table
  page.once('dialog', (d) => d.accept());
  await page.click('.lgfs .top button:nth-last-child(1)');
  await sleep(900);
  await shot('08-after-leave');
  const home = await page.$('.home');
  console.log('after leave -> home:', !!home);
  if (!home) fail('leave did not return home');

  console.log('errors:', errors.length ? errors : 'none');
  console.log('external requests blocked:', blocked.length ? blocked : 'none');
  if (anyFail.length) console.log('UI CHECKS: FAIL', anyFail.join(','));
  await browser.close();
  server.close();
  process.exit(errors.length || blocked.length || anyFail.length ? 2 : 0);
})().catch((e) => { console.error('LANGUR SHOTS FAIL', e); process.exit(1); });
