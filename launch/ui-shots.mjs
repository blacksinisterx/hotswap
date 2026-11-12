// Screenshots of the mascot in each mood and of the panel, on a local test page (for looking at the design).
//   node launch/ui-shots.mjs   (needs `npm run build:extension`)
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIX = join(ROOT, 'extension', 'test', 'fixtures');
const DEV = join(ROOT, 'extension', 'dist-dev');
const OUT = join(ROOT, 'docs', 'media', 'raw', 'ui');
mkdirSync(OUT, { recursive: true });
const server = createServer((req, res) => {
  const name = decodeURIComponent((req.url ?? '/').split('?')[0]).replace(/^\//, '');
  try { res.setHeader('content-type', extname(name) === '.js' ? 'text/javascript' : 'text/html; charset=utf-8'); res.end(readFileSync(join(FIX, name))); } catch { res.statusCode = 404; res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'hotswap-ui-')), {
  channel: 'chromium', headless: true, viewport: { width: 1280, height: 720 },
  args: [`--disable-extensions-except=${DEV}`, `--load-extension=${DEV}`],
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.goto(`${base}/chatgpt.html`);
await page.waitForTimeout(1400);
const chip = page.locator('[data-testid="hotswap-chip"]');
const clip = { x: 1280 - 330, y: 720 - 130, width: 330, height: 130 };
const setMood = (m) => page.evaluate((mood) => { document.querySelector('hotswap-root').shadowRoot.querySelector('.chip').dataset.mood = mood; }, m);
for (const m of ['idle', 'happy', 'alert', 'oops']) {
  await setMood(m);
  await page.waitForTimeout(m === 'happy' ? 330 : 500);
  await page.screenshot({ path: join(OUT, `mood-${m}.png`), clip });
}
await setMood('busy');
await page.waitForTimeout(250);
await page.screenshot({ path: join(OUT, 'mood-busy.png'), clip });
await setMood('idle');
await chip.hover();
await page.waitForTimeout(350);
await page.screenshot({ path: join(OUT, 'mood-hover.png'), clip });
await chip.click();
await page.locator('[data-testid="hotswap-capture"]').click();
await page.locator('[data-testid="hotswap-result"]').waitFor();
await page.locator('[data-testid="hotswap-save"]').click();
await page.waitForTimeout(500);
await page.mouse.move(300, 200);
await page.waitForTimeout(400);
await page.screenshot({ path: join(OUT, 'panel.png') });
await ctx.close();
server.close();
console.log('shots in', OUT);
