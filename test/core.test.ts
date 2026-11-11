import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PRESETS, RedactionFailed, buildCapsule, codeBlocks } from '../src/core/capsule.ts';
import { redact } from '../src/core/redact.ts';
import { renderCapsule, verifyCapsule } from '../src/core/render.ts';
import type { Message, Session } from '../src/core/types.ts';
import { readAntigravity } from '../src/readers/antigravity.ts';
import { readClaude } from '../src/readers/claudeCode.ts';
import { claudeRows, tmp, writeAntigravity, writeClaude } from './helpers.ts';

// fake secrets are assembled at run time so no scanner mistakes this file for a leak
const FAKE = {
  aws: 'AKIA' + 'ABCDEFGHIJKLMNOP',
  github: 'ghp_' + 'a1B2c3D4e5'.repeat(4),
  anthropic: 'sk-ant-' + 'x9Y8z7W6v5'.repeat(3),
  jwt: ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0', 'abcdefghijklmnop'].join('.'),
  bearer: 'a1b2c3d4e5'.repeat(3),
  env: 'S3cr3tValue-123456',
  pem: '-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Qu\n-----END RSA PRIVATE KEY-----',
};
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

test('redactor: planted secrets of every kind disappear, and only counts are kept', () => {
  const text = [`aws ${FAKE.aws}`, `gh ${FAKE.github}`, `key ${FAKE.anthropic}`, `jwt ${FAKE.jwt}`, `Authorization: Bearer ${FAKE.bearer}`, `API_KEY=${FAKE.env}`, FAKE.pem, 'db postgres://user:hunter2pass@host/db'].join('\n');
  const r = redact(text);
  for (const secret of [FAKE.aws, FAKE.github, FAKE.anthropic, FAKE.jwt, FAKE.bearer, FAKE.env, 'MIIBOgIBAAJBAKj34', 'hunter2pass']) assert.ok(!r.text.includes(secret), `${secret.slice(0, 8)}... was not removed`);
  assert.deepEqual(Object.keys(r.hits).sort(), ['anthropic-key', 'aws-access-key', 'bearer-token', 'env-secret', 'github-token', 'jwt', 'private-key', 'url-password']);
  assert.ok(Object.values(r.hits).every((n) => n === 1));
  assert.match(r.text, /Authorization: Bearer \[REDACTED:bearer-token\]/, 'the label around a secret stays readable');
});

test('redactor: ordinary code and words are left alone', () => {
  const code = ['const apiKeyName = "user";', 'function password() { return 1; }', 'PASSWORD=abc', 'export const TOKEN_LIMIT = 4096;', 'https://example.com/path?x=1'].join('\n');
  const r = redact(code);
  assert.equal(r.text, code);
  assert.deepEqual(r.hits, {});
});

test('capsule: if the redactor fails, nothing is built', () => {
  const s = readClaude(writeClaude(tmp(), claudeRows()));
  assert.throws(() => buildCapsule(s, { redactor: () => { throw new Error('boom'); } }), RedactionFailed);
  assert.throws(() => buildCapsule(s, { redactor: () => ({ text: undefined as unknown as string, hits: {} }) }), RedactionFailed);
});

test('capsule: the state card carries goal, latest request, open tasks, files, commands and the last error', () => {
  const c = buildCapsule(readClaude(writeClaude(tmp(), claudeRows())));
  assert.equal(c.goal, 'Fix the login bug in auth.ts');
  assert.equal(c.latestRequest, 'continue please');
  assert.deepEqual(c.openTasks.map((t) => t.text), ['Fix test', 'Write docs'], 'finished tasks are not open');
  assert.deepEqual(c.files, ['src\\auth.ts'], 'paths are shown relative to the working folder');
  assert.deepEqual(c.commands.map((x) => [x.command, x.ok]), [['npm test', false]]);
  assert.match(c.lastError!, /npm test|Run tests/);
  assert.match(c.lastError!, /1 failing/);
});

function manyTurns(n: number): Session {
  const messages: Message[] = Array.from({ length: n }, (_, i) => ({ id: `m${i}`, role: i % 2 === 0 ? 'user' : 'assistant', text: `turn ${i}`, tools: [] }));
  return { source: { tool: 'claude-code', sessionId: 's', path: 'x', endedAt: 'e' }, messages, todos: [], artifacts: [], notes: [] };
}

test('capsule: presets decide how many turns travel word for word, and the tier says so', () => {
  const s = manyTurns(30);
  assert.equal(buildCapsule(s, { preset: 'minimal' }).tail.length, PRESETS.minimal);
  assert.equal(buildCapsule(s, { preset: 'standard' }).tail.length, 10);
  assert.equal(buildCapsule(s, { preset: 'verbose' }).tail.length, 20);
  const full = buildCapsule(s, { preset: 'full' });
  assert.equal(full.tail.length, 30);
  assert.equal(full.fidelity.tier, 'verbatim');
  assert.equal(buildCapsule(s, { preset: 'standard' }).fidelity.tier, 'hybrid');
  assert.ok(buildCapsule(s, { preset: 'standard' }).fidelity.notes.some((n) => /last 10 of 30 turns/.test(n)));
});

test('capsule: Antigravity or a cut message always makes the tier partial', () => {
  const root = tmp();
  writeAntigravity(root);
  const agy = buildCapsule(readAntigravity(`${root}/brain/agy-1/.system_generated/logs/overview.txt`), { preset: 'full' });
  assert.equal(agy.fidelity.tier, 'partial');
  assert.equal(agy.fidelity.turnsCutBySource, 1);
  assert.deepEqual(agy.artifacts.map((a) => a.name), ['task.md', 'walkthrough.md']);
  const s = manyTurns(4);
  s.messages[1].truncated = true;
  assert.equal(buildCapsule(s, { preset: 'full' }).fidelity.tier, 'partial');
});

test('code vault: the newest version of a block wins, every block is exact, and hashes match', () => {
  const block = (v: number) => `Here:\n\`\`\`js\nexport function f() {\n  return ${v};\n}\n\`\`\``;
  const s = manyTurns(0);
  s.messages = [
    { id: 'a1', role: 'assistant', text: block(1), tools: [] },
    { id: 'a2', role: 'assistant', text: `${block(2)}\n\`\`\`py\nprint("x")\n\`\`\``, tools: [] },
  ];
  const c = buildCapsule(s, { preset: 'full' });
  assert.equal(c.fidelity.codeBlocksFound, 3);
  assert.equal(c.vault.length, 2, 'two versions of the same function become one');
  const js = c.vault.find((b) => b.lang === 'js')!;
  assert.equal(js.text, 'export function f() {\n  return 2;\n}');
  assert.equal(js.sha256, sha(js.text));
  assert.equal(js.messageId, 'a2');
  assert.ok(c.fidelity.notes.some((n) => /1 code block/.test(n)));
  assert.deepEqual(codeBlocks('x\n````md\n```js\ninner\n```\n````\n').map((b) => b.lang), ['md'], 'a longer outer fence is respected');
});

test('code vault: secrets inside code are removed and counted', () => {
  const s = manyTurns(0);
  s.messages = [{ id: 'a1', role: 'assistant', text: `\`\`\`env\nAPI_KEY=${FAKE.env}\n\`\`\``, tools: [] }];
  const c = buildCapsule(s, { preset: 'full' });
  assert.ok(!c.vault[0].text.includes(FAKE.env));
  assert.equal(c.fidelity.redactions['env-secret'], 1, 'the same secret in the vault and in the turn it came from is counted once');
});

test('render: a capsule can be verified, and any change to it is noticed', () => {
  const c = buildCapsule(readClaude(writeClaude(tmp(), claudeRows('s', { endWithLimit: true }))), { preset: 'full' });
  const md = renderCapsule(c);
  for (const part of ['# Hotswap handoff', '## State', '### Open tasks', '## Recent conversation', '## Code from the conversation', '## Fidelity report', 'resets at 11:40am (Asia/Karachi)']) assert.ok(md.includes(part), `missing: ${part}`);
  const ok = verifyCapsule(md);
  assert.equal(ok.ok, true);
  assert.equal(ok.meta!.id, c.id);
  assert.equal(verifyCapsule(md.replace('Fix the login bug', 'Delete everything')).ok, false);
  assert.equal(verifyCapsule('just some text').ok, false);
});

test('render: code that contains triple backticks cannot break out of its block', () => {
  const s = manyTurns(0);
  s.messages = [{ id: 'a1', role: 'assistant', text: 'x\n````md\n```js\ninner\n```\n````', tools: [] }];
  const md = renderCapsule(buildCapsule(s, { preset: 'full' }));
  assert.ok(md.includes('`````md') || md.includes('````md'), 'a fence longer than the longest run inside is used');
  assert.equal(verifyCapsule(md).ok, true);
});

test('render: an unbalanced code fence in a message is closed so it cannot swallow the rest', () => {
  const s = manyTurns(0);
  s.messages = [{ id: 'u1', role: 'user', text: 'look:\n```js\nconst a = 1;', tools: [] }, { id: 'a1', role: 'assistant', text: 'next', tools: [] }];
  const md = renderCapsule(buildCapsule(s, { preset: 'full' }));
  const fences = (md.split('## Fidelity report')[0].match(/^\s*`{3,}/gm) ?? []).length;
  assert.equal(fences % 2, 0);
});

test('render: headings inside a turn are quoted, so they cannot be mistaken for the capsule sections', () => {
  const s = manyTurns(0);
  s.messages = [{ id: 'u1', role: 'user', text: 'plan this', tools: [] }, { id: 'a1', role: 'assistant', text: '## Fake section\nbody\n\n```js\nconst a = 1;\n```', tools: [] }];
  const md = renderCapsule(buildCapsule(s, { preset: 'full' }));
  assert.ok(!/^## Fake section/m.test(md), 'the heading is not at the start of a line');
  assert.match(md, /^> ## Fake section$/m);
  assert.equal(verifyCapsule(md).ok, true);
  const exact = md.split('\n').filter((l) => l.startsWith('> ') || l === '>').map((l) => l.slice(2)).join('\n');
  assert.ok(exact.includes('## Fake section\nbody'), 'removing the "> " gives back the exact text');
});

test('capsule: a limit from earlier in the session is history, only a limit nothing followed is a reason to switch', () => {
  const stuck = buildCapsule(readClaude(writeClaude(tmp(), claudeRows('s', { endWithLimit: true }))));
  assert.equal(stuck.limit?.resets, '11:40am (Asia/Karachi)');
  const past = buildCapsule(readClaude(writeClaude(tmp(), claudeRows('s', { endWithLimit: true, realTurnAfterLimit: true }))));
  assert.equal(past.limit, undefined);
  assert.ok(!renderCapsule(past).includes('Why the switch'));
  assert.ok(renderCapsule(stuck).includes('Why the switch'));
});
