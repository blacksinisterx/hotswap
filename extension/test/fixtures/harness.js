// Shared by the test pages. It is NOT part of the extension; it stands in for the site's own scripts:
// it counts clicks on the send button (the extension must never cause any), makes the message box behave like a
// real rich editor, and can add a limit banner or a virtualised transcript.
window.__sent = 0;
document.addEventListener('click', (e) => { if (e.target.closest('[data-send]')) window.__sent += 1; }, true);

const q = new URLSearchParams(location.search);

if (q.get('editor') === 'strict') document.querySelector('[data-composer]').setAttribute('data-editor', 'strict');

// "strict" editor: refuses text typed through execCommand (a beforeinput of type insertText) and only accepts a paste,
// like editors that run their own input handling.
document.querySelectorAll('[data-editor="strict"]').forEach((ed) => {
  ed.addEventListener('beforeinput', (e) => { if (e.inputType === 'insertText') e.preventDefault(); });
  ed.addEventListener('paste', (e) => {
    const text = e.clipboardData && e.clipboardData.getData('text/plain');
    if (text) { e.preventDefault(); ed.append(document.createTextNode(text)); ed.dispatchEvent(new Event('input', { bubbles: true })); }
  });
});

// ?composer=textarea swaps the rich editor for a plain textarea
if (q.get('composer') === 'textarea') {
  const ed = document.querySelector('[data-composer]');
  const ta = document.createElement('textarea');
  ta.id = 'prompt-textarea';
  ta.setAttribute('data-composer', '');
  ta.rows = 3;
  ed.replaceWith(ta);
}

// ?limit=1 adds a banner a moment after load; ?quote=1 adds the same words INSIDE a chat message, which must not count
if (q.get('limit') === '1') {
  setTimeout(() => {
    const b = document.createElement('div');
    b.setAttribute('role', 'alert');
    b.style.cssText = 'position:fixed;top:44px;left:0;right:0;background:#5a2a1f;color:#ffe9d6;padding:9px 20px;text-align:center;font:600 14px system-ui;z-index:50';
    b.textContent = "You've reached your usage limit. It resets at 11:40 PM.";
    document.body.append(b);
  }, 700);
}
if (q.get('quote') === '1') {
  setTimeout(() => {
    const target = document.querySelector('[data-markdown-text-style], [data-testid="assistant-message"], model-response');
    const p = document.createElement('p');
    p.textContent = "A note: when an app says you've reached your usage limit, wait for the reset.";
    target.append(p);
  }, 700);
}

// ?virtual=1 turns the page into a virtualised transcript: 40 messages of which only the ones near the screen exist
if (q.get('virtual') === '1') {
  const scroller = document.querySelector('[data-app-action-timeline-scroll]');
  scroller.innerHTML = '';
  const N = 40;
  const H = 90;
  const spacer = document.createElement('div');
  spacer.style.height = `${N * H}px`;
  spacer.style.position = 'relative';
  scroller.append(spacer);
  const render = () => {
    spacer.querySelectorAll('[data-chatgpt-search-unit-key]').forEach((n) => n.remove());
    const first = Math.max(0, Math.floor(scroller.scrollTop / H) - 1);
    const last = Math.min(N - 1, Math.ceil((scroller.scrollTop + scroller.clientHeight) / H) + 1);
    for (let i = first; i <= last; i += 1) {
      const user = i % 2 === 0;
      const el = document.createElement('div');
      el.setAttribute('data-chatgpt-search-unit-key', `v${i}:0:${user ? 'user' : 'assistant'}`);
      el.style.cssText = `position:absolute;top:${i * H}px;height:${H}px;left:0;right:0`;
      el.innerHTML = user ? `<div class="whitespace-pre-wrap">Question number ${i}</div>` : `<div data-markdown-text-style="assistant-message"><p>Answer number ${i}</p></div>`;
      spacer.append(el);
    }
  };
  scroller.addEventListener('scroll', render);
  scroller.scrollTop = scroller.scrollHeight; // a long chat opens at its end
  render();
}

// a long capsule should not push the whole page around: the message box scrolls inside itself
const grow = document.createElement('style');
grow.textContent = '[data-composer] { max-height: 150px; overflow: auto; }';
document.head.append(grow);
