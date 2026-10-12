'use strict';
// Drives further into a match to capture result screens for every game.
const { launch } = require('./_pw');
const { server } = require('../server/index');
const game = process.argv[2] || 'teenpatti';
const OUT = require('./_pw').outDir('');
require('fs').mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port;
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(m.text()); });
  await page.goto(base + '/');
  await page.waitForSelector('.home');
  await page.fill('input[aria-label="Your name"]', 'Ishan');
  await page.click('text=Start a table');
  await page.waitForSelector('.lobby');
  for (let i = 0; i < 3; i++) { await page.click('[data-key=addseat]'); await sleep(120); }
  await page.click(`[data-key="tile:${game}"]`); await sleep(200);
  await page.click('[data-key=deal]');
  await page.waitForSelector('.tbl');
  let shot = 0, resultsSeen = 0;
  for (let step = 0; step < 260 && resultsSeen < 3; step++) {
    await sleep(550);
    const clicked = await page.evaluate(() => {
      const primary = [...document.querySelectorAll('.actions .btn.primary:not([disabled])')][0];
      if (primary) { const r = primary.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
      const any = [...document.querySelectorAll('.actions .btn:not([disabled])')][0];
      if (any) { const r = any.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
      const cards = [...document.querySelectorAll('.hand .card:not(.dim)')];
      if (cards.length) { const r = cards[Math.floor(cards.length / 2)].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
      return null;
    });
    if (clicked) await page.mouse.click(clicked.x, clicked.y);
    const hasResult = await page.$('.result');
    if (hasResult && step % 3 === 0) { resultsSeen++; await page.screenshot({ path: `${OUT}/result-${game}-${resultsSeen}.png` }); await sleep(1200); }
  }
  await page.screenshot({ path: `${OUT}/final-${game}.png` });
  console.log('errors:', errs.length ? errs.slice(0, 5) : 'none', 'resultsSeen', resultsSeen);
  await browser.close(); server.close(); process.exit(0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
