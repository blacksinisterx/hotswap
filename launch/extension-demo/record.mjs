// Records the REAL built extension working in a real Chromium on test pages that copy the structure of Claude,
// ChatGPT and Gemini. The pages are not the real sites (their header says so); real-site checks use probe mode.
//   node launch/extension-demo/record.mjs        (needs `npm run build:extension`)
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIX = join(ROOT, 'extension', 'test', 'fixtures');
const DEV = join(ROOT, 'extension', 'dist-dev');
const RAW = join(ROOT, 'docs', 'media', 'raw');
mkdirSync(RAW, { recursive: true });
rmSync(join(RAW, 'tmp'), { recursive: true, force: true });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const server = createServer((req, res) => {
  const name = decodeURIComponent((req.url ?? '/').split('?')[0]).replace(/^\//, '');
  try { res.setHeader('content-type', extname(name) === '.js' ? 'text/javascript' : 'text/html; charset=utf-8'); res.end(readFileSync(join(FIX, name))); } catch { res.statusCode = 404; res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const VIEW = { width: 1280, height: 720 };
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'hotswap-demo-chrome-')), {
  channel: 'chromium', headless: true, viewport: VIEW, recordVideo: { dir: join(RAW, 'tmp'), size: VIEW },
  args: [`--disable-extensions-except=${DEV}`, `--load-extension=${DEV}`],
});
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
await sw.evaluate(() => chrome.storage.local.clear());
const page = ctx.pages()[0] ?? (await ctx.newPage());

// demo-only overlay: a visible cursor (the video has none). Captions are NOT drawn on the page; they are logged with their
// time and added under the video by compose.py, so the page (and its "test page, not the real site" header) stays untouched.
const OVERLAY = `
(() => {
  if (document.getElementById('demo-dot')) return;
  const dot = document.createElement('div');
  dot.id = 'demo-dot';
  dot.style.cssText = 'position:fixed;z-index:2147483645;width:18px;height:18px;border-radius:50%;background:#ffd23f;border:3px solid #0e0b13;pointer-events:none;left:-60px;top:-60px;margin:6px 0 0 8px';
  document.documentElement.append(dot);
  addEventListener('mousemove', (e) => { dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px'; }, true);
})();`;
const caps = [];
const t0 = Date.now();
const caption = async (text) => { caps.push({ t: (Date.now() - t0) / 1000, text }); };
const T = (id) => page.locator(`[data-testid="${id}"]`);
async function click(loc, hold = 700) {
  const el = loc.first();
  await el.scrollIntoViewIfNeeded();
  const b = await el.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 18 });
  await pause(220);
  await el.click();
  await pause(hold);
}
const go = async (path) => { await page.goto(`${base}/${path}`); await page.locator('hotswap-root').waitFor({ state: 'attached' }); await page.evaluate(OVERLAY); };
const num = (n, t) => `${n}   ${t}`;

// 1. Claude-like page: the limit banner appears
await go('claude.html?limit=1');
await caption(num(1, 'You are mid-task in Claude. The usage limit hits.'));
await pause(2600);
await T('hotswap-toast').waitFor({ timeout: 8000 });
await caption(num(2, 'Hotswap notices (experimental) and offers to capture the chat.'));
await pause(2600);
await click(T('hotswap-toast').getByText('Capture now'), 800);
await T('hotswap-result').waitFor({ timeout: 30000 });
await caption(num(3, 'A capsule: turns, exact code, fidelity. Secrets are removed first.'));
await pause(4200);
await click(T('hotswap-save'), 1400);

// 2. ChatGPT-like page: insert the saved capsule
await go('chatgpt.html');
await caption(num(4, 'Open another AI. Hotswap keeps your capsule.'));
await pause(2000);
await click(T('hotswap-chip'), 900);
await T('hotswap-saved').first().waitFor();
await pause(900);
await click(T('hotswap-insert-saved'), 1200);
await page.locator('[data-composer]').evaluate((el) => { el.scrollTop = 0; });
await caption(num(5, 'Inserted into the message box. Hotswap never presses send: you do.'));
await pause(4800);

// 3. Gemini-like page
await go('gemini.html');
await caption(num(6, 'Same on Gemini.'));
await pause(1400);
await click(T('hotswap-chip'), 900);
await T('hotswap-saved').first().waitFor();
await click(T('hotswap-insert-saved'), 1200);
await page.locator('[data-composer]').evaluate((el) => { el.scrollTop = 0; });
await caption(num(7, 'ChatGPT, Claude and Gemini. No AI model, no server, no account.'));
await pause(4800);

await ctx.close();
server.close();
const f = readdirSync(join(RAW, 'tmp')).filter((x) => x.endsWith('.webm')).pop();
renameSync(join(RAW, 'tmp', f), join(RAW, 'chrome.webm'));
rmSync(join(RAW, 'tmp'), { recursive: true, force: true });
writeFileSync(join(RAW, 'chrome.captions.json'), JSON.stringify(caps, null, 1));
console.log('recorded', join(RAW, 'chrome.webm'), `(${caps.length} captions)`);
