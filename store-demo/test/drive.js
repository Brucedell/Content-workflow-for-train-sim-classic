// Drives store-demo/index.html headless: loads, clicks hotspots, screenshots for the guide.
// Usage: (cd store-demo && python3 -m http.server 8765) then  NODE_PATH=<global node_modules> node store-demo/test/drive.js
const { chromium } = require('playwright');
const IMG = require('path').join(__dirname, '..', '..', 'guide-store', 'src', 'img') + '/';
(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1 });
  const errors = [];
  p.on('pageerror', e => errors.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto('http://127.0.0.1:8765/index.html');
  await p.waitForFunction(() => window.viewer && window.viewer.ready, null, { timeout: 30000 });
  await p.waitForTimeout(800);
  const hero = p.locator('.stage');
  await hero.screenshot({ path: IMG + 'viewer-01-loaded.png' });
  // hover a door to show the label
  let pos = await p.evaluate(() => window.viewer.screenPos('1_0500_door_r1'));
  console.log('door_r1 at', pos);
  await p.mouse.move(pos.x, pos.y); await p.waitForTimeout(200);
  await p.screenshot({ path: IMG + 'viewer-02-hover.png', clip: { x: 0, y: 60, width: 1280, height: 600 } });
  // click the door
  await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(1300);
  await hero.screenshot({ path: IMG + 'viewer-03-door-open.png' });
  // click pantograph via its base (web_hotspot) and front door via button
  pos = await p.evaluate(() => window.viewer.screenPos('1_0128_panto01_base'));
  await p.mouse.move(pos.x, pos.y); await p.mouse.down(); await p.mouse.up();
  await p.click('#hotspots button[data-label="Door L1"]');
  await p.waitForTimeout(1600);
  await hero.screenshot({ path: IMG + 'viewer-04-panto-up.png' });
  await p.screenshot({ path: IMG + 'landing-full.png', fullPage: true });
  const state = await p.evaluate(() => ({
    title: document.getElementById('model-title').textContent,
    status: document.getElementById('status').textContent,
    buttons: [...document.querySelectorAll('#hotspots button')].map(b => b.textContent + (b.classList.contains('active') ? '*' : '')),
    panto: window.viewer.manifest.hotspots.filter(h => h.node.includes('panto')).length,
  }));
  console.log(JSON.stringify(state, null, 1));
  console.log('page errors:', errors);
  await b.close();
})();
