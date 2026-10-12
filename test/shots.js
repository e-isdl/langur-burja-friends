'use strict';
// Visual smoke test: drive the real UI in headless Chromium and take screenshots.
// Usage: node test/shots.js <gameId> [--w=390 --h=844]
const { launch, outDir } = require('./_pw');
const { server } = require('../server/index');
const args = process.argv.slice(2);
const game = args.find((a) => !a.startsWith('--')) || 'callbreak';
const W = +((args.find((a) => a.startsWith('--w=')) || '--w=390').split('=')[1]);
const H = +((args.find((a) => a.startsWith('--h=')) || '--h=844').split('=')[1]);
const OUT = outDir('lbf-shots');
require('fs').mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port;
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: W < 700, isMobile: W < 700 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(base + '/');
  await page.waitForSelector('.home');
  await sleep(900);
  await page.screenshot({ path: `${OUT}/01-home.png` });
  await page.fill('input[aria-label="Your name"]', 'Ishan');
  await page.click('text=Start a table');
  await page.waitForSelector('.lobby');
  for (let i = 0; i < 2; i++) { await page.click('[data-key=addseat]'); await sleep(150); }
  await sleep(300);
  await page.screenshot({ path: `${OUT}/02-lobby.png` });
  await page.click(`[data-key="tile:${game}"]`); await sleep(250);
  await page.screenshot({ path: `${OUT}/03-lobby-${game}.png` });
  await page.click('[data-key=deal]');
  await page.waitForSelector('.tbl');
  await sleep(2500);
  await page.screenshot({ path: `${OUT}/04-${game}-start.png` });
  // play for a while: click whatever primary action is available
  for (let step = 0; step < 24; step++) {
    await sleep(700);
    const clicked = await page.evaluate(() => {
      const primary = [...document.querySelectorAll('.actions .btn.primary:not([disabled])')][0];
      if (primary) { primary.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5 })); const r = primary.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
      const cards = [...document.querySelectorAll('.hand .card:not(.dim)')];
      if (cards.length) { const r = cards[Math.floor(cards.length / 2)].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
      return null;
    });
    if (clicked) { await page.mouse.click(clicked.x, clicked.y); }
    if (step === 8) await page.screenshot({ path: `${OUT}/05-${game}-mid.png` });
    if (step === 16) {
      await page.screenshot({ path: `${OUT}/06-${game}-late.png` });
      if (process.env.RECTS) console.log(JSON.stringify(await page.evaluate(() => Object.fromEntries(['.tbl','.tbar','.stage','.dock','.me-row','.hand','.actions','.actions .btn'].map((q) => { const e = document.querySelector(q); if (!e) return [q, null]; const r = e.getBoundingClientRect(); return [q, [Math.round(r.top), Math.round(r.bottom), Math.round(r.height)]]; })))));
    }
    if (await page.$('.result')) { await page.screenshot({ path: `${OUT}/07-${game}-result.png` }); break; }
  }
  if (process.env.SELSHOT) {
    for (let i = 0; i < 40; i++) { const t = await page.evaluate(() => { const e = document.querySelector('.me-row .hint'); return e ? e.textContent : ''; }); if (/Play a card/.test(t)) break; await sleep(600); }
    const pos = await page.evaluate(() => { const c = document.querySelector('.hand .card:not(.dim)'); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    if (pos) { await page.mouse.click(pos.x, pos.y); await sleep(500); await page.screenshot({ path: `${OUT}/08-selected.png` });
      console.log(JSON.stringify(await page.evaluate(() => Object.fromEntries(['.stage','.dock','.me-row','.hand','.actions','.actions .btn'].map((q) => { const e = document.querySelector(q); if (!e) return [q, null]; const r = e.getBoundingClientRect(); return [q, [Math.round(r.top), Math.round(r.bottom)]]; }))))); }
  }
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close(); server.close(); process.exit(0);
})().catch((e) => { console.error('SHOTS FAIL', e); process.exit(1); });
