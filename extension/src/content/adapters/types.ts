import type { Role, ToolName } from '../../../../src/core/types.ts';

export interface RawMessage {
  /** Stable id from the page, so the same message seen twice (virtual lists) is not counted twice. */
  key: string;
  role: Role;
  text: string;
  attachments: string[];
}

export type SiteId = 'chatgpt' | 'claude' | 'gemini';

/** One chat website. Everything site specific lives behind this, with dated selectors, so a layout change touches one file. */
export interface Adapter {
  id: SiteId;
  name: string;
  tool: ToolName;
  /** Hosts this adapter owns. */
  hosts: string[];
  /** The element that scrolls the transcript, or null when the whole page scrolls. */
  scroller(doc: Document): HTMLElement | null;
  /** Messages that are on the page right now, in page order. */
  messages(doc: Document): RawMessage[];
  /** The box the user types into. */
  composer(doc: Document): HTMLElement | null;
  title(doc: Document): string | undefined;
  /** True while the AI is still writing a reply. */
  streaming(doc: Document): boolean;
  /** Which selectors currently match, for the probe report (no chat text). */
  selectorHealth(doc: Document): Record<string, number | boolean>;
}
