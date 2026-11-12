// The on-page window: a small "Hotswap" button, a panel, and toasts. It lives in a shadow root so the site's styles
// cannot change it and it cannot change the site's.
import type { Preset } from '../../../src/core/capsule.ts';
import type { StoredCapsule } from '../shared/storage.ts';

export interface Summary {
  turns: number;
  tail: number;
  codeBlocks: number;
  secrets: string;
  complete: string;
  tier: string;
  notes: string[];
}

export interface Handlers {
  capture(preset: Preset): void;
  insertCurrent(): void;
  attachCurrent(): void;
  copyCurrent(): void;
  downloadCurrent(): void;
  saveCurrent(): void;
  insertSaved(id: string): void;
  copySaved(id: string): void;
  deleteSaved(id: string): void;
  dragPayload(): { text: string; name: string } | null;
  probeReport(): void;
}

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
.chip { position: fixed; right: 20px; bottom: 20px; z-index: 2147483647; height: 40px; padding: 0 16px; border-radius: 20px; border: 1px solid #ff8a3d; background: #14161c; color: #fff; font: 600 13px system-ui; cursor: pointer; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 16px rgba(0,0,0,.35); }
.chip i { width: 8px; height: 8px; border-radius: 50%; background: #ff8a3d; display: inline-block; }
.chip:hover { background: #1c2029; }
.panel { position: fixed; right: 20px; bottom: 72px; z-index: 2147483647; width: 390px; max-height: calc(100vh - 100px); overflow: auto; background: #14161c; color: #e8ebf2; border: 1px solid #2b303b; border-radius: 14px; box-shadow: 0 12px 40px rgba(0,0,0,.5); padding: 14px 16px 12px; font-size: 13px; line-height: 1.45; display: none; }
.panel.open { display: block; }
h2 { margin: 0; font-size: 15px; display: flex; justify-content: space-between; align-items: center; }
h2 small { font-weight: 500; color: #8b93a6; font-size: 12px; }
h3 { margin: 14px 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #ff8a3d; }
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
button, select { font: 600 12px system-ui; border-radius: 8px; border: 1px solid #343a48; background: #1d212b; color: #e8ebf2; padding: 7px 11px; cursor: pointer; }
button:hover { background: #262b37; }
button.primary { background: #ff8a3d; color: #14161c; border-color: #ff8a3d; }
button.primary:hover { background: #ff9c5c; }
button:disabled { opacity: .5; cursor: default; }
.x { background: none; border: none; color: #8b93a6; font-size: 18px; padding: 0 4px; }
.status { color: #aab2c5; margin: 8px 0 0; min-height: 18px; }
.card { background: #1a1e27; border: 1px solid #2b303b; border-radius: 10px; padding: 10px 12px; margin-top: 10px; }
.card ul { margin: 0; padding-left: 16px; }
.card li { margin: 2px 0; }
.tier { display: inline-block; border-radius: 999px; padding: 1px 9px; font-size: 11px; font-weight: 700; background: #26402c; color: #8fe0a3; }
.tier.partial { background: #4a3a1a; color: #f3c969; }
.note { color: #aab2c5; font-size: 12px; margin-top: 6px; }
.drag { margin-top: 10px; padding: 9px 12px; border: 1.5px dashed #ff8a3d; border-radius: 10px; color: #ffb77f; cursor: grab; text-align: center; user-select: none; }
textarea { width: 100%; height: 120px; margin-top: 8px; background: #0e1014; color: #cfd5e3; border: 1px solid #2b303b; border-radius: 8px; font: 11px ui-monospace, Consolas, monospace; padding: 8px; }
.saved { display: flex; justify-content: space-between; gap: 8px; align-items: center; padding: 6px 0; border-top: 1px solid #232833; }
.saved:first-of-type { border-top: none; }
.saved > span:first-child { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.saved .row { flex-wrap: nowrap; flex-shrink: 0; gap: 5px; }
.saved button { padding: 5px 8px; }
.saved small { color: #8b93a6; }
.foot { margin-top: 12px; color: #8b93a6; font-size: 11px; }
.link { background: none; border: none; color: #8b93a6; text-decoration: underline; padding: 0; font-weight: 500; }
.toast { position: fixed; right: 20px; bottom: 72px; z-index: 2147483647; max-width: 360px; background: #1a1e27; color: #e8ebf2; border: 1px solid #ff8a3d; border-radius: 12px; padding: 11px 14px; font-size: 13px; box-shadow: 0 8px 28px rgba(0,0,0,.5); }
.toast .row { margin-top: 8px; }
.toast.error { border-color: #ff6b6b; }
@media (prefers-reduced-motion: no-preference) { .panel.open, .toast { animation: pop .14s ease-out; } @keyframes pop { from { opacity: 0; transform: translateY(6px); } } }
`;

type Child = Node | string | null | false | undefined;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = String(v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (v !== false && v !== undefined) el.setAttribute(k, String(v));
  }
  for (const k of kids) if (k) el.append(k);
  return el;
}

export class HotswapUI {
  readonly host: HTMLElement;
  private root: ShadowRoot;
  private panel: HTMLElement;
  private body: HTMLElement;
  private toastEl: HTMLElement | null = null;
  private toastTimer = 0;
  private preset: Preset = 'standard';
  private busy: string | null = null;
  private result: { summary: Summary; md: string } | null = null;
  private saved: StoredCapsule[] = [];
  private probe = false;

  private site: string;
  private handlers: Handlers;

  constructor(site: string, handlers: Handlers) {
    this.site = site;
    this.handlers = handlers;
    this.host = document.createElement('hotswap-root');
    this.root = this.host.attachShadow({ mode: 'open' });
    this.root.append(h('style', {}, CSS));
    const chip = h('button', { class: 'chip', 'data-testid': 'hotswap-chip', 'aria-label': 'Open Hotswap', onclick: () => this.toggle() }, h('i'), 'Hotswap');
    this.body = h('div');
    this.panel = h('div', { class: 'panel', role: 'dialog', 'aria-label': 'Hotswap', 'data-testid': 'hotswap-panel' }, this.body);
    this.root.append(this.panel, chip);
    this.render();
  }

  mount(): void { document.documentElement.append(this.host); }
  open(): void { this.panel.classList.add('open'); }
  close(): void { this.panel.classList.remove('open'); }
  toggle(): void { this.panel.classList.toggle('open'); }
  isOpen(): boolean { return this.panel.classList.contains('open'); }
  setPreset(p: Preset): void { this.preset = p; this.render(); }
  setBusy(text: string | null): void { this.busy = text; this.render(); }
  setSaved(list: StoredCapsule[]): void { this.saved = list; this.render(); }
  setProbe(on: boolean): void { this.probe = on; this.render(); }
  showResult(summary: Summary, md: string): void { this.result = { summary, md }; this.busy = null; this.render(); }

  toast(text: string, actions: { label: string; run: () => void; primary?: boolean }[] = [], kind: 'info' | 'error' = 'info', ms = 9000): void {
    this.toastEl?.remove();
    clearTimeout(this.toastTimer);
    const row = actions.length ? h('div', { class: 'row' }, ...actions.map((a) => h('button', { class: a.primary ? 'primary' : '', onclick: () => { this.toastEl?.remove(); a.run(); } }, a.label))) : null;
    this.toastEl = h('div', { class: `toast ${kind}`, role: 'status', 'data-testid': 'hotswap-toast' }, h('div', {}, text), row);
    this.root.append(this.toastEl);
    this.toastTimer = window.setTimeout(() => this.toastEl?.remove(), ms);
  }

  private render(): void {
    const hd = this.handlers;
    const select = h('select', { 'data-testid': 'hotswap-preset', 'aria-label': 'How much to carry word for word', onchange: (e: Event) => { this.preset = (e.target as HTMLSelectElement).value as Preset; } },
      ...([['minimal', 'Short (last 3 turns)'], ['standard', 'Standard (last 10)'], ['verbose', 'Long (last 20)'], ['full', 'Everything']] as const).map(([v, l]) => h('option', { value: v, ...(v === this.preset ? { selected: 'selected' } : {}) }, l)));
    const capture = h('button', { class: 'primary', 'data-testid': 'hotswap-capture', disabled: this.busy ? 'disabled' : false, onclick: () => hd.capture(this.preset) }, this.busy ? 'Reading...' : 'Capture this chat');
    const kids: Child[] = [
      h('h2', {}, h('span', {}, 'Hotswap ', h('small', {}, `on ${this.site}`)), h('button', { class: 'x', 'aria-label': 'Close', onclick: () => this.close() }, '×')),
      h('h3', {}, '1. Capture'),
      h('div', { class: 'row' }, select, capture),
      h('div', { class: 'status', 'data-testid': 'hotswap-status', 'aria-live': 'polite' }, this.busy ?? ''),
    ];
    if (this.result) kids.push(this.resultCard(this.result));
    kids.push(h('h3', {}, 'Saved capsules'));
    if (!this.saved.length) kids.push(h('div', { class: 'note' }, 'Nothing saved yet. Capture a chat and press Save.'));
    for (const s of this.saved.slice(0, 5)) {
      kids.push(h('div', { class: 'saved', 'data-testid': 'hotswap-saved' },
        h('span', {}, `${s.title || 'Untitled'} `, h('small', {}, `${s.site} · ${s.tier} · ${(s.bytes / 1024).toFixed(0)} KB`)),
        h('span', { class: 'row' },
          h('button', { 'data-testid': 'hotswap-insert-saved', onclick: () => hd.insertSaved(s.id) }, 'Insert here'),
          h('button', { onclick: () => hd.copySaved(s.id) }, 'Copy'),
          h('button', { 'aria-label': 'Delete', onclick: () => hd.deleteSaved(s.id) }, '×'))));
    }
    kids.push(h('div', { class: 'foot' }, 'Hotswap never sends anything: it fills the message box and you press Enter. Everything stays on this computer.', this.probe ? h('div', {}, h('button', { class: 'link', onclick: () => hd.probeReport() }, 'Copy probe report (no chat text)')) : null));
    this.body.replaceChildren(...kids.filter((k): k is Node => !!k));
  }

  private resultCard({ summary: s, md }: { summary: Summary; md: string }): HTMLElement {
    const hd = this.handlers;
    const drag = h('div', { class: 'drag', draggable: 'true', 'data-testid': 'hotswap-drag', title: 'Drag this onto the message box of another AI' }, 'Drag this capsule into another chat');
    drag.addEventListener('dragstart', (e) => {
      const p = hd.dragPayload();
      if (!p || !e.dataTransfer) return;
      e.dataTransfer.setData('text/plain', p.text);
      e.dataTransfer.setData('text/markdown', p.text);
      // text only: every message box accepts dropped text; a dropped FILE is handled differently by each site (the "Attach as file" button covers that)
      e.dataTransfer.effectAllowed = 'copy';
    });
    return h('div', { class: 'card', 'data-testid': 'hotswap-result' },
      h('div', {}, h('span', { class: `tier ${s.tier === 'partial' ? 'partial' : ''}` }, s.tier), ` ${s.turns} turns read, ${s.tail} word for word`),
      h('ul', {},
        h('li', {}, `${s.codeBlocks} code block(s) kept exactly`),
        h('li', {}, `Secrets removed: ${s.secrets}`),
        h('li', {}, s.complete)),
      ...s.notes.slice(0, 3).map((n) => h('div', { class: 'note' }, n)),
      h('h3', {}, '2. Continue elsewhere'),
      h('div', { class: 'row' },
        h('button', { class: 'primary', 'data-testid': 'hotswap-insert', onclick: () => hd.insertCurrent() }, 'Insert into this chat'),
        h('button', { 'data-testid': 'hotswap-copy', onclick: () => hd.copyCurrent() }, 'Copy'),
        h('button', { 'data-testid': 'hotswap-download', onclick: () => hd.downloadCurrent() }, 'Download .md'),
        h('button', { 'data-testid': 'hotswap-save', onclick: () => hd.saveCurrent() }, 'Save'),
        h('button', { 'data-testid': 'hotswap-attach', onclick: () => hd.attachCurrent() }, 'Attach as file')),
      drag,
      h('textarea', { readonly: 'readonly', 'data-testid': 'hotswap-preview', 'aria-label': 'Capsule preview' }, md));
  }
}
