// Reads a whole conversation from the page. Long chats are virtualised (only the messages near the screen exist in the
// page), so the page is scrolled to its start and then swept downward, collecting every message into a cache keyed by
// its id. The result says honestly whether the start of the conversation was reached.
import type { Message, Session } from '../../../src/core/types.ts';
import type { Adapter, RawMessage } from './adapters/types.ts';

export interface CaptureFlags {
  reachedTop: boolean | 'unknown';
  reachedBottom: boolean | 'unknown';
  steps: number;
  stoppedBecause: string;
  streaming: boolean;
}

export interface CaptureOptions {
  maxSteps?: number;
  waitMs?: number;
  onProgress?: (text: string) => void;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function captureMessages(adapter: Adapter, doc: Document, opts: CaptureOptions = {}): Promise<{ messages: RawMessage[]; flags: CaptureFlags }> {
  const maxSteps = opts.maxSteps ?? 80;
  const wait = opts.waitMs ?? 400;
  const cache = new Map<string, RawMessage>();
  const collect = (order?: string[]): number => {
    let fresh = 0;
    for (const m of adapter.messages(doc)) {
      const known = cache.get(m.key);
      if (!known) fresh += 1;
      if (!known || m.text.length >= known.text.length) cache.set(m.key, m);
      if (order && !order.includes(m.key)) order.push(m.key);
    }
    return fresh;
  };

  const scroller = adapter.scroller(doc);
  const flags: CaptureFlags = { reachedTop: 'unknown', reachedBottom: 'unknown', steps: 0, stoppedBecause: 'the page was read as it was', streaming: adapter.streaming(doc) };
  collect();
  if (!scroller) {
    return { messages: [...cache.values()], flags };
  }

  const startTop = scroller.scrollTop;
  // 1. up to the start, until nothing new appears and the page stops growing
  let stable = 0;
  let lastHeight = scroller.scrollHeight;
  while (flags.steps < maxSteps && stable < 2) {
    opts.onProgress?.(`Loading the start of the conversation (${cache.size} messages so far)`);
    scroller.scrollTop = 0;
    scroller.dispatchEvent(new Event('scroll'));
    await sleep(wait);
    flags.steps += 1;
    const fresh = collect();
    const grew = scroller.scrollHeight !== lastHeight;
    lastHeight = scroller.scrollHeight;
    stable = fresh === 0 && !grew && scroller.scrollTop <= 1 ? stable + 1 : 0;
  }
  flags.reachedTop = stable >= 2;
  if (!flags.reachedTop) flags.stoppedBecause = `stopped after ${flags.steps} steps before the start of the conversation was clearly reached`;

  // 2. sweep down in page order so the order is the conversation's order
  const order: string[] = [];
  collect(order);
  const step = Math.max(80, Math.floor(scroller.clientHeight * 0.8));
  let guard = 0;
  while (guard < 400) {
    guard += 1;
    const before = scroller.scrollTop;
    if (before + scroller.clientHeight >= scroller.scrollHeight - 2) break;
    scroller.scrollTop = before + step;
    scroller.dispatchEvent(new Event('scroll'));
    await sleep(Math.max(40, Math.floor(wait / 3)));
    collect(order);
    if (scroller.scrollTop === before) break;
  }
  flags.reachedBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
  if (flags.reachedTop === true && flags.reachedBottom === true) flags.stoppedBecause = 'read from the start of the conversation to the latest message';
  scroller.scrollTop = startTop;

  // anything the cache has that the sweep missed goes at the end, so nothing is lost
  const messages = order.map((k) => cache.get(k)!).concat([...cache.entries()].filter(([k]) => !order.includes(k)).map(([, v]) => v));
  return { messages, flags };
}

export function toSession(adapter: Adapter, doc: Document, loc: Location, raw: RawMessage[], flags: CaptureFlags, now = new Date()): Session {
  const notes: string[] = [`Captured from the open ${adapter.name} page by scrolling it; ${flags.stoppedBecause}.`];
  if (flags.streaming) notes.push('The AI was still writing a reply when this was captured; the last reply may be unfinished.');
  const attachments = raw.reduce((n, m) => n + m.attachments.length, 0);
  if (attachments) notes.push(`${attachments} upload(s) are listed by name only; their contents cannot travel in a text capsule.`);
  const messages: Message[] = raw.map((m, i) => ({ id: m.key || `m${i}`, role: m.role, text: m.text, tools: [], ...(m.attachments.length ? { attachments: m.attachments } : {}) }));
  return {
    source: { tool: adapter.tool, sessionId: loc.pathname.split('/').filter(Boolean).pop() ?? 'page', title: adapter.title(doc), path: `${loc.origin}${loc.pathname}`, endedAt: now.toISOString() },
    messages,
    todos: [],
    artifacts: [],
    notes,
    incomplete: flags.reachedTop !== true,
  };
}
