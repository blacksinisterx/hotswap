// Reads Codex CLI sessions: ~/.codex/sessions/**/rollout-*.jsonl (and archived_sessions). EXPERIMENTAL: there is no Codex session on the
// machine this was built on, so the format below is taken from the parser in the MIT-licensed cli-continues project
// (https://github.com/yigitkonur/cli-continues, src/parsers/codex.ts), not seen first hand. The capsule's fidelity report says so.
// Read-only. Only the rollout files are opened, never auth.json or config.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import type { Message, Session, SessionInfo, ToolEvent } from '../core/types.ts';

export const codexRoot = (): string => process.env.HOTSWAP_CODEX_DIR ?? process.env.CODEX_HOME ?? join(homedir(), '.codex');

type Json = Record<string, any>;

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.startsWith('rollout-') && e.name.endsWith('.jsonl')) out.push(p);
  }
}

const idFromName = (file: string): string => /rollout-\d{4}-\d{2}-\d{2}T[\d-]+-(.+)\.jsonl$/.exec(basename(file))?.[1] ?? basename(file, '.jsonl');

/** cwd lives in the first line (session_meta); only the first lines are read. */
function headMeta(path: string): { cwd?: string } {
  const text = readFileSync(path, 'utf8').slice(0, 200_000);
  for (const line of text.split('\n').slice(0, 60)) {
    try {
      const o = JSON.parse(line) as Json;
      if (o.type === 'session_meta') return { cwd: o.payload?.cwd };
    } catch { /* partial line */ }
  }
  return {};
}

export function discoverCodex(root = codexRoot()): SessionInfo[] {
  const files: string[] = [];
  walk(join(root, 'sessions'), files);
  walk(join(root, 'archived_sessions'), files);
  return files.map((path) => {
    const st = statSync(path);
    return { tool: 'codex' as const, id: idFromName(path), path, mtimeMs: st.mtimeMs, bytes: st.size, cwd: headMeta(path).cwd };
  }).sort((a, b) => b.mtimeMs - a.mtimeMs);
}

const INJECTED = ['<environment_context>', '<permissions', '# AGENTS.md', '<user_instructions>', '<user_shell_command>'];
const oneLine = (s: unknown, max: number): string => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > max ? `${t.slice(0, max - 1)}…` : t; };
const textOf = (parts: unknown, kinds: string[]): string => (Array.isArray(parts) ? parts : []).filter((c: Json) => kinds.includes(c?.type) && c.text).map((c: Json) => c.text).join('\n');

/** Files named in an apply_patch body: "*** Update File: x", "*** Add File: x", "*** Delete File: x". */
const patchFiles = (patch: string): string[] => [...patch.matchAll(/^\*\*\* (?:Update|Add|Delete) File: (.+)$/gm)].map((m) => m[1]!.trim());

function exitCodeOf(output: unknown): number | undefined {
  if (typeof output !== 'string') return undefined;
  try { const o = JSON.parse(output) as Json; const c = o?.metadata?.exit_code ?? o?.exit_code; return typeof c === 'number' ? c : undefined; } catch { /* plain text */ }
  const m = /exit code[: ]+(\d+)/i.exec(output);
  return m ? Number(m[1]) : undefined;
}

export function readCodex(path: string): Session {
  const lines = readFileSync(path, 'utf8').split('\n');
  const entries: Json[] = [];
  let bad = 0;
  for (const l of lines) {
    if (!l.trim()) continue;
    try { entries.push(JSON.parse(l)); } catch { bad += 1; }
  }
  const meta = entries.find((e) => e.type === 'session_meta')?.payload ?? {};
  const outputs = new Map<string, unknown>();
  for (const e of entries) {
    const p = e.payload;
    if (e.type === 'response_item' && (p?.type === 'function_call_output' || p?.type === 'custom_tool_call_output') && p.call_id) outputs.set(p.call_id, p.output);
  }

  const fromItems: Message[] = [];
  const fromEvents: Message[] = [];
  const push = (list: Message[], role: 'user' | 'assistant', text: string, ts?: string): Message => {
    const last = list[list.length - 1];
    if (role === 'assistant' && last?.role === 'assistant') { last.text = last.text ? `${last.text}\n\n${text}` : text; return last; }
    const m: Message = { id: `${basename(path)}:${list.length}`, role, ts, text, tools: [] };
    list.push(m);
    return m;
  };
  const lastAssistant = (list: Message[], ts?: string): Message => (list[list.length - 1]?.role === 'assistant' ? list[list.length - 1]! : push(list, 'assistant', '', ts));

  for (const e of entries) {
    const p = e.payload as Json | undefined;
    if (!p) continue;
    if (e.type === 'event_msg') {
      if (p.type === 'user_message' && p.message) push(fromEvents, 'user', String(p.message), e.timestamp);
      else if ((p.type === 'agent_message' || p.type === 'assistant_message') && p.message) push(fromEvents, 'assistant', String(p.message), e.timestamp);
    } else if (e.type === 'response_item') {
      if (p.type === 'message' && p.role === 'user') {
        const t = textOf(p.content, ['input_text']);
        if (t && !INJECTED.some((x) => t.startsWith(x))) push(fromItems, 'user', t, e.timestamp);
      } else if (p.type === 'message' && p.role === 'assistant') {
        const t = textOf(p.content, ['output_text', 'text']);
        if (t) push(fromItems, 'assistant', t, e.timestamp);
      } else if (p.type === 'function_call' || p.type === 'custom_tool_call') {
        const ev = toolEvent(p, outputs);
        if (ev) lastAssistant(fromItems, e.timestamp).tools.push(ev);
      }
    }
  }
  const useItems = fromItems.some((m) => m.role === 'user' || m.role === 'assistant');
  const messages = (useItems ? fromItems : fromEvents).filter((m) => m.text || m.tools.length);

  const notes = ['The Codex reader is experimental: its format comes from another open-source tool\'s parser, not from a Codex session seen on this machine. Check this capsule against your session.'];
  if (!useItems && fromEvents.length) notes.push('Messages were read from the short event log; tool activity is not included.');
  if (bad) notes.push(`${bad} line(s) of the session file could not be read and were skipped.`);
  return {
    source: { tool: 'codex', sessionId: String(meta.id ?? idFromName(path)), path, startedAt: entries[0]?.timestamp, endedAt: entries[entries.length - 1]?.timestamp },
    cwd: meta.cwd,
    gitBranch: meta.git?.branch,
    messages,
    todos: [],
    artifacts: [],
    notes,
  };
}

function toolEvent(p: Json, outputs: Map<string, unknown>): ToolEvent | undefined {
  const name = String(p.name ?? '');
  const out = p.call_id ? outputs.get(p.call_id) : undefined;
  if (p.type === 'custom_tool_call') {
    if (name !== 'apply_patch') return { name, summary: name, written: [], read: [] };
    const files = patchFiles(String(p.input ?? ''));
    return { name: 'apply_patch', summary: `apply_patch ${files.join(', ')}`.trim(), written: files, read: [] };
  }
  let args: Json = {};
  try { args = JSON.parse(String(p.arguments ?? '{}')) as Json; } catch { /* keep empty */ }
  if (name === 'exec_command' || name === 'shell_command' || name === 'shell') {
    const raw = args.cmd ?? args.command;
    const cmd = Array.isArray(raw) ? raw.join(' ') : String(raw ?? '');
    if (!cmd) return undefined;
    const code = exitCodeOf(out);
    return { name: 'shell', summary: oneLine(cmd, 160), command: oneLine(cmd, 300), written: [], read: [], ok: code === undefined ? undefined : code === 0, result: typeof out === 'string' ? oneLine(out, 200) : undefined };
  }
  return { name, summary: name, written: [], read: [] };
}
