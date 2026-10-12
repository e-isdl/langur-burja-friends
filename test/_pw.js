'use strict';
// Shared headless-browser bootstrap for the visual tests: no downloaded browser
// is required - we drive the Chrome/Edge that is already on the machine.
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function loadPlaywright() {
  const g = execSync('npm root -g').toString().trim();
  for (const m of ['/playwright-core', '/playwright']) {
    try { return require(g + m); } catch (_) {}
  }
  return require('playwright-core');
}
function browserPath() {
  return ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find((p) => fs.existsSync(p)) || undefined;
}
async function launch() {
  const { chromium } = loadPlaywright();
  return chromium.launch({
    executablePath: browserPath(),
    headless: true,
    args: ['--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars'],
  });
}
const outDir = (name) => process.env.OUT || path.join(require('os').tmpdir(), name);

module.exports = { loadPlaywright, browserPath, launch, outDir };
