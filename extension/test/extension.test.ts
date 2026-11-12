// Loads the REAL built extension (extension/dist-dev) into a real Chromium and drives it on test pages that copy the
// structure of ChatGPT, Claude and Gemini. These are not the real sites: real-site checks are done with probe mode.
// Run: npm run test:extension   (Node 22.18+, needs `npm run build:extension` first, which that script does)
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, 'fixtures');
const DEV = join(HERE, '..', 'dist-dev');
const PROD = join(HERE, '..', 'dist');

let server: Server;
let port = 0;
let ctx: BrowserContext;
let sw: Worker;

before(async () => {
  server = createServer((req, res) => {
    const name = decodeURIComponent((req.url ?? '/').split('?')[0]).replace(/^\//, '');
    try {
      const body = readFileSync(join(FIX, name));
      res.setHeader('content-type', extname(name) === '.js' ? 'text/javascript' : 'text/html; charset=utf-8');
      res.end(body);
    } catch { res.statusCode = 404; res.end('not found'); }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as { port: number }).port;
  ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'hotswap-chrome-')), {
    channel: 'chromium', headless: true, viewport: { width: 1100, height: 760 },
    args: [`--disable-extensions-except=${DEV}`, `--load-extension=${DEV}`],
  });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://127.0.0.1:${port}` });
  sw = ctx.serviceWorkers()[0] ?? await ctx.waitForEvent('serviceworker');
});

after(async () => {
  await ctx?.close();
  server?.close();
});

const url = (name: string, q = '') => `http://127.0.0.1:${port}/${name}.html${q}`;

async function open(name: string, q = ''): Promise<Page> {
  const p = await ctx.newPage();
  await p.goto(url(name, q));
  await p.locator('hotswap-root').waitFor({ state: 'attached' });
  return p;
}
const T = (p: Page, id: string) => p.locator(`[data-testid="${id}"]`);

async function capture(p: Page, preset?: string): Promise<string> {
  if (!(await T(p, 'hotswap-panel').isVisible())) await T(p, 'hotswap-chip').click();
  if (preset) await T(p, 'hotswap-preset').selectOption(preset);
  await T(p, 'hotswap-capture').click();
  await T(p, 'hotswap-result').waitFor({ timeout: 25_000 });
  return T(p, 'hotswap-preview').inputValue();
}
const sent = (p: Page) => p.evaluate(() => (window as unknown as { __sent: number }).__sent);
const composerText = (p: Page) => p.locator('[data-composer]').evaluate((el) => (el instanceof HTMLTextAreaElement ? el.value : (el as HTMLElement).innerText));
async function clearSaved(): Promise<void> { await sw.evaluate(() => chrome.storage.local.remove(['capsules', 'probe'])); }

test('the dev build matches the supported chat sites and the real build does not include localhost', () => {
  const dev = JSON.parse(readFileSync(join(DEV, 'manifest.json'), 'utf8'));
  const prod = JSON.parse(readFileSync(join(PROD, 'manifest.json'), 'utf8'));
  assert.deepEqual(prod.host_permissions, ['https://chatgpt.com/*', 'https://chat.openai.com/*', 'https://claude.ai/*', 'https://gemini.google.com/*']);
  assert.deepEqual(prod.permissions.sort(), ['clipboardWrite', 'contextMenus', 'storage']);
  assert.ok(!JSON.stringify(prod).includes('127.0.0.1'));
  assert.ok(dev.host_permissions.includes('http://127.0.0.1/*'));
  assert.equal(prod.manifest_version, 3);
  assert.ok(!('web_accessible_resources' in prod) && !('externally_connectable' in prod), 'nothing on the web can reach into the extension');
});

test('ChatGPT page: reads every message, leaves out the hidden headings, keeps both kinds of code block, removes the secret', async () => {
  const p = await open('chatgpt');
  const md = await capture(p, 'full');
  assert.match(md, /in progress in \*\*ChatGPT\*\*/);
  assert.match(md, /Goal \(the first request\):\*\* Add JWT auth to the orders endpoint/);
  assert.match(md, /JWT_SECRET=\[REDACTED:env-secret\]/);
  assert.ok(!md.includes('Tr0ub4dor'), 'the planted secret never reaches the capsule');
  assert.ok(!/You said:|ChatGPT said:/.test(md), 'screen-reader headings are not conversation');
  assert.match(md, /Code from the conversation \(2 blocks, exact\)/);
  assert.match(md, /### 1\. ts /);
  assert.match(md, /### 2\. javascript /);
  assert.match(md, /export function requireAuth/);
  assert.match(md, /expired token gives 401/);
  assert.match(md, /- missing token returns 401/, 'lists keep their shape');
  assert.match(md, /Turns read: 4; included word for word: 4/);
  assert.match(md, /\*\*Tier:\*\* verbatim/);
  assert.equal(await sent(p), 0, 'Hotswap never presses send');
  await p.close();
});

test('Claude page: upload named, hidden headings and status rows left out, code languages kept, key removed', async () => {
  const p = await open('claude');
  const md = await capture(p, 'full');
  assert.match(md, /in progress in \*\*Claude\*\*/);
  assert.match(md, /Attached and not carried: pattern-a\.png/);
  assert.ok(!/Claude responded|Thought for 3 seconds|You said:/.test(md));
  assert.ok(!md.includes('AKIAABCDEFGHIJKLMNOP'));
  assert.match(md, /\[REDACTED:aws-access-key\]/);
  assert.match(md, /### \d+\. bash /);
  assert.match(md, /### \d+\. python /);
  assert.match(md, /ls -la\necho "done"/);
  assert.match(md, /\*\*two colours\*\*|two colours/);
  assert.match(md, /Turns read: 4;/);
  assert.equal(await sent(p), 0);
  await p.close();
});

test('Gemini page: prompt lines joined, thoughts left out, language label read, inline code kept', async () => {
  const p = await open('gemini');
  const md = await capture(p, 'full');
  assert.match(md, /in progress in \*\*Gemini\*\*/);
  assert.match(md, /Write a function that reverses a string\.\s+Use Python please\./);
  assert.ok(!md.includes('Thinking about slicing'));
  assert.match(md, /### 1\. python /);
  assert.match(md, /def reverse\(s\):\n {4}return s\[::-1\]/);
  assert.match(md, /`slicing`/);
  assert.match(md, /O\(n\) time/);
  assert.match(md, /Turns read: 4;/);
  assert.equal(await sent(p), 0);
  await p.close();
});

test('a long chat that only keeps messages near the screen is read completely and in order', async () => {
  const p = await open('chatgpt', '?virtual=1');
  const md = await capture(p, 'full');
  assert.match(md, /Turns read: 40;/);
  assert.match(md, /Read from the start of the conversation|read from the start of the conversation to the latest message/);
  let last = -1;
  for (const n of [0, 1, 2, 10, 20, 31, 38, 39]) {
    // the first and last user messages also appear in the state card at the top, so look from the end
    const label = n % 2 === 0 ? 'Question' : 'Answer';
    const i = [...md.matchAll(new RegExp(`${label} number ${n}(?!\\d)`, 'g'))].map((m) => m.index!).pop() ?? -1;
    assert.ok(i > last, `message ${n} is present and after the previous one`);
    last = i;
  }
  await p.close();
});

test('Insert puts the capsule in the message box of each site and never presses send', async () => {
  for (const name of ['chatgpt', 'claude', 'gemini']) {
    const p = await open(name);
    await capture(p);
    await T(p, 'hotswap-insert').click();
    await T(p, 'hotswap-toast').waitFor();
    const text = await composerText(p);
    assert.match(text, /Hotswap handoff/, `${name}: capsule is in the message box`);
    assert.match(text, /Goal \(the first request\)/);
    assert.equal(await sent(p), 0, `${name}: send was never pressed`);
    await p.close();
  }
});

test('Insert still works when the editor refuses typed text and only accepts a paste', async () => {
  const p = await open('claude', '?editor=strict');
  await capture(p);
  await T(p, 'hotswap-insert').click();
  await T(p, 'hotswap-toast').waitFor();
  assert.match(await composerText(p), /Hotswap handoff/);
  assert.equal(await sent(p), 0);
  await p.close();
});

test('Insert works in a plain textarea and keeps what the person had already typed', async () => {
  const p = await open('chatgpt', '?composer=textarea');
  await p.locator('[data-composer]').fill('my draft question');
  await capture(p);
  await T(p, 'hotswap-insert').click();
  await T(p, 'hotswap-toast').waitFor();
  const text = await composerText(p);
  assert.ok(text.startsWith('my draft question'), 'the draft is kept');
  assert.match(text, /Hotswap handoff/);
  await p.close();
});

test('a capsule saved on one site can be inserted on another', async () => {
  await clearSaved();
  const a = await open('chatgpt');
  await capture(a);
  await T(a, 'hotswap-save').click();
  await T(a, 'hotswap-saved').waitFor();
  await a.close();
  const b = await open('gemini');
  await T(b, 'hotswap-chip').click();
  await T(b, 'hotswap-saved').waitFor();
  assert.match(await T(b, 'hotswap-saved').first().innerText(), /ChatGPT/);
  await T(b, 'hotswap-insert-saved').first().click();
  await T(b, 'hotswap-toast').waitFor();
  const text = await composerText(b);
  assert.match(text, /in progress in ChatGPT|in progress in \*\*ChatGPT\*\*/);
  assert.match(text, /Add JWT auth to the orders endpoint/);
  assert.equal(await sent(b), 0);
  await b.close();
});

test('dragging the capsule chip onto the message box drops the capsule there', async () => {
  const p = await open('claude');
  await capture(p);
  await T(p, 'hotswap-drag').dragTo(p.locator('[data-composer]'));
  await p.waitForTimeout(300);
  const text = await composerText(p);
  assert.match(text, /Hotswap handoff/);
  assert.equal(await sent(p), 0);
  await p.close();
});

test('a limit banner that appears on the page raises the switch prompt; the same words inside a chat message do not', async () => {
  const hit = await open('chatgpt', '?limit=1');
  await T(hit, 'hotswap-toast').waitFor({ timeout: 6000 });
  assert.match(await T(hit, 'hotswap-toast').innerText(), /usage limit/i);
  await T(hit, 'hotswap-toast').getByText('Capture now').click();
  await T(hit, 'hotswap-result').waitFor({ timeout: 25_000 });
  await hit.close();

  const quoted = await open('claude', '?quote=1');
  await quoted.waitForTimeout(1800);
  assert.equal(await T(quoted, 'hotswap-toast').count(), 0, 'words inside a message are just words');
  await quoted.close();
});

test('the right-click command and the popup command capture and open the panel', async () => {
  const p = await open('gemini');
  await sw.evaluate(async (port) => {
    const tabs = await chrome.tabs.query({ url: `http://127.0.0.1:${port}/*` });
    await chrome.tabs.sendMessage(tabs[0].id!, { type: 'hotswap:capture' });
  }, port);
  await T(p, 'hotswap-result').waitFor({ timeout: 25_000 });
  assert.ok(await T(p, 'hotswap-panel').isVisible());
  await p.close();
});

test('probe mode records how the page reacted, with counts and techniques but no chat text', async () => {
  await clearSaved();
  await sw.evaluate(() => chrome.storage.local.set({ settings: { probe: true } }));
  const p = await open('chatgpt');
  await capture(p);
  await T(p, 'hotswap-insert').click();
  await T(p, 'hotswap-toast').waitFor();
  await p.waitForTimeout(300);
  const entries = await sw.evaluate(async () => (await chrome.storage.local.get('probe')).probe as { kind: string; data: Record<string, unknown> }[]);
  const kinds = entries.map((e) => e.kind);
  assert.ok(kinds.includes('adapter') && kinds.includes('capture') && kinds.includes('inject'), `entries: ${kinds.join(',')}`);
  const inject = entries.find((e) => e.kind === 'inject')!;
  assert.equal(inject.data.ok, true);
  assert.equal(inject.data.technique, 'execCommand-insertText');
  const flat = JSON.stringify(entries);
  assert.ok(!flat.includes('Add JWT auth') && !flat.includes('requireAuth') && !flat.includes('Tr0ub4dor'), 'no chat text in the probe log');
  await sw.evaluate(() => chrome.storage.local.set({ settings: { probe: false } }));
  await p.close();
});

test('a page with no conversation says so instead of producing an empty capsule', async () => {
  const p = await open('chatgpt');
  await p.evaluate(() => document.querySelectorAll('[data-turn-key]').forEach((n) => n.remove()));
  await T(p, 'hotswap-chip').click();
  await T(p, 'hotswap-capture').click();
  await T(p, 'hotswap-toast').waitFor({ timeout: 10_000 });
  assert.match(await T(p, 'hotswap-toast').innerText(), /No messages were found/);
  assert.equal(await T(p, 'hotswap-result').count(), 0);
  await p.close();
});
