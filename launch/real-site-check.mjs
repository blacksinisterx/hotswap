// Loads the REAL built extension (dist-dev) in a real Chromium and opens a REAL site, logged out, to check the message box
// and the insert step. It never logs in, never sends, and never types into a chat: it only inserts a short made-up capsule
// into the empty message box, reads it back, then clears the box.
//   node launch/real-site-check.mjs <chatgpt|gemini|claude> [--keep-open]
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEV = join(ROOT, 'extension', process.env.HOTSWAP_DIST ?? 'dist-dev');
const OUT = join(ROOT, 'docs', 'media', 'raw', 'real');
mkdirSync(OUT, { recursive: true });
const site = process.argv[2] ?? 'chatgpt';
const URLS = { chatgpt: 'https://chatgpt.com/', gemini: 'https://gemini.google.com/app', claude: 'https://claude.ai/new' };
const CAPSULE = '# Hotswap handoff (made-up test text)\n\n> Latest request: continue the task.\n\n- open task: write the tests\n';

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'hotswap-real-')), {
  channel: 'chromium', headless: false, viewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${DEV}`, `--load-extension=${DEV}`],
});
const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
await sw.evaluate((text) => chrome.storage.local.set({
  settings: { preset: 'standard', probe: true, limitHints: true },
  capsules: [{ id: 'real-check', createdAt: new Date().toISOString(), title: 'Real-site check', site: 'test', tier: 'hybrid', turns: 1, bytes: text.length, text }],
}), CAPSULE);

const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.goto(URLS[site], { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(9000);
console.log('url:', page.url(), '| title:', await page.title());
await page.screenshot({ path: join(OUT, `${site}-1-loaded.png`) });

console.log('hotswap chip present:', (await page.locator('hotswap-root').count()) > 0);


// open panel and press "Insert here" in the shadow DOM
const ok = await page.evaluate(async () => {
  const host = document.querySelector('hotswap-root');
  const root = host?.shadowRoot;
  if (!root) return 'no shadow root';
  const chipBtn = [...root.querySelectorAll('button')].find((b) => /hotswap/i.test(b.textContent ?? ''));
  chipBtn?.click();
  await new Promise((r) => setTimeout(r, 800));
  const ins = [...root.querySelectorAll('button')].find((b) => /insert here/i.test(b.textContent ?? ''));
  if (!ins) return 'no insert button; buttons: ' + [...root.querySelectorAll('button')].map((b) => b.textContent).join(' | ');
  ins.click();
  await new Promise((r) => setTimeout(r, 2500));
  return 'clicked insert';
});
console.log(ok);
await page.screenshot({ path: join(OUT, `${site}-2-inserted.png`) });

const composers = await page.evaluate(() => [...document.querySelectorAll('#prompt-textarea, rich-textarea .ql-editor, div.ProseMirror[contenteditable="true"], [contenteditable="true"][role="textbox"], textarea')].map((el) => {
  const r = el.getBoundingClientRect();
  const text = el.tagName === 'TEXTAREA' ? el.value : el.innerText;
  return { tag: el.tagName, id: el.id, visible: r.width > 0 && r.height > 0, len: text.length, startsWith: text.slice(0, 40) };
}));
console.log('message boxes:', JSON.stringify(composers));
console.log('probe log:', JSON.stringify(await sw.evaluate(async () => (await chrome.storage.local.get('probe')).probe ?? [])).slice(0, 1500));

if (process.argv.includes('--keep-open')) { console.log('left open; close the window when done'); await new Promise(() => {}); }
await ctx.close();
