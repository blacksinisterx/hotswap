import test from 'node:test';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { discoverAntigravity, readAntigravity, todosFromMarkdown } from '../src/readers/antigravity.ts';
import { discoverClaude, isRateLimitEntry, parseLimit, readClaude } from '../src/readers/claudeCode.ts';
import { LIMIT_TEXT, claudeRows, tmp, writeAntigravity, writeClaude } from './helpers.ts';

test('claude code: turns are merged, noise is dropped, hidden reasoning never travels', () => {
  const root = tmp();
  const p = writeClaude(root, claudeRows());
  const s = readClaude(p);
  assert.deepEqual(s.messages.map((m) => m.role), ['user', 'assistant', 'user'], 'assistant entries with tool results between them become one turn');
  assert.equal(s.messages[0].text, 'Fix the login bug in auth.ts');
  assert.equal(s.messages[2].text, 'continue please', 'injected reminder text is stripped from the real words');
  const a = s.messages[1];
  assert.match(a.text, /I will edit auth\.ts/);
  assert.match(a.text, /The test failed/);
  assert.ok(!JSON.stringify(s).includes('private reasoning'), 'thinking blocks are not exported');
  assert.ok(s.notes.some((n) => /hidden-reasoning/.test(n)));
  assert.equal(s.source.title, 'Fix login bug');
  assert.equal(s.cwd, 'C:\\proj');
  assert.equal(s.gitBranch, 'main');
});

test('claude code: tools, results, files and the to-do list come out right', () => {
  const s = readClaude(writeClaude(tmp(), claudeRows()));
  const tools = s.messages[1].tools;
  assert.deepEqual(tools.map((t) => t.name), ['Edit', 'Bash', 'TodoWrite']);
  assert.deepEqual(tools[0].written, ['C:\\proj\\src\\auth.ts']);
  assert.equal(tools[0].ok, true);
  assert.equal(tools[1].command, 'npm test');
  assert.equal(tools[1].ok, false);
  assert.equal(tools[1].result, '1 failing');
  assert.deepEqual(s.todos.map((t) => [t.text, t.status]), [['Fix test', 'in_progress'], ['Write docs', 'pending'], ['Reproduce bug', 'completed']]);
});

test('claude code: the real limit line is recognised, other API errors are not', () => {
  const s = readClaude(writeClaude(tmp(), claudeRows('s', { endWithLimit: true })));
  assert.ok(s.limit);
  assert.equal(s.limit!.kind, 'rate_limit');
  assert.equal(s.limit!.resets, '11:40am (Asia/Karachi)');
  assert.equal(s.limit!.isLatest, true, 'nothing real came after the notice: the session is stuck on it');
  assert.equal(readClaude(writeClaude(tmp(), claudeRows())).limit, undefined, 'a 529 overloaded error is not a limit');
  const later = readClaude(writeClaude(tmp(), claudeRows('s', { endWithLimit: true, realTurnAfterLimit: true })));
  assert.equal(later.limit!.isLatest, false, 'a real turn after the notice means the limit has passed');
  assert.equal(isRateLimitEntry({ isApiErrorMessage: true, error: 'server_error', message: { content: 'x' } }), false);
  assert.deepEqual(parseLimit(LIMIT_TEXT), { resets: '11:40am (Asia/Karachi)' });
});

test('claude code: discovery lists sessions newest first and shows the working folder', () => {
  const root = tmp();
  writeClaude(root, claudeRows('a'), 'a', 'C--one');
  writeClaude(root, claudeRows('b'), 'b', 'C--two');
  const found = discoverClaude(root);
  assert.equal(found.length, 2);
  assert.ok(found.every((f) => f.cwd === 'C:\\proj'));
});

test('antigravity: steps become turns, long messages are flagged as cut by the source, tools are mapped', () => {
  const root = tmp();
  const p = writeAntigravity(root);
  const s = readAntigravity(p);
  assert.deepEqual(s.messages.map((m) => m.role), ['user', 'assistant', 'user']);
  assert.equal(s.messages[0].text, 'Build the login page');
  assert.equal(s.messages[2].truncated, true, 'a message of about 1,000 characters ending in a cut marker is incomplete');
  const a = s.messages[1];
  assert.equal(a.tools[0].command, 'npm init -y');
  assert.deepEqual(a.tools[1].written, ['C:/work/app/index.html']);
  assert.deepEqual(a.tools[2].read, ['C:/work/app/package.json']);
  assert.ok(!JSON.stringify(s).includes('file contents that must not be copied'), 'result bodies are not copied');
  assert.equal(s.cwd, 'C:/work/app');
  assert.ok(s.notes.some((n) => /cut 1 of 2 user message/.test(n)));
  assert.ok(s.notes.some((n) => /cleared/.test(n)));
  assert.ok(s.notes.some((n) => /Partial/.test(n)));
});

test('antigravity: the task list comes from task.md, and only the plain-text files are used', () => {
  const root = tmp();
  writeAntigravity(root);
  const s = readAntigravity(discoverAntigravity(root)[0].path);
  assert.deepEqual(s.todos.map((t) => [t.text, t.status]), [['Set up project', 'completed'], ['Build login page', 'in_progress'], ['Add tests', 'pending']]);
  assert.deepEqual(s.artifacts.map((a) => a.name), ['task.md', 'walkthrough.md']);
  assert.ok(!JSON.stringify(s).includes('CANARY-PB-CONTENT'), 'the conversations/*.pb files are never read');
  assert.deepEqual(todosFromMarkdown('- [ ] a\n* [x] b'), [{ text: 'a', status: 'pending' }, { text: 'b', status: 'completed' }]);
});

test('antigravity: paths that arrive quoted with doubled backslashes are cleaned', () => {
  const root = tmp();
  const p = writeAntigravity(root, 'agy-q');
  const rows = [
    { step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', status: 'DONE', created_at: '2026-04-22T10:00:00Z', content: 'go' },
    { step_index: 1, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', created_at: '2026-04-22T10:00:05Z', content: 'ok', tool_calls: [{ name: 'run_command', args: { CommandLine: 'dir', Cwd: '"d:\\\\work\\\\app"' } }, { name: 'view_file', args: { AbsolutePath: '"d:\\\\work\\\\app\\\\a.txt"' } }] },
  ];
  writeFileSync(p, rows.map((r) => JSON.stringify(r)).join('\n'));
  const s = readAntigravity(p);
  assert.equal(s.cwd, 'd:\\work\\app');
  assert.deepEqual(s.messages[1].tools[1].read, ['d:\\work\\app\\a.txt']);
});
