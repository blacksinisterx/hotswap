// Turns a Session into a capsule: a state card, the last turns verbatim, every final code block, and a fidelity report.
// Deterministic: no model, no network. Everything written passes through the redactor first, and a failure stops the export.
import { sha256Hex } from './hash.ts';
import { mergeHits, redact } from './redact.ts';
import type { Redactor } from './redact.ts';
import type { Artifact, LimitInfo, Message, Session, Source, Todo } from './types.ts';

export type Preset = 'minimal' | 'standard' | 'verbose' | 'full';
export const PRESETS: Record<Preset, number> = { minimal: 3, standard: 10, verbose: 20, full: Number.POSITIVE_INFINITY };
export type Tier = 'verbatim' | 'hybrid' | 'partial';

export const MESSAGE_CAP = 20_000; // characters kept per turn
export const VAULT_MAX_BLOCKS = 30;
export const VAULT_MAX_BYTES = 80_000;

export interface CodeBlock { lang: string; text: string; sha256: string; messageId: string }
export interface Fidelity {
  tier: Tier;
  messagesRead: number;
  messagesInTail: number;
  turnsCutByCap: number;
  turnsCutBySource: number;
  codeBlocksFound: number;
  codeBlocksInVault: number;
  toolEventsRead: number;
  attachmentsNotCarried: number;
  redactions: Record<string, number>;
  notes: string[];
}
export interface CommandRun { command: string; ok?: boolean; result?: string }
export interface Capsule {
  schema: 1;
  id: string;
  createdAt: string;
  preset: Preset;
  source: Source;
  workspace: { cwd?: string; gitBranch?: string };
  goal: string;
  latestRequest: string;
  openTasks: Todo[];
  files: string[];
  commands: CommandRun[];
  lastError?: string;
  tail: Message[];
  vault: CodeBlock[];
  artifacts: Artifact[];
  limit?: LimitInfo;
  fidelity: Fidelity;
}

export class RedactionFailed extends Error {
  constructor(cause: unknown) {
    super(`Redaction failed, so nothing was exported (${cause instanceof Error ? cause.message : String(cause)}).`);
    this.name = 'RedactionFailed';
  }
}

const sha = (s: string) => sha256Hex(s);
const cap = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

export interface BuildOptions { preset?: Preset; now?: Date; redactor?: Redactor }

/** Fenced code blocks in a message: ```lang ... ``` */
export function codeBlocks(text: string): { lang: string; text: string }[] {
  const out: { lang: string; text: string }[] = [];
  for (const m of text.matchAll(/(^|\n)(`{3,})([\w+#.-]*)[^\n]*\n([\s\S]*?)\n\2(?=\n|$)/g)) out.push({ lang: m[3] || 'text', text: m[4] });
  return out;
}

export function buildCapsule(session: Session, opts: BuildOptions = {}): Capsule {
  const preset = opts.preset ?? 'standard';
  const seen = new Set<string>();
  const redactor = opts.redactor ?? ((t: string) => redact(t, undefined, seen));
  const hits: Record<string, number> = {};
  const safe = (text: string): string => {
    try {
      const r = redactor(text);
      if (typeof r?.text !== 'string') throw new TypeError('the redactor returned no text');
      mergeHits(hits, r.hits ?? {});
      return r.text;
    } catch (e) {
      throw new RedactionFailed(e);
    }
  };

  const msgs = session.messages;
  const users = msgs.filter((m) => m.role === 'user');
  const n = PRESETS[preset];
  const tailSrc = Number.isFinite(n) ? msgs.slice(-n) : msgs;
  let cutByCap = 0;
  const tail: Message[] = tailSrc.map((m) => {
    let text = m.text;
    if (text.length > MESSAGE_CAP) { text = `${text.slice(0, MESSAGE_CAP)}\n[... cut by Hotswap at ${MESSAGE_CAP} characters ...]`; cutByCap += 1; }
    return {
      ...m,
      text: safe(text),
      tools: m.tools.map((t) => ({ ...t, summary: safe(t.summary), command: t.command ? safe(t.command) : undefined, result: t.result ? safe(t.result) : undefined })),
    };
  });

  // code vault: the last version of each block (same language and same first line), newest kept when over the cap
  const found: { lang: string; text: string; messageId: string }[] = [];
  for (const m of msgs) if (m.role === 'assistant') for (const b of codeBlocks(m.text)) found.push({ ...b, messageId: m.id });
  const latest = new Map<string, { lang: string; text: string; messageId: string }>();
  for (const b of found) latest.set(`${b.lang}|${(b.text.split('\n').find((l) => l.trim()) ?? '').trim().slice(0, 80)}`, b);
  let vault: CodeBlock[] = [...latest.values()].map((b) => {
    const text = safe(b.text);
    return { lang: b.lang, text, sha256: sha(text), messageId: b.messageId };
  });
  let bytes = vault.reduce((a, b) => a + b.text.length, 0);
  while (vault.length > VAULT_MAX_BLOCKS || bytes > VAULT_MAX_BYTES) { bytes -= vault[0].text.length; vault = vault.slice(1); }

  const toolEvents = msgs.flatMap((m) => m.tools);
  const written: string[] = [];
  for (const t of toolEvents) for (const f of t.written) { const i = written.indexOf(f); if (i >= 0) written.splice(i, 1); written.push(f); }
  const rel = (f: string) => (session.cwd && f.replace(/\\/g, '/').toLowerCase().startsWith(`${session.cwd.replace(/\\/g, '/').toLowerCase()}/`) ? f.slice(session.cwd.length + 1) : f);
  const files = written.slice(-40).map((f) => safe(rel(f)));
  const commands: CommandRun[] = toolEvents.filter((t) => t.command).slice(-8).map((t) => ({ command: safe(t.command!), ok: t.ok, result: t.result ? safe(cap(t.result, 160)) : undefined }));
  const failed = [...toolEvents].reverse().find((t) => t.ok === false);

  const attachments = msgs.reduce((a, m) => a + (m.attachments?.length ?? 0), 0);
  const cutBySource = msgs.filter((m) => m.truncated).length;
  const tier: Tier = session.source.tool === 'antigravity' || cutBySource > 0 || session.incomplete ? 'partial' : preset === 'full' && cutByCap === 0 && vault.length === found.length ? 'verbatim' : 'hybrid';

  const notes = session.notes.map(safe);
  if (vault.length < found.length) notes.push(`${found.length - vault.length} code block(s) are not in the vault: older versions of the same block were replaced by the newest, or the vault size cap was reached.`);
  if (Number.isFinite(n) && msgs.length > n) notes.push(`Only the last ${n} of ${msgs.length} turns are included word for word; the state card covers the rest.`);

  const capsule: Capsule = {
    schema: 1,
    id: sha(`${session.source.sessionId}|${session.source.endedAt ?? ''}|${preset}`).slice(0, 10),
    createdAt: (opts.now ?? new Date()).toISOString(),
    preset,
    source: { ...session.source, title: session.source.title ? safe(session.source.title) : undefined },
    workspace: { cwd: session.cwd, gitBranch: session.gitBranch },
    goal: safe(cap(users[0]?.text ?? '(no user message found)', 800)),
    latestRequest: safe(cap(users[users.length - 1]?.text ?? '(no user message found)', 1200)),
    openTasks: session.todos.filter((t) => t.status !== 'completed').map((t) => ({ ...t, text: safe(t.text) })),
    files,
    commands,
    ...(failed ? { lastError: safe(cap(`${failed.summary}${failed.result ? `: ${failed.result}` : ''}`, 300)) } : {}),
    tail,
    vault,
    artifacts: session.artifacts.map((a) => ({ ...a, text: safe(a.text) })),
    // a limit from earlier in the session is history; only a notice nothing has followed is a reason to switch
    ...(session.limit?.isLatest ? { limit: { ...session.limit, text: safe(session.limit.text) } } : {}),
    fidelity: {
      tier, messagesRead: msgs.length, messagesInTail: tail.length, turnsCutByCap: cutByCap, turnsCutBySource: cutBySource,
      codeBlocksFound: found.length, codeBlocksInVault: vault.length, toolEventsRead: toolEvents.length,
      attachmentsNotCarried: attachments, redactions: hits, notes,
    },
  };
  return capsule;
}
