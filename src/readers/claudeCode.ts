// Reads Claude Code sessions: ~/.claude/projects/<project-folder>/<session-id>.jsonl, one JSON object per line.
// Layout verified on a real machine (see PHASE0.md). Read-only. Hidden reasoning ("thinking" blocks) is never exported.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import type { LimitInfo, Message, Session, SessionInfo, ToolEvent, Todo } from '../core/types.ts';

export const claudeRoot = (): string => process.env.HOTSWAP_CLAUDE_DIR ?? join(homedir(), '.claude', 'projects');

export function discoverClaude(root = claudeRoot()): SessionInfo[] {
  if (!existsSync(root)) return [];
  const out: SessionInfo[] = [];
  for (const folder of readdirSync(root, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue;
    for (const f of readdirSync(join(root, folder.name))) {
      if (!f.endsWith('.jsonl')) continue;
      const path = join(root, folder.name, f);
      const st = statSync(path);
      out.push({ tool: 'claude-code', id: basename(f, '.jsonl'), path, mtimeMs: st.mtimeMs, bytes: st.size, cwd: peekCwd(path) });
    }
  }
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

/** The working folder is on almost every line, so the first few lines are enough. */
function peekCwd(path: string): string | undefined {
  try {
    const head = readFileSync(path, { encoding: 'utf8', flag: 'r' }).slice(0, 60_000).split('\n');
    for (const ln of head) {
      const m = /"cwd":"((?:[^"\\]|\\.)*)"/.exec(ln);
      if (m) return JSON.parse(`"${m[1]}"`) as string;
    }
  } catch {
    // unreadable file: no folder shown
  }
  return undefined;
}

type Json = Record<string, any>;

// Text Claude Code injects around the real user words. It is not part of the conversation.
const WRAPPERS = /<(system-reminder|local-command-stdout|local-command-stderr|local-command-caveat|command-name|command-message|command-args|ide_[a-z_]+)>[\s\S]*?<\/\1>/g;
const cleanUserText = (t: string): string => t.replace(WRAPPERS, '').trim();

const LIMIT_RE = /hit your .{0,30}limit/i;
const RESETS_RE = /resets\s+(.+?)\s*$/i;

export function parseLimit(text: string): { resets?: string } {
  const m = RESETS_RE.exec(text.trim());
  return m ? { resets: m[1].replace(/^[\s·•·�-]+/, '').trim() } : {};
}

/** True for the line Claude Code writes when the plan limit is hit: error "rate_limit", HTTP 429. */
export function isRateLimitEntry(o: Json): boolean {
  return o.isApiErrorMessage === true && (o.error === 'rate_limit' || o.apiErrorStatus === 429 || LIMIT_RE.test(entryText(o)));
}

export function entryText(o: Json): string {
  const c = o.message?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((b: Json) => (typeof b?.text === 'string' ? b.text : '')).join('\n');
  return '';
}

function oneLine(s: unknown, max: number): string {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function describeTool(name: string, input: Json): ToolEvent {
  const ev: ToolEvent = { name, summary: name, written: [], read: [] };
  const file = (input.file_path ?? input.path ?? input.notebook_path) as string | undefined;
  switch (name) {
    case 'Bash':
    case 'PowerShell':
      ev.command = oneLine(input.command, 300);
      ev.summary = oneLine(input.description || input.command, 160);
      break;
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
    case 'NotebookEdit':
      if (file) ev.written.push(file);
      ev.summary = `${name} ${file ?? ''}`.trim();
      break;
    case 'Read':
      if (file) ev.read.push(file);
      ev.summary = `Read ${file ?? ''}`.trim();
      break;
    case 'Grep':
    case 'Glob':
      ev.summary = `${name} ${oneLine(input.pattern, 100)}`;
      break;
    case 'WebFetch':
    case 'WebSearch':
      ev.summary = `${name} ${oneLine(input.url ?? input.query, 120)}`;
      break;
    default:
      ev.summary = name.startsWith('mcp__') ? `MCP ${name.split('__').slice(2).join('.') || name}` : name;
  }
  return ev;
}

function resultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((b: Json) => (typeof b?.text === 'string' ? b.text : '')).join('\n');
  return '';
}

function normaliseTodos(input: Json): Todo[] | null {
  const list = Array.isArray(input.todos) ? input.todos : Array.isArray(input.tasks) ? input.tasks : null;
  if (!list) return null;
  const out: Todo[] = [];
  for (const t of list as Json[]) {
    const text = String(t.content ?? t.subject ?? t.text ?? '').trim();
    if (!text) continue;
    const s = String(t.status ?? 'pending');
    out.push({ text, status: s === 'completed' ? 'completed' : s === 'in_progress' ? 'in_progress' : 'pending' });
  }
  return out;
}

export function readClaude(path: string): Session {
  const text = readFileSync(path, 'utf8');
  const notes: string[] = [];
  const messages: Message[] = [];
  const toolById = new Map<string, ToolEvent>();
  let todos: Todo[] = [];
  const taskMap = new Map<string, Todo>();
  let cwd: string | undefined;
  let gitBranch: string | undefined;
  let title: string | undefined;
  let slug: string | undefined;
  let first: string | undefined;
  let last: string | undefined;
  let limit: LimitInfo | undefined;
  let bad = 0;
  let skippedSide = 0;
  let thinking = 0;

  const lines = text.split('\n');
  let seq = 0;
  for (const ln of lines) {
    if (!ln.trim()) continue;
    let o: Json;
    try { o = JSON.parse(ln) as Json; } catch { bad += 1; continue; }
    if (o.timestamp) { first ??= o.timestamp; last = o.timestamp; }
    if (o.cwd) cwd = o.cwd;
    if (o.gitBranch) gitBranch = o.gitBranch;
    if (o.slug) slug = o.slug;
    if (o.type === 'custom-title' && o.customTitle) title = String(o.customTitle);
    if (o.isSidechain) { skippedSide += 1; continue; }

    if (o.type === 'assistant') {
      if (isRateLimitEntry(o)) {
        const t = entryText(o);
        limit = { kind: 'rate_limit', text: oneLine(t, 240), at: o.timestamp, isLatest: true, ...parseLimit(t) };
        continue;
      }
      if (o.isApiErrorMessage) continue; // other API errors are noise, not conversation
      const content = Array.isArray(o.message?.content) ? (o.message.content as Json[]) : [];
      const mid: string = o.message?.id ?? o.uuid ?? `a${seq}`;
      let turn = messages[messages.length - 1];
      if (!turn || turn.role !== 'assistant') {
        turn = { id: mid, role: 'assistant', ts: o.timestamp, text: '', tools: [] };
        messages.push(turn);
      }
      for (const b of content) {
        if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) turn.text += (turn.text ? '\n\n' : '') + b.text.trim();
        else if (b.type === 'thinking') thinking += 1;
        else if (b.type === 'tool_use') {
          const ev = describeTool(String(b.name), (b.input ?? {}) as Json);
          turn.tools.push(ev);
          if (b.id) toolById.set(String(b.id), ev);
          const inp = (b.input ?? {}) as Json;
          if (b.name === 'TodoWrite') { const t = normaliseTodos(inp); if (t) todos = t; }
          if (b.name === 'TaskCreate' || b.name === 'TaskUpdate') {
            const full = normaliseTodos(inp);
            if (full && full.length) { todos = full; continue; }
            const key = String(inp.taskId ?? inp.subject ?? '');
            const text2 = String(inp.subject ?? taskMap.get(key)?.text ?? '').trim();
            if (key && text2) {
              const s = String(inp.status ?? taskMap.get(key)?.status ?? 'pending');
              taskMap.set(key, { text: text2, status: s === 'completed' ? 'completed' : s === 'in_progress' ? 'in_progress' : 'pending' });
              todos = [...taskMap.values()];
            }
          }
        }
      }
      continue;
    }

    if (o.type === 'user') {
      if (o.isMeta) continue;
      const c = o.message?.content;
      const texts: string[] = [];
      const attachments: string[] = [];
      if (typeof c === 'string') texts.push(c);
      else if (Array.isArray(c)) {
        for (const b of c as Json[]) {
          if (b.type === 'text' && typeof b.text === 'string') texts.push(b.text);
          else if (b.type === 'tool_result') {
            const ev = toolById.get(String(b.tool_use_id));
            if (ev) {
              ev.ok = b.is_error !== true;
              ev.result = oneLine(resultText(b.content), 240);
            }
          } else if (b.type === 'image' || b.type === 'document') attachments.push(String(b.type));
        }
      }
      const body = cleanUserText(texts.join('\n'));
      if (!body && attachments.length === 0) continue; // a tool result or injected reminder only
      messages.push({ id: String(o.uuid ?? `u${seq}`), role: 'user', ts: o.timestamp, text: body, tools: [], ...(attachments.length ? { attachments } : {}) });
      if (limit) limit.isLatest = false;
    }
    seq += 1;
  }

  // the limit notice is "latest" only if no real turn followed it
  if (limit?.at) {
    const after = messages.some((m) => (m.ts ?? '') > (limit?.at ?? ''));
    limit.isLatest = !after;
  }
  if (bad) notes.push(`${bad} unreadable line(s) were skipped.`);
  if (skippedSide) notes.push(`${skippedSide} sub-agent line(s) were left out (their work shows up in the main conversation's results).`);
  if (thinking) notes.push(`${thinking} hidden-reasoning block(s) are not exported by design.`);
  const imgs = messages.reduce((n, m) => n + (m.attachments?.length ?? 0), 0);
  if (imgs) notes.push(`${imgs} image/document attachment(s) cannot travel in a text capsule; they are listed by position only.`);

  const id = basename(path, '.jsonl');
  return {
    source: { tool: 'claude-code', sessionId: id, title: title ?? slug, path, startedAt: first, endedAt: last },
    cwd, gitBranch, messages, todos, artifacts: [], ...(limit ? { limit } : {}), notes,
  };
}
