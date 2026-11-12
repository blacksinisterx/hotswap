// Records the built extension on the REAL, logged-out chatgpt.com and gemini.google.com (no test pages).
// It sends one generic prompt on ChatGPT (approved by the user), captures the chat with Hotswap, saves the capsule, opens real
// Gemini and presses "Insert here". It never presses send on the capsule and never logs in.
//   node launch/extension-demo/record-real.mjs   (needs `npm run build:extension`; writes docs/media/raw/real.webm + real.captions.json)
import { mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEV = join(ROOT, 'extension', 'dist-dev');
const RAW = join(ROOT, 'docs', 'media', 'raw');
mkdirSync(RAW, { recursive: true });
rmSync(join(RAW, 'tmp'), { recursive: true, force: true });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const PROMPT = 'Write a Python function that reverses a string, and explain it in two lines.';

const VIEW = { width: 1280, height: 720 };
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'hotswap-real-demo-')), {
  channel: 'chromium', headless: false, viewport: VIEW, recordVideo: { dir: join(RAW, 'tmp'), size: VIEW },
  args: [`--disable-extensions-except=${DEV}`, `--load-extension=${DEV}`],
});
const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
await sw.evaluate(() => chrome.storage.local.clear());
const page = ctx.pages()[0] ?? (await ctx.newPage());

// demo-only: a visible cursor dot (the video has none). Captions are added under the video by compose.py.
await page.addInitScript(() => {
  addEventListener('DOMContentLoaded', () => {
    const dot = document.createElement('div');
    dot.style.cssText = 'position:fixed;z-index:2147483645;width:18px;height:18px;border-radius:50%;background:#ffd23f;border:3px solid #0e0b13;pointer-events:none;left:-60px;top:-60px;margin:6px 0 0 8px';
    document.documentElement.append(dot);
    addEventListener('mousemove', (e) => { dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px'; }, true);
  });
});
const caps = [];
const t0 = Date.now();
const caption = (text) => caps.push({ t: (Date.now() - t0) / 1000, text });
const clickAt = async (loc) => {
  const b = await loc.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 28 });
  await pause(350);
  await page.mouse.down(); await page.mouse.up();
};
const T = (id) => page.locator(`[data-testid="${id}"]`);

caption('1   Real ChatGPT, not signed in. You ask something.');
await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await pause(4500);
const box = page.locator('#prompt-textarea, textarea:visible').first();
await clickAt(box);
await page.keyboard.type(PROMPT, { delay: 45 });
await pause(600);
await page.keyboard.press('Enter');
await page.locator('[data-assistant-markdown-root]').first().waitFor({ timeout: 40000 });
await pause(9000); // let the reply finish
caption('2   Hotswap is the little flame capsule on the page. Click it.');
await pause(1200);
await clickAt(T('hotswap-chip'));
await pause(1400);
caption('3   Capture this chat. It reads the real messages and keeps the code exact.');
await clickAt(T('hotswap-capture'));
await T('hotswap-result').waitFor({ timeout: 30000 });
await pause(4500);
caption('4   Save the capsule. It stays on this computer.');
await clickAt(T('hotswap-save'));
await pause(3200);

caption('5   Limit hit? Open a different AI. This is real Gemini.');
await page.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded', timeout: 60000 });
await pause(5500);
caption('6   Same capsule character here. Open it and press Insert here.');
await clickAt(T('hotswap-chip'));
await pause(1500);
await clickAt(T('hotswap-insert-saved').first());
await pause(4500);
caption('7   Chat is in the message box. Nothing is sent: you press Enter.');
await pause(6500);

caps.push({ t: (Date.now() - t0) / 1000, text: '' });
const video = page.video();
await ctx.close();
renameSync(await video.path(), join(RAW, 'real.webm'));
writeFileSync(join(RAW, 'real.captions.json'), JSON.stringify(caps.slice(0, -1), null, 1));
rmSync(join(RAW, 'tmp'), { recursive: true, force: true });
console.log('recorded', join(RAW, 'real.webm'), `(${caps.length - 1} captions)`);
