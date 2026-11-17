import { basename } from 'node:path';
import { discoverAntigravity, readAntigravity } from './antigravity.ts';
import { discoverClaude, readClaude } from './claudeCode.ts';
import { discoverCodex, readCodex } from './codex.ts';
import { discoverGeminiCli, readGeminiCli } from './geminiCli.ts';
import type { Session, SessionInfo, ToolName } from '../core/types.ts';

export type ToolChoice = ToolName | 'all';

export function discover(tool: ToolChoice = 'all'): SessionInfo[] {
  const all: SessionInfo[] = [];
  if (tool === 'all' || tool === 'claude-code') all.push(...discoverClaude());
  if (tool === 'all' || tool === 'antigravity') all.push(...discoverAntigravity());
  if (tool === 'all' || tool === 'codex') all.push(...discoverCodex());
  if (tool === 'all' || tool === 'gemini-cli') all.push(...discoverGeminiCli());
  return all.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

export function readSession(info: SessionInfo): Session {
  switch (info.tool) {
    case 'claude-code': return readClaude(info.path);
    case 'codex': return readCodex(info.path);
    case 'gemini-cli': return readGeminiCli(info.path);
    default: return readAntigravity(info.path);
  }
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
