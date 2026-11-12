import { chatgpt } from './chatgpt.ts';
import { claude } from './claude.ts';
import { gemini } from './gemini.ts';
import type { Adapter } from './types.ts';

export const ADAPTERS: Adapter[] = [chatgpt, claude, gemini];

/** The adapter for this page. On the local test pages used by the tests, a <meta name="hotswap-site"> picks it. */
export function pickAdapter(loc: Location, doc: Document, allowMeta = false): Adapter | undefined {
  const byHost = ADAPTERS.find((a) => a.hosts.some((h) => loc.hostname === h || loc.hostname.endsWith(`.${h}`)));
  if (byHost) return byHost;
  if (!allowMeta) return undefined;
  const id = doc.querySelector('meta[name="hotswap-site"]')?.getAttribute('content');
  return ADAPTERS.find((a) => a.id === id);
}
