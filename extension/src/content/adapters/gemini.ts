// Gemini. Selectors follow the 2026-10 structure kept in the MIT-licensed Clio project's fixtures and notes:
// custom elements <user-query> and <model-response> inside #chat-history .conversation-container, prompt lines in
// p.query-text-line, replies under message-content .markdown, code in <code-block>, and <model-thoughts> for
// hidden-by-default reasoning (not exported).
// The composer selectors are the ones other extensions use and are NOT yet verified on the live page (see probe mode).
import { elementToText } from '../domText.ts';
import type { Adapter, RawMessage } from './types.ts';

const SCROLLER = '#chat-history, .chat-history-scroll-container, [data-scroll-container]';
const COMPOSER = 'rich-textarea .ql-editor[contenteditable="true"], div.ql-editor[contenteditable="true"], rich-textarea [contenteditable="true"], textarea[placeholder*="Ask Gemini" i], textarea.gds-body-l';
// Checked on the live logged-out page 2026-11-12: the message box there is textarea.gds-body-l (placeholder "Ask Gemini"). The rich-textarea
// selectors are for the signed-in page's markup recorded by other projects and are not yet checked live.

export const gemini: Adapter = {
  id: 'gemini',
  name: 'Gemini',
  tool: 'gemini',
  hosts: ['gemini.google.com'],
  scroller: (doc) => doc.querySelector<HTMLElement>(SCROLLER),
  messages(doc) {
    const out: RawMessage[] = [];
    doc.querySelectorAll('#chat-history .conversation-container, .conversation-container').forEach((c, i) => {
      const base = c.id || `c${i}`;
      const q = c.querySelector('user-query');
      if (q) {
        const lines = [...q.querySelectorAll('.query-text-line')].map((l) => (l.textContent ?? '').trim());
        const text = lines.length ? lines.join('\n') : elementToText(q.querySelector('.query-text') ?? q);
        const attachments = [...q.querySelectorAll('.file-preview-container img, [data-test-id*="file"] img')].map((im) => im.getAttribute('alt') ?? 'upload');
        if (text || attachments.length) out.push({ key: `${base}:user`, role: 'user', text, attachments });
      }
      const m = c.querySelector('model-response');
      if (m) {
        const body = m.querySelector('message-content .markdown, .model-response-text .markdown, message-content') ?? m;
        const text = elementToText(body, { skip: (e) => e.tagName === 'MODEL-THOUGHTS' || e.matches('.code-block-decoration, .buttons, [role="toolbar"]') });
        if (text) out.push({ key: `${base}:assistant`, role: 'assistant', text, attachments: [] });
      }
    });
    return out;
  },
  composer: (doc) => doc.querySelector<HTMLElement>(COMPOSER),
  title: (doc) => doc.title?.replace(/\s*[|\-–]\s*(Google )?Gemini\s*$/i, '').trim() || undefined,
  streaming: (doc) => !!doc.querySelector('button[aria-label*="Stop"], .send-button.stop'),
  selectorHealth: (doc) => ({
    userMessages: doc.querySelectorAll('user-query').length,
    assistantMessages: doc.querySelectorAll('model-response').length,
    scroller: !!doc.querySelector(SCROLLER),
    composer: !!doc.querySelector(COMPOSER),
  }),
};
