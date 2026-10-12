'use strict';
// Broader visual QA: full lobby (7 games), big table (8 players), khata sheet, invite sheet,
// reconnect banner, desktop viewport.
const { launch } = require('./_pw');
const { server } = require('../server/index');
const OUT = require('./_pw').outDir('');
require('fs').mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port;
  const browser = await launch();

  // Mobile: big table lobby + khata + invite
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('page:' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push('console:' + m.text()); });
  await page.goto(base + '/'); await page.waitForSelector('.home');
  await page.fill('input[aria-label="Your name"]', 'Ishan');
  await page.click('text=Start a table'); await page.waitForSelector('.lobby');
  for (let i = 0; i < 7; i++) { await page.click('[data-key=addseat]'); await sleep(100); }
  await sleep(300);
  await page.screenshot({ path: `${OUT}/lobby-8players.png` });
  // scroll shelf to see marriage tile
  await page.evaluate(() => document.querySelector('.shelf').scrollTo({ left: 9999 }));
  await sleep(200);
  await page.screenshot({ path: `${OUT}/lobby-shelf-end.png` });
  await page.click('[data-key=khata]'); await sleep(250); await page.screenshot({ path: `${OUT}/khata-sheet.png` });
  await page.click('.scrim'); await sleep(150);
  await page.click('[data-key=invite]'); await sleep(250); await page.screenshot({ path: `${OUT}/invite-sheet.png` });
  await page.click('.scrim'); await sleep(150);
  await page.click('[data-key=settings]'); await sleep(250); await page.screenshot({ path: `${OUT}/settings-sheet.png` });
  await page.click('.scrim'); await sleep(150);
  // deal an 8-player call break-incompatible game: pick teenpatti (max 8) so 8 seats fit
  await page.click('[data-key="tile:teenpatti"]'); await sleep(200);
  await page.click('[data-key=deal]'); await page.waitForSelector('.tbl'); await sleep(2200);
  await page.screenshot({ path: `${OUT}/table-8players.png` });
  // open in-game menu
  await page.click('[data-key=menu]'); await sleep(250); await page.screenshot({ path: `${OUT}/ingame-menu.png` });
  await page.click('.scrim'); await sleep(150);

  await ctx.close();

  // Desktop viewport of the same flow
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const dpage = await dctx.newPage();
  await dpage.goto(base + '/'); await dpage.waitForSelector('.home');
  await dpage.screenshot({ path: `${OUT}/desktop-home.png` });
  await dpage.fill('input[aria-label="Your name"]', 'Ishan');
  await dpage.click('text=Start a table'); await dpage.waitForSelector('.lobby');
  for (let i = 0; i < 3; i++) { await dpage.click('[data-key=addseat]'); await sleep(100); }
  await sleep(300); await dpage.screenshot({ path: `${OUT}/desktop-lobby.png` });
  await dpage.click('[data-key="tile:callbreak"]'); await sleep(200);
  await dpage.click('[data-key=deal]'); await dpage.waitForSelector('.tbl'); await sleep(2200);
  await dpage.screenshot({ path: `${OUT}/desktop-table.png` });
  await dctx.close();

  console.log('errors:', errs.length ? errs.slice(0, 8) : 'none');
  await browser.close(); server.close(); process.exit(0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
