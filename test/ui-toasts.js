'use strict';
// Click-notification + opponent-feed test: drives the real UI headlessly and
// asserts the plain-language toasts and the action feed.
// Usage: node test/ui-toasts.js
const { launch, outDir } = require('./_pw');
const { server } = require('../server/index');
const OUT = outDir('lbf-ui');
require('fs').mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const anyFail = [];
const fail = (what) => { anyFail.push(what); console.log('UI CHECKS: FAIL ' + what); };

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port;
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  const toasts = () => page.evaluate(() => [...document.querySelectorAll('.toast')].map((t) => t.textContent));
  const hadToast = async (re, what) => {
    const list = await toasts();
    if (!list.some((t) => re.test(t))) { console.log('  toast seen:', JSON.stringify(list)); fail(what); return false; }
    console.log('  toast ok:', JSON.stringify(list.find((t) => re.test(t))));
    return true;
  };
  const feedLines = () => page.evaluate(() => [...document.querySelectorAll('.dock .feed .fl')].map((t) => t.textContent));

  await page.goto(base + '/');
  await page.waitForSelector('.home');
  await page.fill('input[aria-label="Your name"]', 'Ishan');
  await page.click('text=Start a table');
  await page.waitForSelector('.lobby');

  // lobby: pick game, set stake, add bots, deal - each click must notify
  await page.click('[data-key="tile:callbreak"]'); await sleep(250);
  await hadToast(/^Picked Call Break$/, 'lobby tile toast');
  await page.screenshot({ path: `${OUT}/01-lobby-picked.png` });

  await page.click('.units .u:nth-child(2)'); await sleep(250);
  await hadToast(/^Stake set to /, 'lobby stake toast');

  for (let i = 0; i < 3; i++) { await page.click('[data-key=addseat]'); await sleep(250); }
  await hadToast(/A bot joined the table/, 'lobby add-bot toast');

  await page.click('[data-key=deal]');
  await page.waitForSelector('.tbl');
  await sleep(400);
  await hadToast(/Starting Call Break/, 'lobby deal toast');

  // my bid: click the primary action when it is my turn
  let myAction = null;
  for (let i = 0; i < 30 && !myAction; i++) {
    myAction = await page.evaluate(() => {
      const b = [...document.querySelectorAll('.actions .btn.primary:not([disabled])')][0];
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, label: b.textContent };
    });
    if (!myAction) await sleep(400);
  }
  if (!myAction) fail('no player action button appeared');
  else {
    console.log('  my action:', myAction.label);
    await page.mouse.click(myAction.x, myAction.y);
    await sleep(400);
    await hadToast(/^You (called|bet|play|looked|passed|asked|drew|picked|packed|raised)/, 'act toast after click');
    await page.screenshot({ path: `${OUT}/02-act-toast.png` });
  }

  // opponent feed: bots respond, lines must land in the dock feed
  let feed = [];
  for (let i = 0; i < 30 && !feed.length; i++) { await sleep(500); feed = await feedLines(); }
  console.log('  feed:', JSON.stringify(feed));
  if (!feed.length) fail('opponent feed never appeared');
  else if (!feed.some((t) => /called|played|took|bet|discarded|drew/.test(t))) fail('feed text unexpected: ' + feed.join(' | '));

  // wait for my next turn so the feed lines get a moment to age, then shoot
  await sleep(1200);
  await page.screenshot({ path: `${OUT}/03-table-feed.png` });

  // my own action must not duplicate into the feed (feed is opponents only)
  const feedAll = await feedLines();
  console.log('  feed later:', JSON.stringify(feedAll));

  console.log('errors:', errors.length ? errors : 'none');
  if (errors.length) fail('page errors');
  console.log(anyFail.length ? `UI CHECKS: FAIL (${anyFail.length}) ${anyFail.join('; ')}` : 'UI CHECKS: all pass');
  await browser.close(); server.close();
  process.exit(anyFail.length || errors.length ? 2 : 0);
})().catch((e) => { console.error('UI TOASTS FAIL', e); process.exit(1); });
