import { chromium } from 'playwright';

const target = process.argv[2] || 'http://localhost:5199/admin.html';
const scriptPath = process.argv[3] || './_qa_admin.mjs';
const { pathToFileURL } = await import('node:url');
const { resolve } = await import('node:path');
const { default: run } = await import(pathToFileURL(resolve(process.cwd(), scriptPath)).href);

const browser = await chromium.launch();
const page = await browser.newPage();
const ui = {
  async snapshot(opts = {}) {
    // lightweight a11y-ish snapshot: interactive elements with refs
    const data = await page.evaluate(() => {
      const els = [...document.querySelectorAll('button, a, input, textarea, select, [role="textbox"], [role="button"], h1, h2, h3, [onclick]')];
      return els.slice(0, 300).map((el, i) => {
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute('role') || (tag === 'a' ? 'link' : tag === 'input' || tag === 'textarea' ? 'textbox' : tag === 'button' ? 'button' : tag);
        let name = el.getAttribute('aria-label') || el.getAttribute('placeholder') || (el.innerText || '').trim().slice(0, 60) || el.getAttribute('name') || el.value || '';
        name = String(name).replace(/\s+/g, ' ').trim();
        const id = el.id ? `#${el.id}` : '';
        return `- @e${i + 1} ${role} "${name}" ${tag}${id}`;
      }).join('\n');
    });
    if (opts.full) return data + '\n\n--- PAGE TEXT ---\n' + (await page.evaluate(() => document.body.innerText)).slice(0, 6000);
    return data;
  },
  async fill(ref, value) {
    const idx = parseInt(ref.replace('@e', ''), 10) - 1;
    const handle = await page.evaluateHandle((i) => [...document.querySelectorAll('input, textarea, select, [role="textbox"], [contenteditable]')][i], idx);
    const el = handle.asElement();
    if (!el) throw new Error(`ui.fill: no element for ref ${ref}`);
    await el.fill(value);
  },
  async click(ref) {
    const idx = parseInt(ref.replace('@e', ''), 10) - 1;
    const handle = await page.evaluateHandle((i) => [...document.querySelectorAll('button, a, [role="button"], [onclick], input[type=submit], select')][i], idx);
    const el = handle.asElement();
    if (!el) throw new Error(`ui.click: no element for ref ${ref}`);
    await el.click();
  }
};

try {
  await page.goto(target, { waitUntil: 'load', timeout: 30000 });
  const result = await run(page, ui);
  console.log('=== QA RESULT ===');
  console.log(JSON.stringify(result, null, 2).slice(0, 40000));
} catch (e) {
  console.error('QA RUNNER ERROR:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
