import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentLimit, scanLines, watchClaude } from '../src/watch/limit.ts';
import type { LimitHit } from '../src/watch/limit.ts';
import { LIMIT_TEXT, claudeRows, jsonl, tmp, writeAntigravity, writeClaude } from './helpers.ts';

const limitRow = (uuid: string, ts = '2026-11-12T11:00:00.000Z') => ({ sessionId: 's', uuid, timestamp: ts, type: 'assistant', isApiErrorMessage: true, error: 'rate_limit', apiErrorStatus: 429, message: { model: '<synthetic>', role: 'assistant', content: [{ type: 'text', text: LIMIT_TEXT }] } });

test('limit watcher: scanLines finds real limit lines and ignores other errors and normal lines', () => {
  const lines = jsonl([...claudeRows('s'), limitRow('L1')]).split('\n');
  const hits = scanLines(lines, 'C:/x/s.jsonl');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].resets, '11:40am (Asia/Karachi)');
  assert.equal(hits[0].uuid, 'L1');
  assert.equal(scanLines(['not json', '{"isApiErrorMessage":true,"error":"server_error","message":{"content":"x"}}']).length, 0);
});

test('limit watcher: "stuck right now" is true only while nothing real follows the notice', () => {
  const a = tmp();
  writeClaude(a, claudeRows('s', { endWithLimit: true }));
  assert.equal(currentLimit(a)?.resets, '11:40am (Asia/Karachi)');
  const b = tmp();
  writeClaude(b, claudeRows('s', { endWithLimit: true, realTurnAfterLimit: true }));
  assert.equal(currentLimit(b), undefined);
  const c = tmp();
  writeClaude(c, claudeRows('s'));
  assert.equal(currentLimit(c), undefined);
});

test('limit watcher: reports a limit written after it started, once, and ignores older ones', async () => {
  const root = tmp();
  const file = writeClaude(root, [...claudeRows('s'), limitRow('OLD')]);
  const hits: LimitHit[] = [];
  const ac = new AbortController();
  const done = watchClaude({ root, intervalMs: 30, signal: ac.signal, onLimit: (h) => { hits.push(h); } });
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(hits.length, 0, 'a limit from before the watcher started is not an alert');
  appendFileSync(file, `${JSON.stringify(limitRow('NEW', '2026-11-12T12:00:00.000Z'))}\n`);
  await new Promise((r) => setTimeout(r, 200));
  // a half-written line is held back until its newline arrives
  const half = JSON.stringify(limitRow('SPLIT', '2026-11-12T12:05:00.000Z'));
  appendFileSync(file, half.slice(0, 40));
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(hits.length, 1);
  appendFileSync(file, `${half.slice(40)}\n`);
  await new Promise((r) => setTimeout(r, 200));
  ac.abort();
  await done;
  assert.deepEqual(hits.map((h) => h.uuid), ['NEW', 'SPLIT']);
});

test('limit watcher: includeCurrent reports a session that is already stuck', async () => {
  const root = tmp();
  writeClaude(root, claudeRows('s', { endWithLimit: true }));
  const hits: LimitHit[] = [];
  const ac = new AbortController();
  const done = watchClaude({ root, intervalMs: 30, signal: ac.signal, includeCurrent: true, onLimit: (h) => { hits.push(h); } });
  await new Promise((r) => setTimeout(r, 100));
  ac.abort();
  await done;
  assert.equal(hits.length, 1);
});

// ---------------------------------------------------------------- the command line, end to end
const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
function run(args: string[], env: Record<string, string>) {
  const r = spawnSync(process.execPath, [CLI, ...args], { env: { ...process.env, ...env }, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

test('cli: `to claude` writes HANDOFF.md without secrets, says how to start, and refuses to overwrite', () => {
  const claude = tmp();
  const agy = tmp();
  const out = tmp();
  const secret = 'ghp_' + 'Z9y8X7w6V5'.repeat(4);
  const rows = claudeRows('cli-1').concat([{ sessionId: 'cli-1', uuid: 'x', timestamp: '2026-11-12T10:30:00.000Z', type: 'user', message: { role: 'user', content: `my token is ${secret} please use it` } }] as object[]);
  writeClaude(claude, rows, 'cli-1');
  const env = { HOTSWAP_CLAUDE_DIR: claude, HOTSWAP_ANTIGRAVITY_DIR: agy };
  const r = run(['to', 'claude', '--from', 'claude', '--dir', out], env);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Handoff written/);
  assert.match(r.out, /claude "Read HANDOFF\.md fully/);
  assert.match(r.out, /secrets removed: 1 github-token/);
  const text = readFileSync(join(out, 'HANDOFF.md'), 'utf8');
  assert.ok(!text.includes(secret), 'the planted token never reaches the file');
  assert.match(text, /\[REDACTED:github-token\]/);
  const again = run(['to', 'claude', '--from', 'claude', '--dir', out], env);
  assert.equal(again.code, 1);
  assert.match(again.out, /already exists/);
  assert.equal(run(['to', 'claude', '--from', 'claude', '--dir', out, '--force'], env).code, 0);
});

test('cli: list, doctor and check work, and check catches an edited file', () => {
  const claude = tmp();
  const agy = tmp();
  writeClaude(claude, claudeRows('cli-2'), 'cli-2');
  writeAntigravity(agy);
  const env = { HOTSWAP_CLAUDE_DIR: claude, HOTSWAP_ANTIGRAVITY_DIR: agy };
  const list = run(['list'], env);
  assert.match(list.out, /claude-code/);
  assert.match(list.out, /antigravity/);
  const doctor = run(['doctor'], env);
  assert.match(doctor.out, /Claude Code[\s\S]*sessions Hotswap can read: 1/);
  assert.match(doctor.out, /never opens Antigravity's conversations\/\*\.pb or state\.vscdb/);
  const file = join(tmp(), 'c.hotswap.md');
  const cap = run(['capture', '--from', 'antigravity', '--preset', 'full', '--out', file], env);
  assert.equal(cap.code, 0, cap.out);
  assert.match(cap.out, /tier: partial/);
  assert.equal(run(['check', file], env).code, 0);
  writeFileSync(file, readFileSync(file, 'utf8').replace('Build the login page', 'Something else'));
  const bad = run(['check', file], env);
  assert.equal(bad.code, 1);
  assert.match(bad.out, /NOT OK/);
  assert.ok(existsSync(file));
});

test('cli: `watch --once` builds a capsule when the newest session is stuck on a limit', () => {
  const claude = tmp();
  const out = tmp();
  writeClaude(claude, claudeRows('cli-3', { endWithLimit: true }), 'cli-3');
  const r = run(['watch', '--once', '--dir', out], { HOTSWAP_CLAUDE_DIR: claude, HOTSWAP_ANTIGRAVITY_DIR: tmp() });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Limit reached/);
  assert.match(r.out, /resets 11:40am/);
  assert.ok(existsSync(join(out, 'HANDOFF.md')));
  const none = run(['watch', '--once', '--dir', out], { HOTSWAP_CLAUDE_DIR: (() => { const d = tmp(); writeClaude(d, claudeRows('ok')); return d; })(), HOTSWAP_ANTIGRAVITY_DIR: tmp() });
  assert.match(none.out, /not stuck on a limit/);
});
