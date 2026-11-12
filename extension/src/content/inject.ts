// Puts text into a chat's message box. It never presses send: the person does that.
// Techniques, in order (all seen in real extensions, see research/RESEARCH.md section 3). Each one is checked by reading
// the box back; the first that works wins, and the last resort is the clipboard.

export interface InjectResult { ok: boolean; technique: string; verified: boolean; tried: string[] }

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const probeOf = (text: string) => norm(text).slice(0, 40);
const valueOf = (el: HTMLElement): string => (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement ? el.value : el.innerText || el.textContent || '');
const has = (el: HTMLElement, text: string): boolean => norm(valueOf(el)).includes(probeOf(text));
const tick = (ms = 60) => new Promise<void>((r) => setTimeout(r, ms));

function placeCursorAtEnd(el: HTMLElement): void {
  const sel = el.ownerDocument.defaultView?.getSelection();
  if (!sel) return;
  const range = el.ownerDocument.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

export async function insertText(el: HTMLElement, text: string): Promise<InjectResult> {
  const tried: string[] = [];
  const doc = el.ownerDocument;
  el.focus();

  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    tried.push('native-value-setter');
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    const next = el.value ? `${el.value}\n\n${text}` : text;
    if (setter) setter.call(el, next); else el.value = next;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    return { ok: has(el, text), technique: 'native-value-setter', verified: has(el, text), tried };
  }

  const draft = norm(valueOf(el)) ? '\n\n' : '';
  const payload = `${draft}${text}`;

  // 1. the usual way for rich editors: place the cursor at the end and insert text as if typed
  tried.push('execCommand-insertText');
  placeCursorAtEnd(el);
  try { doc.execCommand('insertText', false, payload); } catch { /* try the next one */ }
  await tick();
  if (has(el, text)) return { ok: true, technique: 'execCommand-insertText', verified: true, tried };

  // 2. a synthetic paste carrying the text
  tried.push('paste-event');
  el.focus();
  placeCursorAtEnd(el);
  const dt = new DataTransfer();
  dt.setData('text/plain', payload);
  el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  await tick(120);
  if (has(el, text)) return { ok: true, technique: 'paste-event', verified: true, tried };

  // 3. an input event the editor treats as a paste
  tried.push('beforeinput-insertFromPaste');
  el.focus();
  placeCursorAtEnd(el);
  el.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertFromPaste', data: payload, dataTransfer: dt, bubbles: true, cancelable: true }));
  await tick(120);
  if (has(el, text)) return { ok: true, technique: 'beforeinput-insertFromPaste', verified: true, tried };

  // 4. the clipboard and the browser's own paste command (needs the person's click, which we are inside of)
  tried.push('clipboard-then-paste-command');
  try {
    await navigator.clipboard.writeText(payload);
    el.focus();
    placeCursorAtEnd(el);
    doc.execCommand('paste');
    await tick(150);
    if (has(el, text)) return { ok: true, technique: 'clipboard-then-paste-command', verified: true, tried };
  } catch { /* the caller falls back to telling the person it is on the clipboard */ }

  return { ok: false, technique: 'none', verified: false, tried };
}

/** Tries to attach the capsule as a file by pasting and dropping it. There is no reliable way to see whether the page accepted it. */
export async function attachFile(el: HTMLElement, name: string, text: string): Promise<{ attempted: boolean }> {
  const file = new File([text], name, { type: 'text/markdown' });
  const dt = new DataTransfer();
  dt.items.add(file);
  el.focus();
  el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  await tick(250);
  return { attempted: true };
}
