// Turns the part of a chat page that holds a message into plain Markdown-like text: paragraphs, lists, headings,
// inline code and fenced code blocks (with their language). Only text the page shows is used.

const BLOCK = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'TABLE', 'TR', 'PRE', 'FIGURE', 'HR']);
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'BUTTON', 'SVG', 'NOSCRIPT', 'TEMPLATE', 'INPUT', 'TEXTAREA', 'SELECT']);

export interface TextOptions {
  /** Extra elements to leave out (screen-reader headings, toolbars, "thinking" panels). */
  skip?: (el: Element) => boolean;
}

export function languageOf(pre: Element): string {
  const code = pre.querySelector('code');
  const cls = `${code?.className ?? ''} ${pre.className ?? ''}`;
  const m = /(?:language|lang)-([\w+#.-]+)/i.exec(cls);
  if (m) return m[1].toLowerCase();
  const data = pre.closest('[data-language]')?.getAttribute('data-language') ?? code?.getAttribute('data-language');
  if (data) return data.toLowerCase();
  // some pages put the language in a small label just above the code
  const prev = pre.previousElementSibling ?? pre.parentElement?.previousElementSibling;
  const label = (prev?.querySelector('span')?.textContent ?? prev?.textContent ?? '').trim();
  return /^[A-Za-z][\w+#.-]{0,14}$/.test(label) ? label.toLowerCase() : '';
}

function fence(code: string, lang: string): string {
  const longest = Math.max(2, ...[...code.matchAll(/`+/g)].map((m) => m[0].length));
  const f = '`'.repeat(longest + 1);
  return `\n\n${f}${lang}\n${code.replace(/\n+$/, '')}\n${f}\n\n`;
}

export function elementToText(root: Element, opts: TextOptions = {}): string {
  const out: string[] = [];
  const walk = (node: Node, listDepth: number, ordinal: { n: number } | null): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent ?? '').replace(/\s+/g, ' ');
      if (t) out.push(t);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    if (SKIP_TAGS.has(el.tagName.toUpperCase()) || el.hasAttribute('data-find-omitted') || el.getAttribute('aria-hidden') === 'true' || el.classList.contains('sr-only') || el.classList.contains('cdk-visually-hidden') || opts.skip?.(el)) return;
    const tag = el.tagName.toUpperCase();
    if (tag === 'BR') { out.push('\n'); return; }
    if (tag === 'PRE') { out.push(fence(el.textContent ?? '', languageOf(el))); return; }
    if (tag === 'CODE') {
      const t = el.textContent ?? '';
      out.push(t.includes('\n') ? fence(t, languageOf(el)) : `\`${t}\``);
      return;
    }
    if (tag === 'IMG') { const alt = el.getAttribute('alt'); if (alt) out.push(`[image: ${alt}]`); return; }
    if (tag === 'HR') { out.push('\n\n---\n\n'); return; }
    if (/^H[1-6]$/.test(tag)) {
      out.push(`\n\n${'#'.repeat(Number(tag[1]))} `);
      el.childNodes.forEach((c) => walk(c, listDepth, null));
      out.push('\n\n');
      return;
    }
    if (tag === 'UL' || tag === 'OL') {
      out.push('\n');
      const ord = tag === 'OL' ? { n: 0 } : null;
      el.childNodes.forEach((c) => walk(c, listDepth + 1, ord));
      out.push('\n');
      return;
    }
    if (tag === 'LI') {
      if (ordinal) ordinal.n += 1;
      out.push(`\n${'  '.repeat(Math.max(0, listDepth - 1))}${ordinal ? `${ordinal.n}. ` : '- '}`);
      el.childNodes.forEach((c) => walk(c, listDepth, null));
      return;
    }
    if (tag === 'TR') {
      const cells = [...el.children].map((c) => (c.textContent ?? '').replace(/\s+/g, ' ').trim());
      out.push(`\n| ${cells.join(' | ')} |`);
      return;
    }
    if (tag === 'TABLE') { out.push('\n'); el.childNodes.forEach((c) => walk(c, listDepth, null)); out.push('\n'); return; }
    if (tag === 'BLOCKQUOTE') {
      const inner = elementToText(el, opts).split('\n').map((l) => `> ${l}`.trimEnd()).join('\n');
      out.push(`\n\n${inner}\n\n`);
      return;
    }
    const block = BLOCK.has(tag);
    if (block) out.push('\n\n');
    el.childNodes.forEach((c) => walk(c, listDepth, null));
    if (block) out.push('\n\n');
  };
  root.childNodes.forEach((c) => walk(c, 0, null));
  return out.join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/g, '');
}
