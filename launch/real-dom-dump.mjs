// Prints the attributes of editable elements on a real page (no page text), to find the right message-box selector.
//   node launch/real-dom-dump.mjs <url>
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'hotswap-dump-')), { channel: 'chromium', headless: false, viewport: { width: 1280, height: 800 } });
const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.goto(process.argv[2], { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(8000);
console.log(JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('textarea, [contenteditable], [role="textbox"], rich-textarea')].map((el) => {
  const r = el.getBoundingClientRect();
  return { tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 90), ce: el.getAttribute('contenteditable'), role: el.getAttribute('role'), aria: el.getAttribute('aria-label'), id: el.id, ph: el.getAttribute('placeholder') ?? el.getAttribute('data-placeholder'), parent: el.parentElement?.tagName.toLowerCase(), w: Math.round(r.width), h: Math.round(r.height) };
})), null, 1));
await ctx.close();
