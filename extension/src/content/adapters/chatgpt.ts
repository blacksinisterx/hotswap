// ChatGPT. Selectors follow the structure recorded for 2026-10-17 in the MIT-licensed Clio project's notes
// (https://github.com/martymcenroe/Clio, extensions/src/selectors-chatgpt.js): ChatGPT dropped
// data-message-author-role; a message is now [data-chatgpt-search-unit-key="<k>:<n>:user|assistant"] inside [data-turn-key].
// The older attribute is kept beside the new markup so a browser still served the old page keeps working.
// The composer selectors are the ones other extensions use and are NOT yet verified on the live page (see probe mode).
import { elementToText } from '../domText.ts';
import type { Adapter, RawMessage } from './types.ts';

const USER = '[data-chatgpt-search-unit-key$=":user"], [data-message-author-role="user"]';
const ASSISTANT = '[data-chatgpt-search-unit-key$=":assistant"], [data-message-author-role="assistant"]';
const SCROLLER = '[data-app-action-timeline-scroll], .thread-scroll-container, main [class*="overflow-y-auto"]';
const COMPOSER = '#prompt-textarea, [data-testid="prompt-textarea"], div[contenteditable="true"][role="textbox"], form textarea';

const idOf = (el: Element, i: number): string => {
  const unit = el.getAttribute('data-chatgpt-search-unit-key');
  const ids = el.getAttribute('data-chatgpt-search-message-ids')?.split(/\s+/)[0] ?? el.getAttribute('data-message-id');
  return unit ?? ids ?? `idx-${i}`;
};

export const chatgpt: Adapter = {
  id: 'chatgpt',
  name: 'ChatGPT',
  tool: 'chatgpt',
  hosts: ['chatgpt.com', 'chat.openai.com'],
  scroller: (doc) => doc.querySelector<HTMLElement>(SCROLLER),
  messages(doc) {
    const out: RawMessage[] = [];
    doc.querySelectorAll(`${USER}, ${ASSISTANT}`).forEach((el, i) => {
      const role = el.matches(USER) ? 'user' : 'assistant';
      const body = role === 'user' ? el.querySelector('.whitespace-pre-wrap') ?? el : el.querySelector('[data-markdown-text-style], .markdown') ?? el;
      const text = elementToText(body, { skip: (e) => e.tagName === 'H4' || e.tagName === 'H5' || e.tagName === 'H6' ? e.classList.contains('sr-only') : false });
      const attachments = [...el.querySelectorAll('[data-testid="library-file-icon"]')].map((f) => (f.closest('[class*="file"]')?.textContent ?? 'file').trim().slice(0, 80));
      if (text || attachments.length) out.push({ key: idOf(el, i), role, text, attachments });
    });
    return out;
  },
  composer: (doc) => doc.querySelector<HTMLElement>(COMPOSER),
  title: (doc) => doc.title?.replace(/\s*[|\-–]\s*ChatGPT\s*$/i, '').trim() || undefined,
  streaming: (doc) => !!doc.querySelector('[data-testid="stop-button"], button[aria-label*="Stop"]'),
  selectorHealth: (doc) => ({
    userMessages: doc.querySelectorAll(USER).length,
    assistantMessages: doc.querySelectorAll(ASSISTANT).length,
    scroller: !!doc.querySelector(SCROLLER),
    composer: !!doc.querySelector(COMPOSER),
  }),
};
