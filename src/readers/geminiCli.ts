// Reads Gemini CLI sessions: ~/.gemini/tmp/<project>/chats/*.json or *.jsonl (and the older ~/.gemini/sessions/*.json).
// EXPERIMENTAL: there is no Gemini CLI session on the machine this was built on, so the format is taken from the parser in the
// MIT-licensed cli-continues project (https://github.com/yigitkonur/cli-continues, src/parsers/gemini.ts), not seen first hand.
// Not to be confused with Antigravity, which lives in ~/.gemini/antigravity and has its own reader. Read-only; never opens
// oauth_creds.json, google_accounts.json or settings.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import type { Message, Session, SessionInfo, ToolEvent } from '../core/types.ts';

export const geminiRoot = (): string => process.env.HOTSWAP_GEMINI_DIR ?? join(homedir(), '.gemini');

type Json = Record<string, any>;

function listChats(root: string): string[] {
  const out: string[] = [];
  const tmp = join(root, 'tmp');
  if (existsSync(tmp)) {
    for (const proj of readdirSync(tmp, { withFileTypes: true })) {
      if (!proj.isDirectory()) continue;
      const chats = join(tmp, proj.name, 'chats');
      if (!existsSync(chats)) continue;
      for (const f of readdirSync(chats)) if (f.endsWith('.json') || f.endsWith('.jsonl')) out.push(join(chats, f));
    }
  }
  const legacy = join(root, 'sessions');
  if (existsSync(legacy)) for (const f of readdirSync(legacy)) if (f.endsWith('.json')) out.push(join(legacy, f));
  return out;
}

/** projects.json maps a working folder to the project id used as the folder name under tmp/. */
function projectDirs(root: string): Map<string, string> {
  try {
    const o = JSON.parse(readFileSync(join(root, 'projects.json'), 'utf8')) as { projects?: Record<string, string> };
    return new Map(Object.entries(o.projects ?? {}).map(([cwd, id]) => [id, cwd]));
  } catch { return new Map(); }
}

const projectOf = (file: string): string => basename(join(file, '..', '..'));

export function discoverGeminiCli(root = geminiRoot()): SessionInfo[] {
  const dirs = projectDirs(root);
  return listChats(root).map((path) => {
    const st = statSync(path);
    return { tool: 'gemini-cli' as const, id: basename(path).replace(/\.jsonl?$/, ''), path, mtimeMs: st.mtimeMs, bytes: st.size, cwd: dirs.get(projectOf(path)) };
  }).sort((a, b) => b.mtimeMs - a.mtimeMs);
}

const contentText = (c: unknown): string => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((x: Json) => (typeof x === 'string' ? x : x?.text ?? '')).join('') : '');
const oneLine = (s: unknown, max: number): string => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > max ? `${t.slice(0, max - 1)}…` : t; };
const isMessage = (o: Json): boolean => o.type === 'user' || o.type === 'gemini' || o.type === 'info' || o.type === 'warning' || o.type === 'error';

/** Both layouts: one JSON object with a messages array, or JSON Lines with $set / $rewindTo control lines. */
function load(path: string): { state: Json; messages: Json[]; bad: number } {
  const text = readFileSync(path, 'utf8');
  if (path.endsWith('.json')) {
    const o = JSON.parse(text) as Json;
    return { state: o, messages: Array.isArray(o.messages) ? o.messages : [], bad: 0 };
  }
  const state: Json = {};
  const messages: Json[] = [];
  let bad = 0;
  for (const l of text.split('\n')) {
    if (!l.trim()) continue;
    let o: Json;
    try { o = JSON.parse(l) as Json; } catch { bad += 1; continue; }
    if (o.$set && typeof o.$set === 'object') { Object.assign(state, o.$set); continue; }
    if (typeof o.$rewindTo === 'string') {
      const i = messages.map((m) => m.id).lastIndexOf(o.$rewindTo);
      if (i >= 0) messages.length = i;
      continue;
    }
    if (isMessage(o)) {
      const at = o.id ? messages.findIndex((m) => m.id === o.id) : -1;
      if (at >= 0) messages[at] = o; else messages.push(o);
    } else Object.assign(state, o);
  }
  return { state, messages, bad };
}

function toolEvent(tc: Json): ToolEvent {
  const name = String(tc.name ?? 'tool');
  const a: Json = tc.args ?? {};
  const file = a.file_path ?? a.absolute_path ?? a.path;
  if (name === 'run_shell_command' || name === 'shell') {
    const cmd = oneLine(a.command, 300);
    return { name: 'shell', summary: oneLine(cmd, 160), command: cmd, written: [], read: [], ok: tc.status === 'success' ? true : tc.status === 'error' ? false : undefined };
  }
  if (name === 'write_file' || name === 'replace' || name === 'edit') return { name, summary: `${name} ${file ?? ''}`.trim(), written: file ? [String(file)] : [], read: [] };
  if (name === 'read_file' || name === 'read_many_files') return { name, summary: `${name} ${file ?? ''}`.trim(), written: [], read: file ? [String(file)] : [] };
  return { name, summary: name, written: [], read: [] };
}

export function readGeminiCli(path: string): Session {
  const { state, messages: raw, bad } = load(path);
  const messages: Message[] = [];
  for (const m of raw) {
    if (m.type === 'user') {
      const t = contentText(m.content).trim();
      if (t) messages.push({ id: String(m.id ?? `${messages.length}`), role: 'user', ts: m.timestamp, text: t, tools: [] });
    } else if (m.type === 'gemini') {
      const t = contentText(m.content).trim();
      const tools = (Array.isArray(m.toolCalls) ? m.toolCalls : []).map(toolEvent);
      if (!t && !tools.length) continue;
      const last = messages[messages.length - 1];
      if (last?.role === 'assistant') { last.text = [last.text, t].filter(Boolean).join('\n\n'); last.tools.push(...tools); }
      else messages.push({ id: String(m.id ?? `${messages.length}`), role: 'assistant', ts: m.timestamp, text: t, tools });
    }
  }
  const notes = ['The Gemini CLI reader is experimental: its format comes from another open-source tool\'s parser, not from a Gemini CLI session seen on this machine. Check this capsule against your session.'];
  if (bad) notes.push(`${bad} line(s) of the session file could not be read and were skipped.`);
  const dirs = projectDirs(join(path, '..', '..', '..', '..'));
  return {
    source: { tool: 'gemini-cli', sessionId: String(state.sessionId ?? basename(path).replace(/\.jsonl?$/, '')), path, startedAt: state.startTime, endedAt: state.lastUpdated },
    cwd: (Array.isArray(state.directories) ? state.directories.find((d: unknown) => typeof d === 'string' && d) : undefined) ?? dirs.get(projectOf(path)),
    messages,
    todos: [],
    artifacts: [],
    notes,
  };
}
