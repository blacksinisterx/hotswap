import { basename } from 'node:path';
import { discoverAntigravity, readAntigravity } from './antigravity.ts';
import { discoverClaude, readClaude } from './claudeCode.ts';
import type { Session, SessionInfo, ToolName } from '../core/types.ts';

export type ToolChoice = ToolName | 'all';

export function discover(tool: ToolChoice = 'all'): SessionInfo[] {
  const all: SessionInfo[] = [];
  if (tool === 'all' || tool === 'claude-code') all.push(...discoverClaude());
  if (tool === 'all' || tool === 'antigravity') all.push(...discoverAntigravity());
  return all.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

export function readSession(info: SessionInfo): Session {
  return info.tool === 'claude-code' ? readClaude(info.path) : readAntigravity(info.path);
}

/** Finds a session by (a start of) its id, or the newest one, optionally inside a project folder. */
export function pick(tool: ToolChoice, opts: { id?: string; project?: string } = {}): SessionInfo | undefined {
  let list = discover(tool);
  if (opts.id) list = list.filter((s) => s.id.startsWith(opts.id!));
  if (opts.project) {
    const want = opts.project.replace(/\\/g, '/').toLowerCase().replace(/\/$/, '');
    list = list.filter((s) => (s.cwd ?? '').replace(/\\/g, '/').toLowerCase().replace(/\/$/, '') === want || s.path.toLowerCase().includes(basename(want)));
  }
  return list[0];
}
