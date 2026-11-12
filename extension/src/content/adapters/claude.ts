// Claude. Selectors follow the structure recorded for 2026-10-17 in the MIT-licensed Clio project's notes
// (extensions/src/selectors-claude.js): a reply is div[data-testid="assistant-message"], its text sits under
// [data-transcript-engine-root], elements marked data-find-omitted are not content, and an upload sits BESIDE the
// user's text bubble in the same row. The 2026-05 class names stay beside the new ones.
// The composer selectors are the ones other extensions use and are NOT yet verified on the live page (see probe mode).
import { elementToText } from '../domText.ts';
import type { Adapter, RawMessage } from './types.ts';

const USER = '[data-testid="user-message"]';
const ASSISTANT = '[data-testid="assistant-message"], .font-claude-response:not(.font-claude-response-body)';
const SCROLLER = '[data-autoscroll-container], [class*="flex-1"][class*="overflow-y-auto"], [data-scroll-container]';
const COMPOSER = 'div[contenteditable="true"].ProseMirror, [data-testid="chat-input"], div[contenteditable="true"][role="textbox"]';

const skipReply = (e: Element): boolean => e.matches('[data-testid="message-actions"], [role="toolbar"], time');

export const claude: Adapter = {
  id: 'claude',
  name: 'Claude',
  tool: 'claude-ai',
  hosts: ['claude.ai'],
  scroller: (doc) => doc.querySelector<HTMLElement>(SCROLLER),
  messages(doc) {
    const out: RawMessage[] = [];
    doc.querySelectorAll(`${USER}, ${ASSISTANT}`).forEach((el, i) => {
      const user = el.matches(USER);
      const row = el.closest('[data-turn-key]');
      const key = `${row?.getAttribute('data-turn-key') ?? `idx-${i}`}:${user ? 'user' : 'assistant'}`;
      const body = user ? el : el.querySelector('[data-transcript-engine-root]') ?? el;
      const text = elementToText(body, { skip: skipReply });
      // an upload sits beside the bubble, in the same row
      const attachments = user ? [...(el.closest('[data-turn-key]')?.querySelectorAll('[data-testid="file-thumbnail"] img') ?? [])].map((img) => img.getAttribute('alt') ?? 'upload') : [];
      if (text || attachments.length) out.push({ key, role: user ? 'user' : 'assistant', text, attachments });
    });
    return out;
  },
  composer: (doc) => doc.querySelector<HTMLElement>(COMPOSER),
  title: (doc) => doc.title?.replace(/\s*[|\-–]\s*Claude\s*$/i, '').trim() || undefined,
  streaming: (doc) => !!doc.querySelector('[data-is-streaming="true"], button[aria-label^="Stop"]'),
  selectorHealth: (doc) => ({
    userMessages: doc.querySelectorAll(USER).length,
    assistantMessages: doc.querySelectorAll(ASSISTANT).length,
    scroller: !!doc.querySelector(SCROLLER),
    composer: !!doc.querySelector(COMPOSER),
  }),
};
