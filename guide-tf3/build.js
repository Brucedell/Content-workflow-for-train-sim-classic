// Render every guide/src/part-*.html to guide/pdf/*.pdf with Chromium (Playwright).
// Usage:  node guide/build.js            (Playwright must be resolvable, e.g. NODE_PATH=<global node_modules>)
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const SRC = path.join(__dirname, 'src');
const OUT = path.join(__dirname, 'pdf');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const parts = fs.readdirSync(SRC).filter(f => /^part-\d\d.*\.html$/.test(f)).sort();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const f of parts) {
    const html = path.join(SRC, f);
    await page.goto('file://' + html, { waitUntil: 'load' });
    const title = await page.title();
    const footer = `<div style="font-family:'DejaVu Sans',sans-serif;font-size:7pt;color:#5b6676;width:100%;
      padding:0 16mm;display:flex;justify-content:space-between;">
      <span>TF3 Vehicle Workflow Guide &middot; ${title}</span>
      <span>page <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;
    const out = path.join(OUT, f.replace(/\.html$/, '.pdf'));
    await page.pdf({
      path: out, format: 'A4', printBackground: true, preferCSSPageSize: true,
      displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: footer,
    });
    console.log('wrote', path.relative(process.cwd(), out));
  }
  await browser.close();
})();
