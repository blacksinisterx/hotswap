// Records the demo player as video: ../../docs/media/raw/<name>.webm. The player replays transcript.json (real CLI output).
//   node launch/demo/record.mjs full "" 0.75    all four scenes + end card, at 75% speed
//   node launch/demo/record.mjs short 1,2 0.85   only the chosen scenes, no end card (for the GIF)
// Uses Playwright from the Game Frankenstein project (already installed, with its Chromium).
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_DIR ?? 'D:/Projects/game-frankenstein/web/node_modules/@playwright/test');
const name = process.argv[2] ?? 'full';
const scenes = process.argv[3] ?? '';
const speed = process.argv[4] ?? '1';
const RAW = join(HERE, '..', '..', 'docs', 'media', 'raw');
mkdirSync(RAW, { recursive: true });
rmSync(join(RAW, 'tmp'), { recursive: true, force: true });

// the player reads transcript.json with fetch(), which file:// pages cannot do, so serve the folder
import http from 'node:http';
import { readFileSync } from 'node:fs';
const server = http.createServer((req, res) => {
  const f = join(HERE, decodeURIComponent((req.url ?? '/').split('?')[0]).replace(/^\//, '') || 'player.html');
  try {
    const body = readFileSync(f);
    res.setHeader('content-type', f.endsWith('.json') ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8');
    res.end(body);
  } catch { res.statusCode = 404; res.end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const VIEW = { width: 1280, height: 720 };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VIEW, recordVideo: { dir: join(RAW, 'tmp'), size: VIEW }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto(`http://127.0.0.1:${port}/player.html?speed=${speed}${scenes ? `&scenes=${scenes}` : ''}`);
await page.waitForFunction('window.__done === true', null, { timeout: 180000 });
await page.waitForTimeout(500);
await ctx.close();
await browser.close();
server.close();
const f = readdirSync(join(RAW, 'tmp')).filter((x) => x.endsWith('.webm')).pop();
renameSync(join(RAW, 'tmp', f), join(RAW, `${name}.webm`));
rmSync(join(RAW, 'tmp'), { recursive: true, force: true });
console.log('recorded', join(RAW, `${name}.webm`));
void pathToFileURL;
