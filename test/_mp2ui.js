'use strict';
// Temp: two-browser friend flow. A creates a table, B joins via /r/CODE link,
// both land in the lobby, host adds a bot and deals, both reach the game.
const { launch } = require('./_pw');
const { server } = require('../server/index');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); };

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port;
  const browser = await launch();
  const errors = [];
  const watch = (page, tag) => {
    page.on('pageerror', (e) => errors.push(tag + ' pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(tag + ' console: ' + m.text()); });
  };

  // Friend A (host): new person, clean storage
  const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const A = await ctxA.newPage(); watch(A, 'A');
  await A.goto(base + '/');
  await A.waitForSelector('.home');
  await A.fill('input[aria-label="Your name"]', 'Ishan');
  await A.click('text=Start a table');
  await A.waitForSelector('.lobby');
  await sleep(400);
  const code = (await A.textContent('.codechip b')).trim().toUpperCase();
  assert(/^[A-Z0-9]{4,8}$/.test(code), 'host sees a room code, got ' + code);
  console.log('host code:', code);

  // Friend B: taps the shared link /r/CODE on their own phone
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const B = await ctxB.newPage(); watch(B, 'B');
  await B.goto(base + '/r/' + code);
  await B.waitForSelector('text=You are joining table');
  await B.fill('input[aria-label="Your name"]', 'Riya');
  await B.click('text=Take a seat');
  await B.waitForSelector('.lobby');
  await sleep(600);

  // both lobbies show both people
  for (const [pg, tag] of [[A, 'A'], [B, 'B']]) {
    const txt = await pg.evaluate(() => document.body.innerText);
    assert(txt.includes('Ishan'), tag + ' lobby shows Ishan');
    assert(txt.includes('Riya'), tag + ' lobby shows Riya');
  }
  console.log('both lobbies show both friends');

  // host adds a bot (2 humans only) and deals the default game
  await A.click('[data-key=addseat]');
  await sleep(400);
  await A.click('[data-key=deal]');
  await A.waitForSelector('.tbl', { timeout: 15000 });
  await B.waitForSelector('.tbl', { timeout: 15000 });
  console.log('both friends are at the game table');

  // friend B can act: click a primary action or a card if one is enabled
  await sleep(1500);
  const bActed = await B.evaluate(() => {
    const btn = [...document.querySelectorAll('.actions .btn.primary:not([disabled])')][0];
    if (btn) { btn.click(); return 'button:' + btn.textContent.trim().slice(0, 20); }
    return null;
  });
  console.log('friend B action:', bActed || 'nothing clickable yet (ok if not their turn)');

  assert(errors.length === 0, 'browser errors: ' + JSON.stringify(errors));
  console.log('MP2UI PASS, errors: none');
  await browser.close(); server.close(); process.exit(0);
})().catch((e) => { console.error('MP2UI FAIL', e); process.exit(1); });
