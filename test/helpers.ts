// Builds small, invented sessions in the same shapes the real tools write (verified on a real machine).
// No real conversation is ever copied into a test.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const tmp = (): string => mkdtempSync(join(tmpdir(), 'hotswap-'));
export const jsonl = (rows: object[]): string => `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`;

export const LIMIT_TEXT = "You've hit your session limit \u00b7 resets 11:40am (Asia/Karachi)";

const base = (sessionId: string, i: number) => ({ sessionId, cwd: 'C:\\proj', gitBranch: 'main', timestamp: `2026-11-12T10:${String(i).padStart(2, '0')}:00.000Z`, uuid: `u-${sessionId}-${i}`, isSidechain: false });

export function claudeRows(sessionId = 'sess-1', opts: { endWithLimit?: boolean; realTurnAfterLimit?: boolean } = {}): object[] {
  const rows: object[] = [
    { type: 'custom-title', customTitle: 'Fix login bug', sessionId },
    { ...base(sessionId, 0), type: 'user', message: { role: 'user', content: 'Fix the login bug in auth.ts' } },
    { ...base(sessionId, 1), type: 'user', isMeta: true, message: { role: 'user', content: '<system-reminder>ignore me</system-reminder>' } },
    { ...base(sessionId, 2), type: 'assistant', message: { id: 'm1', role: 'assistant', content: [{ type: 'thinking', thinking: 'private reasoning that must not travel' }] } },
    { ...base(sessionId, 3), type: 'assistant', message: { id: 'm1', role: 'assistant', content: [{ type: 'text', text: 'I will edit auth.ts\n```ts\nexport const a = 1;\n```' }] } },
    { ...base(sessionId, 4), type: 'assistant', message: { id: 'm1', role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: 'C:\\proj\\src\\auth.ts', old_string: 'a', new_string: 'b' } }] } },
    { ...base(sessionId, 5), type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'File updated' }] } },
    { ...base(sessionId, 6), type: 'assistant', message: { id: 'm2', role: 'assistant', content: [{ type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'npm test', description: 'Run tests' } }] } },
    { ...base(sessionId, 7), type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't2', is_error: true, content: '1 failing' }] } },
    { ...base(sessionId, 8), type: 'assistant', message: { id: 'm3', role: 'assistant', content: [{ type: 'text', text: 'The test failed, I am looking into it.' }, { type: 'tool_use', id: 't3', name: 'TodoWrite', input: { todos: [{ content: 'Fix test', status: 'in_progress' }, { content: 'Write docs', status: 'pending' }, { content: 'Reproduce bug', status: 'completed' }] } }] } },
    { ...base(sessionId, 9), type: 'user', message: { role: 'user', content: '<system-reminder>noise</system-reminder>continue please' } },
    { ...base(sessionId, 10), type: 'assistant', isApiErrorMessage: true, error: 'server_error', message: { model: '<synthetic>', role: 'assistant', content: [{ type: 'text', text: 'API Error: 529 Overloaded' }] } },
  ];
  if (opts.endWithLimit) {
    rows.push({ ...base(sessionId, 11), type: 'assistant', isApiErrorMessage: true, error: 'rate_limit', apiErrorStatus: 429, message: { model: '<synthetic>', role: 'assistant', content: [{ type: 'text', text: LIMIT_TEXT }] } });
    if (opts.realTurnAfterLimit) rows.push({ ...base(sessionId, 12), type: 'user', message: { role: 'user', content: 'ok it is back, carry on' } });
  }
  return rows;
}

/** <root>/<project-folder>/<session>.jsonl, the layout Claude Code uses. */
export function writeClaude(root: string, rows: object[], sessionId = 'sess-1', folder = 'C--proj'): string {
  mkdirSync(join(root, folder), { recursive: true });
  const p = join(root, folder, `${sessionId}.jsonl`);
  writeFileSync(p, jsonl(rows));
  return p;
}

export function antigravityRows(): object[] {
  const longCut = `${'Please keep going with the dashboard layout. '.repeat(21)}... (truncated)`;
  return [
    { step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', status: 'DONE', created_at: '2026-04-22T10:00:00Z', content: 'Build the login page' },
    { step_index: 1, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', created_at: '2026-04-22T10:00:05Z', content: 'Plan: create index.html, then style it.', tool_calls: [{ name: 'run_command', args: { CommandLine: 'npm init -y', Cwd: 'C:/work/app', toolSummary: 'Init project' } }] },
    { step_index: 2, source: 'MODEL', type: 'CODE_ACTION', status: 'DONE', created_at: '2026-04-22T10:00:09Z', content: 'file contents that must not be copied' },
    { step_index: 3, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'CLEARED', created_at: '2026-04-22T10:00:12Z', tool_calls: [{ name: 'write_to_file', args: { TargetFile: 'C:/work/app/index.html', CodeContent: '<html></html>' } }, { name: 'view_file', args: { AbsolutePath: 'C:/work/app/package.json' } }] },
    { step_index: 4, source: 'USER_EXPLICIT', type: 'USER_INPUT', status: 'DONE', created_at: '2026-04-22T10:01:00Z', content: longCut },
  ];
}

/** <root>/brain/<id>/.system_generated/logs/overview.txt, plus decoys that Hotswap must never use. */
export function writeAntigravity(root: string, id = 'agy-1'): string {
  const logs = join(root, 'brain', id, '.system_generated', 'logs');
  mkdirSync(logs, { recursive: true });
  const p = join(logs, 'overview.txt');
  writeFileSync(p, jsonl(antigravityRows()));
  writeFileSync(join(root, 'brain', id, 'task.md'), '# Task\n- [x] Set up project\n- [/] Build login page\n- [ ] Add tests\n');
  writeFileSync(join(root, 'brain', id, 'walkthrough.md'), '# Walkthrough\nCreated index.html.\n');
  mkdirSync(join(root, 'conversations'), { recursive: true });
  writeFileSync(join(root, 'conversations', `${id}.pb`), Buffer.from('CANARY-PB-CONTENT'));
  return p;
}
