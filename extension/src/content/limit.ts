// Experimental: notice a usage-limit banner on a chat page. No competitor's code contained the real wording of these
// banners (research/RESEARCH.md section 6), so these rules are a careful guess, only look at short pieces of page that
// appear AFTER the page loaded and are not part of a chat message, and are labelled experimental. Probe mode records the
// exact banner text a person sees, so the rules can be made exact. The manual button always works.

export const LIMIT_RULES: RegExp[] = [
  /\b(you['’]ve|you have)\s+(hit|reached|used)\s+(your|the|all)\b[^.\n]{0,60}\blimit\b/i,
  /\b(usage|message|messages|rate|daily|session|plan|prompt)\s+limit\b[^.\n]{0,40}\b(reached|hit|exceeded|met)\b/i,
  /\b(reached|hit|exceeded)\b[^.\n]{0,30}\b(usage|message|messages|rate|daily|session|plan)\s+limit\b/i,
  /\blimit\b[^.\n]{0,40}\bresets?\b/i,
  /\byou['’]re out of\b[^.\n]{0,30}\b(messages|prompts|requests)\b/i,
  /\btoo many requests\b/i,
];

export const looksLikeLimit = (text: string): boolean => text.length > 8 && text.length <= 500 && LIMIT_RULES.some((r) => r.test(text));

// pieces of the page that are conversation text, where the words "limit reached" are just words
const CHAT_CONTENT = '[data-testid="user-message"], [data-testid="assistant-message"], user-query, model-response, [data-chatgpt-search-unit-key], [data-message-author-role], [data-markdown-text-style], .markdown, pre, code, textarea, [contenteditable="true"]';

export function watchLimits(doc: Document, onHit: (text: string) => void): () => void {
  const seen = new Set<string>();
  const check = (el: Element): void => {
    if (el.closest(CHAT_CONTENT) || el.closest('hotswap-root')) return;
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!looksLikeLimit(text) || seen.has(text)) return;
    seen.add(text);
    onHit(text);
  };
  const scan = (node: Node): void => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    check(el);
    el.querySelectorAll('[role="alert"], [role="status"], [role="dialog"], [aria-live], [class*="toast" i], [class*="banner" i], [class*="alert" i]').forEach(check);
  };
  const obs = new MutationObserver((records) => { for (const r of records) r.addedNodes.forEach(scan); });
  obs.observe(doc.body, { childList: true, subtree: true });
  return () => obs.disconnect();
}
