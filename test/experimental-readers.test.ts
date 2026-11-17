// The Codex CLI and Gemini CLI readers are EXPERIMENTAL: no real session of either exists on the machine they were built on.
// These sessions are invented, written in the shapes the MIT-licensed cli-continues parsers read. They prove the readers follow
// that format, NOT that the format is what the tools write today.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCapsule } from '../src/core/capsule.ts';
import { renderCapsule } from '../src/core/render.ts';
import { discoverCodex, readCodex } from '../src/readers/codex.ts';
import { discoverGeminiCli, readGeminiCli } from '../src/readers/geminiCli.ts';
import { jsonl, tmp } from './helpers.ts';

const ts = (i: number) => `2026-11-12T10:${String(i).padStart(2, '0')}:00.000Z`;

function writeCodex(root: string): string {
  const dir = join(root, 'sessions', '2026', '11', '12');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'rollout-2026-11-12T10-00-00-abc123.jsonl');
  const msg = (role: string, kind: string, text: string, i: number) => ({ timestamp: ts(i), type: 'response_item', payload: { type: 'message', role, content: [{ type: kind, text }] } });
  writeFileSync(path, jsonl([
    { timestamp: ts(0), type: 'session_meta', payload: { id: 'abc123', cwd: 'C:\\proj', git: { branch: 'feat/x' } } },
    msg('developer', 'input_text', 'system rules that must not travel', 1),
    msg('user', 'input_text', '<environment_context>cwd=C:\\proj</environment_context>', 2),
    msg('user', 'input_text', 'Add retry to the fetch helper', 3),
    { timestamp: ts(3), type: 'event_msg', payload: { type: 'user_message', message: 'Add retry to the fetch helper' } },
    { timestamp: ts(4), type: 'response_item', payload: { type: 'reasoning', summary: [] } },
    msg('assistant', 'output_text', 'I will edit fetch.ts\n```ts\nexport const n = 3;\n```', 5),
    { timestamp: ts(6), type: 'response_item', payload: { type: 'function_call', name: 'shell_command', call_id: 'c1', arguments: JSON.stringify({ command: 'npm test' }) } },
    { timestamp: ts(7), type: 'response_item', payload: { type: 'function_call_output', call_id: 'c1', output: JSON.stringify({ output: '1 failing', metadata: { exit_code: 1 } }) } },
    { timestamp: ts(8), type: 'response_item', payload: { type: 'custom_tool_call', name: 'apply_patch', call_id: 'c2', input: '*** Begin Patch\n*** Update File: src/fetch.ts\n@@\n-a\n+b\n*** End Patch' } },
    msg('assistant', 'output_text', 'Tests fail, checking.', 9),
    msg('user', 'input_text', 'ok continue, key is AKIAABCDEFGHIJKLMNOP', 10),
  ]), 'utf8');
  return path;
}

test('codex: messages, injected text, shell commands, patches and the experimental note', () => {
  const root = tmp();
  const path = writeCodex(root);
  const found = discoverCodex(root);
  assert.equal(found.length, 1);
  assert.equal(found[0].id, 'abc123');
  assert.equal(found[0].cwd, 'C:\\proj');
  const s = readCodex(path);
  assert.deepEqual(s.messages.map((m) => m.role), ['user', 'assistant', 'user']);
  assert.equal(s.messages[0].text, 'Add retry to the fetch helper', 'the event copy and the injected environment text are not turns of their own');
  assert.ok(!JSON.stringify(s).includes('system rules'), 'developer messages never travel');
  const a = s.messages[1];
  assert.match(a.text, /I will edit fetch\.ts/);
  assert.match(a.text, /Tests fail/);
  assert.equal(a.tools.find((t) => t.command === 'npm test')?.ok, false, 'exit code 1 means failed');
  assert.deepEqual(a.tools.find((t) => t.name === 'apply_patch')?.written, ['src/fetch.ts']);
  assert.equal(s.gitBranch, 'feat/x');
  assert.ok(s.notes.some((n) => /experimental/.test(n)));
});

test('codex: a capsule built from it removes secrets and says it is experimental', () => {
  const root = tmp();
  const md = renderCapsule(buildCapsule(readCodex(writeCodex(root)), { preset: 'standard' }));
  assert.ok(!md.includes('AKIAABCDEFGHIJKLMNOP'));
  assert.match(md, /Codex CLI/);
  assert.match(md, /experimental/i);
  assert.match(md, /export const n = 3;/, 'code is kept exactly');
});

function writeGemini(root: string, layout: 'json' | 'jsonl'): string {
  const dir = join(root, 'tmp', 'proj-hash', 'chats');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(root, 'projects.json'), JSON.stringify({ projects: { 'C:\\proj': 'proj-hash' } }), 'utf8');
  const messages = [
    { id: 'm1', type: 'user', timestamp: ts(1), content: 'Write a parser' },
    { id: 'm2', type: 'gemini', timestamp: ts(2), content: [{ text: 'Sure, here it is.' }], toolCalls: [{ name: 'write_file', args: { file_path: 'C:\\proj\\parse.ts' }, status: 'success' }, { name: 'run_shell_command', args: { command: 'npm test' }, status: 'error' }] },
    { id: 'm3', type: 'info', timestamp: ts(3), content: 'Update available' },
    { id: 'm4', type: 'user', timestamp: ts(4), content: 'a typo here' },
    { id: 'm5', type: 'user', timestamp: ts(5), content: 'Now add tests' },
  ];
  if (layout === 'json') {
    const path = join(dir, 'session-1.json');
    writeFileSync(path, JSON.stringify({ sessionId: 's-1', projectHash: 'proj-hash', startTime: ts(0), lastUpdated: ts(5), messages: messages.filter((m) => m.id !== 'm4') }), 'utf8');
    return path;
  }
  const path = join(dir, 'session-2.jsonl');
  writeFileSync(path, jsonl([{ $set: { sessionId: 's-2', projectHash: 'proj-hash', startTime: ts(0) } }, ...messages, { $rewindTo: 'm4' }, messages[4]!, { $set: { lastUpdated: ts(5) } }]), 'utf8');
  return path;
}

test('gemini cli: json layout, tools and the working folder from projects.json', () => {
  const root = tmp();
  const path = writeGemini(root, 'json');
  const found = discoverGeminiCli(root);
  assert.equal(found.length, 1);
  assert.equal(found[0].cwd, 'C:\\proj');
  const s = readGeminiCli(path);
  assert.deepEqual(s.messages.map((m) => m.role), ['user', 'assistant', 'user']);
  assert.match(s.messages[1].text, /Sure, here it is/);
  assert.deepEqual(s.messages[1].tools.find((t) => t.name === 'write_file')?.written, ['C:\\proj\\parse.ts']);
  assert.equal(s.messages[1].tools.find((t) => t.command === 'npm test')?.ok, false);
  assert.ok(!JSON.stringify(s).includes('Update available'), 'info lines are not turns');
  assert.ok(s.notes.some((n) => /experimental/.test(n)));
});

test('gemini cli: jsonl layout honours a rewind (the undone message is gone)', () => {
  const root = tmp();
  const s = readGeminiCli(writeGemini(root, 'jsonl'));
  assert.deepEqual(s.messages.map((m) => m.text), ['Write a parser', 'Sure, here it is.', 'Now add tests']);
  assert.equal(s.source.sessionId, 's-2');
});

test('experimental readers do not crash on empty or unreadable roots', () => {
  const root = tmp();
  assert.deepEqual(discoverCodex(root), []);
  assert.deepEqual(discoverGeminiCli(root), []);
});
