// Real-site step: open a REAL logged-out site with the built extension, send ONE generic prompt, wait for the reply, then let
// Hotswap capture it, and print what it found. (Approved by the user for this demo; nothing personal is typed.)
//   node launch/real-chat.mjs <chatgpt|gemini>
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEV = join(ROOT, 'extension', 'dist-dev');
const OUT = join(ROOT, 'docs', 'media', 'raw', 'real');
mkdirSync(OUT, { recursive: true });
const site = process.argv[2] ?? 'chatgpt';
const URLS = { chatgpt: 'https://chatgpt.com/', gemini: 'https://gemini.google.com/app' };
const PROMPT = 'Write a Python function that reverses a string, and explain it in two lines.';

const ctx = await chromium.launchPersistentContext(join(tmpdir(), `hotswap-real-${site}`), {
  channel: 'chromium', headless: false, viewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${DEV}`, `--load-extension=${DEV}`],
});
const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
await sw.evaluate(() => chrome.storage.local.set({ settings: { preset: 'standard', probe: true, limitHints: true }, probe: [] }));
const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.goto(URLS[site], { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);

const box = page.locator(site === 'chatgpt' ? '#prompt-textarea, textarea:visible' : 'rich-textarea .ql-editor, textarea:visible, [contenteditable="true"]').first();
await box.click();
await page.keyboard.type(PROMPT, { delay: 25 });
await page.keyboard.press('Enter');
console.log('sent, waiting for the reply...');
await page.waitForTimeout(25000);
await page.screenshot({ path: join(OUT, `${site}-3-chat.png`) });
console.log('url:', page.url());

// structure only (tags and data-/role attributes, never text) of the transcript
console.log(JSON.stringify(await page.evaluate(() => {
  const desc = (el) => `${el.tagName.toLowerCase()}[${[...el.attributes].filter((a) => /^(data-|role|aria-label)/.test(a.name)).map((a) => `${a.name}=${a.value.slice(0, 30)}`).join(' ')}]`;
  const tree = (el, depth) => (depth === 0 ? desc(el) : { n: desc(el), c: [...el.children].slice(0, 6).map((c) => tree(c, depth - 1)) });
  const ol = document.querySelector('[data-conversation-transcript]');
  const scrollers = [];
  for (let el = ol; el; el = el.parentElement) { const o = getComputedStyle(el).overflowY; if (o === 'auto' || o === 'scroll') scrollers.push(desc(el)); }
  return { scrollers, transcript: ol ? [...ol.children].map((li) => tree(li, 4)) : null, title: document.title };
}), null, 1));

// press "Capture this chat" in the panel
const result = await page.evaluate(async () => {
  const root = document.querySelector('hotswap-root').shadowRoot;
  root.querySelector('.chip').click();
  await new Promise((r) => setTimeout(r, 600));
  root.querySelector('[data-testid="hotswap-capture"]').click();
  for (let i = 0; i < 80; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
    const card = root.querySelector('[data-testid="hotswap-result"]');
    if (card) return card.innerText.slice(0, 400);
    const t = root.querySelector('[data-testid="hotswap-toast"]');
    if (t) return 'TOAST: ' + t.innerText.slice(0, 300);
  }
  return 'timeout';
});
console.log('capture result:', result);
await page.screenshot({ path: join(OUT, `${site}-4-captured.png`) });
console.log('probe:', JSON.stringify(await sw.evaluate(async () => (await chrome.storage.local.get('probe')).probe ?? [])).slice(0, 1800));
await ctx.close();
