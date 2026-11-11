// Limit Watcher for Claude Code. When the plan limit is hit, Claude Code appends a line with
//   isApiErrorMessage: true, error: "rate_limit", apiErrorStatus: 429  and the text "You've hit your session limit · resets 11:40am (Asia/Karachi)".
// (Verified on a real machine: 87 such lines in 13 sessions; other API errors use other values.)
// The watcher reads only bytes appended after it started, so it never re-reads old conversations.
import { closeSync, existsSync, openSync, readSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { claudeRoot, entryText, isRateLimitEntry, parseLimit } from '../readers/claudeCode.ts';

export interface LimitHit { file: string; sessionId: string; text: string; resets?: string; at?: string; uuid?: string }

/** Finds limit notices in JSONL lines. Cheap: lines without the marker are not even parsed. */
export function scanLines(lines: Iterable<string>, file = ''): LimitHit[] {
  const out: LimitHit[] = [];
  for (const ln of lines) {
    if (!ln.includes('isApiErrorMessage')) continue;
    let o: Record<string, any>;
    try { o = JSON.parse(ln) as Record<string, any>; } catch { continue; }
    if (!isRateLimitEntry(o)) continue;
    const text = entryText(o).trim();
    out.push({ file, sessionId: String(o.sessionId ?? basename(file, '.jsonl')), text, at: o.timestamp, uuid: o.uuid, ...parseLimit(text) });
  }
  return out;
}

function listJsonl(root: string): { path: string; size: number; mtimeMs: number }[] {
  if (!existsSync(root)) return [];
  const out: { path: string; size: number; mtimeMs: number }[] = [];
  for (const d of readdirSync(root, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    for (const f of readdirSync(join(root, d.name))) {
      if (!f.endsWith('.jsonl')) continue;
      const path = join(root, d.name, f);
      const st = statSync(path);
      out.push({ path, size: st.size, mtimeMs: st.mtimeMs });
    }
  }
  return out;
}

function readFrom(path: string, from: number, to: number): string {
  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.alloc(to - from);
    readSync(fd, buf, 0, buf.length, from);
    return buf.toString('utf8');
  } finally {
    closeSync(fd);
  }
}

export interface WatchOptions {
  root?: string;
  intervalMs?: number;
  signal?: AbortSignal;
  onLimit: (hit: LimitHit) => void | Promise<void>;
  /** Also report a limit notice that is already the last thing in the newest session (you are stuck right now). */
  includeCurrent?: boolean;
}

/** Newest session's final limit notice, if nothing but errors came after it. Used by `watch --once` and at start-up. */
export function currentLimit(root = claudeRoot()): LimitHit | undefined {
  const newest = listJsonl(root).sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
  if (!newest) return undefined;
  const from = Math.max(0, newest.size - 64_000);
  const lines = readFrom(newest.path, from, newest.size).split('\n').slice(from > 0 ? 1 : 0).filter(Boolean);
  const hits = scanLines(lines, newest.path);
  if (!hits.length) return undefined;
  // anything after the last notice that is a real turn means the limit has passed
  const lastAt = hits[hits.length - 1].at ?? '';
  const later = lines.some((l) => { try { const o = JSON.parse(l) as Record<string, any>; return (o.type === 'assistant' || o.type === 'user') && !o.isApiErrorMessage && !o.isMeta && (o.timestamp ?? '') > lastAt; } catch { return false; } });
  return later ? undefined : hits[hits.length - 1];
}

export async function watchClaude(opts: WatchOptions): Promise<void> {
  const root = opts.root ?? claudeRoot();
  const interval = opts.intervalMs ?? 2000;
  const offsets = new Map<string, number>();
  const seen = new Set<string>();
  for (const f of listJsonl(root)) offsets.set(f.path, f.size); // only what is written from now on counts
  if (opts.includeCurrent) {
    const cur = currentLimit(root);
    if (cur) { if (cur.uuid) seen.add(cur.uuid); await opts.onLimit(cur); }
  }
  const rest = new Map<string, string>();
  while (!opts.signal?.aborted) {
    for (const f of listJsonl(root)) {
      const known = offsets.get(f.path);
      if (known === undefined) { offsets.set(f.path, 0); }
      const from = offsets.get(f.path) ?? 0;
      if (f.size <= from) { if (f.size < from) offsets.set(f.path, 0); continue; }
      const chunk = (rest.get(f.path) ?? '') + readFrom(f.path, from, f.size);
      offsets.set(f.path, f.size);
      const parts = chunk.split('\n');
      rest.set(f.path, parts.pop() ?? ''); // a half-written last line waits for the next round
      for (const hit of scanLines(parts, f.path)) {
        if (hit.uuid && seen.has(hit.uuid)) continue;
        if (hit.uuid) seen.add(hit.uuid);
        await opts.onLimit(hit);
      }
    }
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, interval);
      opts.signal?.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
    });
  }
}
