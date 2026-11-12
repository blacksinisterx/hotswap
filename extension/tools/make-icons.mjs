// Renders tools/icon.svg to the PNG sizes Chrome needs (static/icons). Uses Playwright's Chromium.
//   node extension/tools/make-icons.mjs
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(import.meta.url)('@playwright/test');
const svg = readFileSync(join(HERE, 'icon.svg'), 'utf8');
mkdirSync(join(HERE, '..', 'static', 'icons'), { recursive: true });
const browser = await chromium.launch();
for (const size of [16, 32, 48, 128]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
  writeFileSync(join(HERE, '..', 'static', 'icons', `icon${size}.png`), await page.screenshot({ omitBackground: true }));
  await page.close();
}
await browser.close();
console.log('icons written');
