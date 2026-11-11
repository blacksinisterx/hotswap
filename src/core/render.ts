// Writes a capsule as one Markdown file that a person can read and any AI can take as an attachment or paste.
// The last block is a small JSON record with a hash of everything above it, so `hotswap check` can tell if the file was changed.
import { createHash } from 'node:crypto';
import type { Capsule } from './capsule.ts';
import type { Message } from './types.ts';

const TOOL_LABEL = { 'claude-code': 'Claude Code', antigravity: 'Antigravity' } as const;
const MARK = '<!-- hotswap:meta -->';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/** Fence long enough that code containing ``` cannot close it. */
function fence(text: string, lang = ''): string {
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  const f = '`'.repeat(longest + 1);
  return `${f}${lang}\n${text}\n${f}`;
}

/** An odd number of fence lines would swallow the rest of the file, so close it. */
function balance(text: string): string {
  const n = (text.match(/^\s*`{3,}/gm) ?? []).length;
  return n % 2 === 1 ? `${text}\n\`\`\`` : text;
}

/** Every turn is quoted, so headings or fences inside it cannot be mistaken for the capsule's own structure. Remove the "> " to get the exact text. */
const quote = (text: string): string => text.split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n');

const who = (m: Message) => (m.role === 'user' ? 'User' : 'Assistant');

export function renderCapsule(c: Capsule): string {
  const tool = TOOL_LABEL[c.source.tool];
  const L: string[] = [];
  L.push('# Hotswap handoff', '');
  L.push(`> You are taking over a task that was in progress in **${tool}**. Read this whole file, then continue from "Latest request" below.`);
  L.push('> Do not start over and do not redo work that is already finished. If anything here looks cut off or unclear, say so first, then carry on.', '');

  L.push('## State', '');
  L.push(`- **Goal (the first request):** ${c.goal.replace(/\n+/g, ' ')}`);
  L.push(`- **Latest request:** ${c.latestRequest.replace(/\n+/g, ' ')}`);
  if (c.workspace.cwd) L.push(`- **Working folder:** \`${c.workspace.cwd}\`${c.workspace.gitBranch ? `, git branch \`${c.workspace.gitBranch}\`` : ''}`);
  if (c.source.title) L.push(`- **Session:** ${c.source.title}`);
  if (c.limit) L.push(`- **Why the switch:** ${tool} reported a usage limit${c.limit.resets ? `; it resets at ${c.limit.resets}` : ''}.`);
  L.push('');

  if (c.openTasks.length) {
    L.push('### Open tasks', '');
    for (const t of c.openTasks) L.push(`- [${t.status === 'in_progress' ? '/' : ' '}] ${t.text}`);
    L.push('');
  }
  if (c.files.length) { L.push('### Files changed (most recent last)', ''); for (const f of c.files) L.push(`- \`${f}\``); L.push(''); }
  if (c.commands.length) {
    L.push('### Last commands', '');
    for (const r of c.commands) L.push(`- \`${r.command.replace(/`/g, "'")}\`${r.ok === false ? ' (failed)' : r.ok ? ' (ok)' : ''}${r.result ? `: ${r.result.replace(/\s+/g, ' ')}` : ''}`);
    L.push('');
  }
  if (c.lastError) L.push('### Last error', '', c.lastError, '');

  L.push(`## Recent conversation (last ${c.tail.length} turn${c.tail.length === 1 ? '' : 's'}, word for word; each turn is quoted with "> ")`, '');
  for (const m of c.tail) {
    L.push(`### ${who(m)}${m.ts ? ` · ${m.ts}` : ''}${m.truncated ? ' · (cut short by the source tool)' : ''}`, '');
    L.push(m.text ? quote(balance(m.text)) : '_(no text; tools only)_', '');
    if (m.tools.length) L.push(`_Tools used: ${m.tools.map((t) => t.summary + (t.ok === false ? ' (failed)' : '')).join('; ')}_`, '');
    if (m.attachments?.length) L.push(`_Attached and not carried: ${m.attachments.join(', ')}_`, '');
  }

  if (c.vault.length) {
    L.push(`## Code from the conversation (${c.vault.length} block${c.vault.length === 1 ? '' : 's'}, exact)`, '');
    c.vault.forEach((b, i) => {
      L.push(`### ${i + 1}. ${b.lang} · from \`${b.messageId}\` · sha256 \`${b.sha256.slice(0, 12)}\``, '', fence(b.text, b.lang), '');
    });
  }
  for (const a of c.artifacts) {
    L.push(`## ${tool}'s own note: ${a.name}${a.truncated ? ' (cut)' : ''}`, '', a.text.trim(), '');
  }

  const f = c.fidelity;
  L.push('## Fidelity report', '');
  L.push(`- **Tier:** ${f.tier} (${f.tier === 'verbatim' ? 'every turn and code block word for word' : f.tier === 'hybrid' ? 'state card, recent turns and code exact; older turns summarised by the state card only' : 'the source tool keeps only part of the conversation'})`);
  L.push(`- Turns read: ${f.messagesRead}; included word for word: ${f.messagesInTail}`);
  L.push(`- Code blocks found: ${f.codeBlocksFound}; in the vault: ${f.codeBlocksInVault}`);
  L.push(`- Tool actions read: ${f.toolEventsRead}; turns cut by Hotswap: ${f.turnsCutByCap}; turns cut by the source tool: ${f.turnsCutBySource}`);
  if (f.attachmentsNotCarried) L.push(`- Attachments not carried: ${f.attachmentsNotCarried}`);
  const red = Object.entries(f.redactions);
  L.push(`- Secrets removed: ${red.length ? red.map(([k, v]) => `${v} ${k}`).join(', ') : 'none found'}`);
  for (const n of f.notes) L.push(`- Note: ${n}`);
  L.push('');

  const body = `${L.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n\n`;
  const meta = {
    hotswap: 1, id: c.id, createdAt: c.createdAt, preset: c.preset, tier: f.tier,
    source: { tool: c.source.tool, sessionId: c.source.sessionId, endedAt: c.source.endedAt },
    counts: { turns: f.messagesRead, tail: f.messagesInTail, codeBlocks: f.codeBlocksInVault },
    bodySha256: sha(`${body}${MARK}\n`),
  };
  return `${body}${MARK}\n\`\`\`json hotswap-capsule\n${JSON.stringify(meta, null, 2)}\n\`\`\`\n`;
}

export interface Verdict { ok: boolean; reason: string; meta?: Record<string, any> }

/** True only if the file still has exactly the text Hotswap wrote. */
export function verifyCapsule(md: string): Verdict {
  const i = md.lastIndexOf(MARK);
  if (i < 0) return { ok: false, reason: 'This is not a Hotswap capsule (no meta block).' };
  const body = md.slice(0, i);
  const m = /```json hotswap-capsule\n([\s\S]*?)\n```/.exec(md.slice(i));
  if (!m) return { ok: false, reason: 'The meta block is missing or damaged.' };
  let meta: Record<string, any>;
  try { meta = JSON.parse(m[1]) as Record<string, any>; } catch { return { ok: false, reason: 'The meta block is not valid JSON.' }; }
  if (sha(`${body}${MARK}\n`) !== meta.bodySha256) return { ok: false, reason: 'The text above the meta block was changed after Hotswap wrote it.', meta };
  return { ok: true, reason: 'The capsule is exactly as written.', meta };
}
