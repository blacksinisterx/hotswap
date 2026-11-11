// Reads Antigravity sessions from the plain-text files it keeps next to its encrypted-looking conversation files:
//   ~/.gemini/antigravity/brain/<id>/.system_generated/logs/overview.txt   (JSON Lines, one step per line)
//   ~/.gemini/antigravity/brain/<id>/{task,implementation_plan,walkthrough}.md
// Layout verified on a real machine (PHASE0.md). It deliberately opens NOTHING else: not conversations/*.pb,
// and never state.vscdb, which holds sign-in tokens.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import type { Artifact, Message, Session, SessionInfo, Todo, ToolEvent } from '../core/types.ts';

export const antigravityRoot = (): string => process.env.HOTSWAP_ANTIGRAVITY_DIR ?? join(homedir(), '.gemini', 'antigravity');

const OVERVIEW = join('.system_generated', 'logs', 'overview.txt');
const ARTIFACTS = ['task.md', 'implementation_plan.md', 'walkthrough.md'] as const;
const ARTIFACT_CAP = 12_000;
/** Antigravity cuts long messages at about this many characters in its own log. */
const CUT_AT = 900;

type Json = Record<string, any>;

export function discoverAntigravity(root = antigravityRoot()): SessionInfo[] {
  const brain = join(root, 'brain');
  if (!existsSync(brain)) return [];
  const out: SessionInfo[] = [];
  for (const d of readdirSync(brain, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const path = join(brain, d.name, OVERVIEW);
    if (!existsSync(path)) continue;
    const st = statSync(path);
    out.push({ tool: 'antigravity', id: d.name, path, mtimeMs: st.mtimeMs, bytes: st.size });
  }
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

/** Paths in Antigravity's arguments can arrive wrapped in quotes with doubled backslashes. */
export const cleanPath = (p: unknown): string => String(p ?? '').trim().replace(/^"(.*)"$/s, '$1').replace(/\\\\/g, '\\');

const oneLine = (s: unknown, max: number): string => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

function describeTool(name: string, a: Json): ToolEvent {
  const ev: ToolEvent = { name, summary: name, written: [], read: [] };
  switch (name) {
    case 'run_command':
      ev.command = oneLine(a.CommandLine, 300);
      ev.summary = oneLine(a.toolSummary || a.CommandLine, 160);
      break;
    case 'write_to_file':
    case 'replace_file_content':
    case 'multi_replace_file_content':
      if (a.TargetFile) ev.written.push(cleanPath(a.TargetFile));
      ev.summary = `${name} ${cleanPath(a.TargetFile)}`.trim();
      break;
    case 'view_file':
      if (a.AbsolutePath) ev.read.push(cleanPath(a.AbsolutePath));
      ev.summary = `view_file ${cleanPath(a.AbsolutePath)}`.trim();
      break;
    case 'grep_search':
      ev.summary = `grep_search ${oneLine(a.Query, 100)}`;
      break;
    case 'list_dir':
      ev.summary = `list_dir ${cleanPath(a.DirectoryPath)}`.trim();
      break;
    case 'browser_subagent':
      ev.summary = `browser: ${oneLine(a.TaskName ?? a.TaskSummary, 120)}`;
      break;
    default:
      ev.summary = oneLine(a.toolSummary || name, 160);
  }
  return ev;
}

function readArtifacts(brainDir: string): Artifact[] {
  const out: Artifact[] = [];
  for (const name of ARTIFACTS) {
    const p = join(brainDir, name);
    if (!existsSync(p)) continue;
    const text = readFileSync(p, 'utf8');
    out.push({ name, text: text.length > ARTIFACT_CAP ? text.slice(0, ARTIFACT_CAP) : text, truncated: text.length > ARTIFACT_CAP });
  }
  return out;
}

/** "- [ ] item", "- [/] item" (in progress), "- [x] item" */
export function todosFromMarkdown(md: string): Todo[] {
  const out: Todo[] = [];
  for (const m of md.matchAll(/^\s*[-*]\s+\[([ xX/])\]\s+(.+)$/gm)) {
    const mark = m[1];
    out.push({ text: m[2].trim(), status: mark === ' ' ? 'pending' : mark === '/' ? 'in_progress' : 'completed' });
  }
  return out;
}

export function readAntigravity(overviewPath: string): Session {
  const brainDir = join(overviewPath, '..', '..', '..');
  const id = basename(brainDir);
  const notes: string[] = [];
  const messages: Message[] = [];
  const cwds = new Map<string, number>();
  const files: string[] = [];
  let first: string | undefined;
  let last: string | undefined;
  let cleared = 0;
  let steps = 0;
  let bad = 0;
  let cut = 0;
  let users = 0;

  const rows: Json[] = [];
  for (const ln of readFileSync(overviewPath, 'utf8').split('\n')) {
    if (!ln.trim()) continue;
    try { rows.push(JSON.parse(ln) as Json); } catch { bad += 1; }
  }
  rows.sort((a, b) => (a.step_index ?? 0) - (b.step_index ?? 0));

  for (const o of rows) {
    steps += 1;
    if (o.created_at) { first ??= o.created_at; last = o.created_at; }
    if (o.status === 'CLEARED') cleared += 1;
    if (o.type === 'USER_INPUT' && typeof o.content === 'string' && o.content.trim()) {
      users += 1;
      const text = o.content.trim();
      const truncated = text.length >= CUT_AT && /truncated/i.test(text);
      if (truncated) cut += 1;
      messages.push({ id: `step-${o.step_index}`, role: 'user', ts: o.created_at, text, tools: [], ...(truncated ? { truncated: true } : {}) });
    } else if (o.type === 'PLANNER_RESPONSE') {
      let turn = messages[messages.length - 1];
      if (!turn || turn.role !== 'assistant') {
        turn = { id: `step-${o.step_index}`, role: 'assistant', ts: o.created_at, text: '', tools: [] };
        messages.push(turn);
      }
      if (typeof o.content === 'string' && o.content.trim()) {
        const text = o.content.trim();
        turn.text += (turn.text ? '\n\n' : '') + text;
        if (text.length >= CUT_AT && /truncated/i.test(text)) turn.truncated = true;
      }
      for (const tc of (o.tool_calls ?? []) as Json[]) {
        const ev = describeTool(String(tc.name), (tc.args ?? {}) as Json);
        turn.tools.push(ev);
        const cwd = tc.args?.Cwd ? cleanPath(tc.args.Cwd) : '';
        if (cwd) cwds.set(cwd, (cwds.get(cwd) ?? 0) + 1);
        files.push(...ev.written, ...ev.read);
      }
    }
  }

  const artifacts = readArtifacts(brainDir);
  const task = artifacts.find((a) => a.name === 'task.md');
  const todos = task ? todosFromMarkdown(task.text) : [];

  // the working folder is the one commands ran in most often; otherwise the common start of the files it touched
  let cwd: string | undefined = [...cwds.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!cwd && files.length) cwd = commonDir(files);

  if (bad) notes.push(`${bad} unreadable line(s) were skipped.`);
  if (cut) notes.push(`Antigravity itself cut ${cut} of ${users} user message(s) at about 1,000 characters in its own log, so they are incomplete here.`);
  if (cleared) notes.push(`Antigravity marked ${cleared} of ${steps} steps as cleared; detail inside those steps is not available.`);
  notes.push('Source tier is Partial: Antigravity keeps its full conversation in files that are not readable outside the app.');

  return {
    source: { tool: 'antigravity', sessionId: id, title: firstLine(messages), path: overviewPath, startedAt: first, endedAt: last },
    cwd, messages, todos, artifacts, notes,
  };
}

const firstLine = (messages: Message[]): string | undefined => {
  const u = messages.find((m) => m.role === 'user');
  return u ? oneLine(u.text, 80) : undefined;
};

function commonDir(paths: string[]): string | undefined {
  const parts = paths.map((p) => p.replace(/\\/g, '/').split('/').slice(0, -1));
  let prefix = parts[0] ?? [];
  for (const p of parts) {
    let i = 0;
    while (i < prefix.length && i < p.length && prefix[i] === p[i]) i += 1;
    prefix = prefix.slice(0, i);
  }
  return prefix.length > 1 ? prefix.join('/') : undefined;
}
