// Opens a real page and saves a screenshot + title, to see whether it is usable signed out. node launch/real-look.mjs <url> <name>
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
const out = join(import.meta.dirname, '..', 'docs', 'media', 'raw', 'real');
mkdirSync(out, { recursive: true });
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'hotswap-look-')), { channel: 'chromium', headless: false, viewport: { width: 1280, height: 800 } });
const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.goto(process.argv[2], { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => console.log('goto:', e.message.slice(0, 80)));
await page.waitForTimeout(10000);
console.log(process.argv[3], '|', page.url(), '|', await page.title());
await page.screenshot({ path: join(out, `look-${process.argv[3]}.png`) });
await ctx.close();
