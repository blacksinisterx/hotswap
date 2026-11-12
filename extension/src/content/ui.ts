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
* { box-sizing: border-box; font-family: ui-rounded, "Segoe UI Variable", "Segoe UI", system-ui, -apple-system, sans-serif; }

/* ---- the mascot button ---- */
.chip { position: fixed; right: 14px; bottom: 10px; z-index: 2147483647; width: 66px; height: 92px; padding: 0; border: none; background: none; cursor: pointer; perspective: 260px; -webkit-tap-highlight-color: transparent; }
.chip:focus-visible { outline: 2px solid #ffd23f; outline-offset: 2px; border-radius: 18px; }
.chip:hover:not(:disabled), .chip:active:not(:disabled) { background: none; border-color: transparent; transform: none; }
.mascot { width: 66px; height: 92px; display: block; overflow: visible; filter: drop-shadow(0 6px 10px rgba(0,0,0,.28)); }
.mascot * { transform-box: fill-box; }
.shadow { fill: rgba(0,0,0,.28); transform-origin: center; }
.bob { transform-origin: 50% 100%; }
.eye-happy, .mouth-open, .mouth-wavy, .spark, .sweat { display: none; }
.eye { fill: #1b1722; } .eye-shine { fill: #fff; }
.eye-happy, .mouth { fill: none; stroke: #1b1722; stroke-width: 2.4; stroke-linecap: round; }
.mouth-open { fill: #1b1722; stroke: none; }
.cheek { fill: #ff8fa3; opacity: .65; }
.outline { fill: none; stroke: #1b1722; stroke-width: 2.4; stroke-linejoin: round; }
.top { fill: #ff8a3d; } .bottom { fill: #fff1de; } .seam { stroke: #1b1722; stroke-width: 1.6; opacity: .22; }
.shine { fill: #fff; opacity: .55; }
.limb { fill: #fff1de; stroke: #1b1722; stroke-width: 2.2; }
.foot { fill: #ff8a3d; stroke: #1b1722; stroke-width: 2.2; }
.flame-wrap { transform-origin: 50% 100%; transition: transform .3s cubic-bezier(.2,1.4,.4,1); }
.flame { transform-origin: 50% 100%; }
.f1 { fill: #ff4d1f; stroke: #1b1722; stroke-width: 1.8; stroke-linejoin: round; } .f2 { fill: #ff9d1f; } .f3 { fill: #ffe45c; } .f0 { fill: #ff7a1f; }
.chip[data-mood="alert"] .flame-wrap { transform: scale(1.3); }
.chip[data-mood="busy"] .flame-wrap { transform: scale(1.12) skewX(-8deg); }
.spark { fill: #ffd23f; } .sweat { fill: #7dd3fc; stroke: #1b1722; stroke-width: 1.4; }

.chip[data-mood="happy"] .eye-open, .chip[data-mood="happy"] .mouth-smile { display: none; }
.chip[data-mood="happy"] .eye-happy, .chip[data-mood="happy"] .mouth-open, .chip[data-mood="happy"] .spark { display: inline; }
.chip[data-mood="alert"] .mouth-smile, .chip[data-mood="oops"] .mouth-smile { display: none; }
.chip[data-mood="alert"] .mouth-wavy, .chip[data-mood="oops"] .mouth-wavy { display: inline; }
.chip[data-mood="alert"] .sweat { display: inline; }
.chip[data-mood="busy"] .eye-open { transform: translateX(1.5px); }

.bubble { position: absolute; right: 56px; bottom: 74px; white-space: nowrap; background: #fff; color: #1b1722; font: 800 12px ui-rounded, system-ui, sans-serif; padding: 6px 11px; border-radius: 12px 12px 4px 12px; box-shadow: 0 6px 18px rgba(0,0,0,.3); opacity: 0; transform: translateY(6px) scale(.9); transform-origin: bottom right; pointer-events: none; transition: opacity .2s, transform .25s cubic-bezier(.2,1.4,.4,1); }
.chip[data-mood="alert"] .bubble, .chip:hover .bubble { opacity: 1; transform: none; }
.chip[data-mood="busy"] .bubble { opacity: 0; }

@media (prefers-reduced-motion: no-preference) {
  .chip { animation: drop .7s cubic-bezier(.3,1.5,.5,1) both; }
  .bob { animation: float 3.2s ease-in-out infinite; }
  .shadow { animation: shade 3.2s ease-in-out infinite; }
  .f1 { animation: flick .7s ease-in-out infinite; }
  .f2 { animation: flick .5s ease-in-out infinite reverse; }
  .f3 { animation: flick .36s ease-in-out infinite; }
  .f0 { animation: flick .6s ease-in-out infinite .15s; }
  .chip[data-mood="alert"] .flame { animation-duration: .25s; }
  .eyes { animation: blink 5.5s infinite; transform-origin: 50% 50%; }
  .chip:hover .bob { animation: wiggle .55s ease-in-out infinite; }
  .chip:hover .arm-r { animation: wave .45s ease-in-out infinite; transform-origin: 20% 80%; }
  .chip:active .bob { animation: none; transform: scale(1.12, .88); }
  .chip[data-mood="busy"] .mascot { animation: flip 1.1s cubic-bezier(.5,0,.5,1) infinite; }
  .chip[data-mood="busy"] .bob { animation: none; }
  .chip[data-mood="happy"] .bob { animation: hop .62s ease-out 3; }
  .chip[data-mood="happy"] .spark { animation: twinkle .8s ease-in-out infinite; transform-origin: center; }
  .chip[data-mood="happy"] .spark:nth-of-type(2) { animation-delay: .25s; }
  .chip[data-mood="happy"] .spark:nth-of-type(3) { animation-delay: .5s; }
  .chip[data-mood="alert"] .bob { animation: shake .5s ease-in-out infinite; }
  .chip[data-mood="alert"] .sweat { animation: drip 1.1s ease-in infinite; }
  .chip[data-mood="oops"] .bob { animation: oops .6s ease-in-out 2; }
  .panel.open { animation: panelIn .32s cubic-bezier(.2,1.25,.4,1); }
  .toast { animation: toastIn .3s cubic-bezier(.2,1.3,.4,1); }
  .bar i { animation: slide 1.1s ease-in-out infinite; }
  .drag .pillicon { animation: float 2.4s ease-in-out infinite; }
  button { transition: transform .12s, background .15s, box-shadow .15s; }
  button:hover:not(:disabled) { transform: translateY(-1px); }
  button:active:not(:disabled) { transform: scale(.96); }
  @keyframes flick { 0%, 100% { transform: scale(1, 1) skewX(0); } 25% { transform: scale(.93, 1.12) skewX(-5deg); } 50% { transform: scale(1.06, .94) skewX(4deg); } 75% { transform: scale(.96, 1.08) skewX(-2deg); } }
  @keyframes drop { from { transform: translateY(-140px) scale(.8); opacity: 0; } 60% { opacity: 1; } }
  @keyframes float { 50% { transform: translateY(-4px); } }
  @keyframes shade { 50% { transform: scale(.82); opacity: .7; } }
  @keyframes blink { 0%, 93%, 100% { transform: scaleY(1); } 96% { transform: scaleY(.08); } }
  @keyframes wiggle { 25% { transform: rotate(-7deg) translateY(-2px); } 75% { transform: rotate(7deg) translateY(-2px); } }
  @keyframes wave { 50% { transform: rotate(-35deg); } }
  @keyframes flip { to { transform: rotateY(360deg); } }
  @keyframes hop { 0% { transform: scale(1.1, .88); } 35% { transform: translateY(-18px) scale(.94, 1.08); } 65% { transform: translateY(0) scale(1.1, .88); } 100% { transform: none; } }
  @keyframes twinkle { 0%, 100% { transform: scale(.2) rotate(0); opacity: 0; } 50% { transform: scale(1.1) rotate(45deg); opacity: 1; } }
  @keyframes shake { 20% { transform: rotate(-6deg); } 40% { transform: rotate(6deg); } 60% { transform: rotate(-4deg); } 80% { transform: rotate(4deg); } }
  @keyframes drip { 0% { transform: translateY(-3px) scale(.6); opacity: 0; } 40% { opacity: 1; } 100% { transform: translateY(8px) scale(1); opacity: 0; } }
  @keyframes oops { 25% { transform: rotate(-9deg) translateY(2px); } 75% { transform: rotate(9deg) translateY(2px); } }
  @keyframes panelIn { from { opacity: 0; transform: translateY(14px) scale(.92); } }
  @keyframes toastIn { from { opacity: 0; transform: translateY(14px) scale(.9); } }
  @keyframes slide { from { transform: translateX(-100%); } to { transform: translateX(260%); } }
}

/* ---- the panel ---- */
.panel { position: fixed; right: 16px; bottom: 110px; z-index: 2147483647; width: 392px; max-height: calc(100vh - 134px); overflow: auto; color: #ece9f6; border: 1px solid #38334a; border-radius: 20px; background: radial-gradient(120% 80% at 100% 0%, #2a1f35 0%, #17141f 55%); box-shadow: 0 18px 60px rgba(8,4,20,.65), inset 0 1px 0 rgba(255,255,255,.06); padding: 14px 16px 12px; font-size: 13px; line-height: 1.45; display: none; transform-origin: bottom right; scrollbar-width: thin; scrollbar-color: #3a3550 transparent; }
.panel.open { display: block; }
h2 { margin: 0; display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.brand { display: flex; align-items: center; gap: 9px; font-size: 16px; font-weight: 800; letter-spacing: -.01em; }
.brand .mascot { width: 36px; height: 50px; filter: none; }
.brand .mascot .bob, .brand .mascot .shadow { animation: none; }
.site { font-size: 11px; font-weight: 700; color: #ffb77f; background: rgba(255,138,61,.13); border: 1px solid rgba(255,138,61,.3); border-radius: 999px; padding: 2px 9px; }
h3 { margin: 16px 0 8px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .09em; color: #c9bfe6; display: flex; align-items: center; gap: 8px; }
h3 b { display: inline-grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; background: linear-gradient(135deg, #ffb06a, #ff6b3d); color: #1b1722; font-size: 11px; }
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
button, select { font: 700 12px ui-rounded, system-ui, sans-serif; border-radius: 11px; border: 1px solid #423c58; background: #221e30; color: #ece9f6; padding: 8px 12px; cursor: pointer; }
button:hover:not(:disabled) { background: #2d2840; border-color: #5a5278; }
button.primary { background: linear-gradient(135deg, #ffa05a, #ff6b3d); color: #1b1722; border-color: transparent; box-shadow: 0 4px 14px rgba(255,107,61,.35); }
button.primary:hover:not(:disabled) { background: linear-gradient(135deg, #ffb070, #ff7a50); box-shadow: 0 6px 18px rgba(255,107,61,.5); }
button:disabled { opacity: .55; cursor: default; }
button:focus-visible, select:focus-visible { outline: 2px solid #ffd23f; outline-offset: 1px; }
.x { background: rgba(255,255,255,.06); border: none; color: #b8b0d0; font-size: 18px; line-height: 1; width: 28px; height: 28px; padding: 0; border-radius: 50%; }
.status { color: #c4bcdc; margin: 8px 0 0; min-height: 18px; }
.bar { height: 5px; border-radius: 99px; background: #2a2540; overflow: hidden; margin-top: 8px; }
.bar i { display: block; width: 38%; height: 100%; border-radius: 99px; background: linear-gradient(90deg, #ff8a3d, #ffd23f); }
.card { background: rgba(255,255,255,.04); border: 1px solid #38334a; border-radius: 14px; padding: 11px 13px; margin-top: 12px; }
.card ul { margin: 6px 0 0; padding-left: 18px; color: #d8d2ec; }
.card li { margin: 2px 0; }
.tier { display: inline-block; border-radius: 999px; padding: 1px 10px; font-size: 11px; font-weight: 800; background: #1f4a36; color: #7cf0b0; }
.tier.partial { background: #4d3b12; color: #ffd36b; }
.note { color: #b3abcc; font-size: 12px; margin-top: 6px; }
.pillicon { display: inline-block; flex: none; width: 12px; height: 20px; border-radius: 7px; border: 2px solid #1b1722; background: linear-gradient(#ff8a3d 50%, #fff1de 50%); box-shadow: 0 0 0 1px rgba(255,255,255,.08); }
.drag { margin-top: 12px; padding: 11px 12px; border: 2px dashed #ff8a3d; border-radius: 14px; color: #ffc698; cursor: grab; text-align: center; user-select: none; display: flex; justify-content: center; align-items: center; gap: 10px; font-weight: 700; background: rgba(255,138,61,.06); }
.drag:hover { background: rgba(255,138,61,.14); }
.drag:active { cursor: grabbing; }
textarea { width: 100%; height: 120px; margin-top: 10px; background: #0f0d15; color: #cfc9e4; border: 1px solid #38334a; border-radius: 12px; font: 11px ui-monospace, Consolas, monospace; padding: 9px; resize: vertical; }
.saved { display: flex; justify-content: space-between; gap: 10px; align-items: center; padding: 8px 10px; margin-top: 6px; background: rgba(255,255,255,.035); border: 1px solid #2f2a40; border-radius: 12px; }
.saved .title { flex: 1; min-width: 0; display: flex; align-items: center; gap: 9px; }
.saved .title > span:last-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.saved .row { flex-wrap: nowrap; flex-shrink: 0; gap: 5px; }
.saved button { padding: 5px 9px; }
.saved small { color: #9b93b6; }
.foot { margin-top: 14px; color: #9b93b6; font-size: 11px; }
.link { background: none; border: none; color: #b8b0d0; text-decoration: underline; padding: 0; font-weight: 600; }
.link:hover:not(:disabled) { background: none; }
.toast { position: fixed; right: 16px; bottom: 110px; z-index: 2147483647; max-width: 360px; background: #1c1827; color: #ece9f6; border: 1px solid #ff8a3d; border-radius: 16px; padding: 12px 15px; font-size: 13px; box-shadow: 0 12px 36px rgba(8,4,20,.6); }
.toast .row { margin-top: 9px; }
.toast.error { border-color: #ff6b81; }
`;

const NS = 'http://www.w3.org/2000/svg';
function s(tag: string, attrs: Record<string, string | number> = {}, ...kids: SVGElement[]): SVGElement {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  el.append(...kids);
  return el as SVGElement;
}

// The mascot: a little two-tone capsule (the thing Hotswap carries between chats) with a face, arms and feet.
// Built with createElementNS, not innerHTML, so sites that block HTML strings (Trusted Types) cannot stop it.
function mascot(): SVGElement {
  const star = 'M0 -5 Q0 0 5 0 Q0 0 0 5 Q0 0 -5 0 Q0 0 0 -5Z';
  const sparks = [[7, 14], [58, 22], [56, 56]].map(([x, y]) => s('path', { class: 'spark', d: star, transform: `translate(${x} ${y})` }));
  return s('svg', { class: 'mascot', viewBox: '0 -16 64 90', 'aria-hidden': 'true' },
    s('ellipse', { class: 'shadow', cx: 32, cy: 70, rx: 15, ry: 3 }),
    s('g', { class: 'bob' },
      s('ellipse', { class: 'foot', cx: 25, cy: 62.5, rx: 6, ry: 3.6 }),
      s('ellipse', { class: 'foot', cx: 39, cy: 62.5, rx: 6, ry: 3.6 }),
      s('circle', { class: 'limb arm-l', cx: 12, cy: 42, r: 4.6 }),
      s('circle', { class: 'limb arm-r', cx: 52, cy: 42, r: 4.6 }),
      s('g', { class: 'flame-wrap' },
        s('path', { class: 'f0 flame', d: 'M22 10 C21 5 24 4 24 -1 C28 1 28 6 27 11 Z' }),
        s('path', { class: 'f0 flame', d: 'M42 10 C43 5 40 4 40 -1 C36 1 36 6 37 11 Z' }),
        s('path', { class: 'f1 flame', d: 'M32 -14 C33 -7 40 -4 40 3 C40 9 36 13 32 13 C28 13 24 9 24 3 C24 -1 27 -2 28 -7 C30 -5 31 -8 32 -14 Z' }),
        s('path', { class: 'f2 flame', d: 'M32 -5 C33 -1 37 1 37 6 C37 10 34.5 12 32 12 C29.5 12 27 10 27 6 C27 3 30 1.5 32 -5 Z' }),
        s('path', { class: 'f3 flame', d: 'M32 3 C33 5 35 6.5 35 9 C35 11 33.7 12 32 12 C30.3 12 29 11 29 9 C29 7 31 6 32 3 Z' })),
      s('path', { class: 'top', d: 'M14 24 A18 18 0 0 1 50 24 V28 H14 Z' }),
      s('path', { class: 'bottom', d: 'M14 28 H50 V44 A18 18 0 0 1 14 44 Z' }),
      s('path', { class: 'seam', d: 'M14 28 H50' }),
      s('rect', { class: 'shine', x: 19, y: 11, width: 4.5, height: 13, rx: 2.2, transform: 'rotate(8 21 17)' }),
      s('path', { class: 'outline', d: 'M14 24 A18 18 0 0 1 50 24 V44 A18 18 0 0 1 14 44 Z' }),
      s('g', { class: 'eyes' },
        s('g', { class: 'eye-open' },
          s('ellipse', { class: 'eye', cx: 25.5, cy: 38, rx: 3.1, ry: 4 }), s('circle', { class: 'eye-shine', cx: 26.6, cy: 36.4, r: 1.2 }),
          s('ellipse', { class: 'eye', cx: 38.5, cy: 38, rx: 3.1, ry: 4 }), s('circle', { class: 'eye-shine', cx: 39.6, cy: 36.4, r: 1.2 })),
        s('path', { class: 'eye-happy', d: 'M22.3 39.5 Q25.5 34 28.7 39.5 M35.3 39.5 Q38.5 34 41.7 39.5' })),
      s('ellipse', { class: 'cheek', cx: 20, cy: 44.5, rx: 3.3, ry: 2 }),
      s('ellipse', { class: 'cheek', cx: 44, cy: 44.5, rx: 3.3, ry: 2 }),
      s('path', { class: 'mouth mouth-smile', d: 'M28.5 46 Q32 50 35.5 46' }),
      s('path', { class: 'mouth-open', d: 'M27.5 45 Q32 54 36.5 45 Z' }),
      s('path', { class: 'mouth mouth-wavy', d: 'M27.5 48.5 Q29.7 45.5 32 48.5 T36.5 48.5' }),
      s('path', { class: 'sweat', d: 'M49 14 Q53 21 49 24 Q45 21 49 14Z' }),
      ...sparks));
}

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

type Mood = 'idle' | 'busy' | 'happy' | 'oops' | 'alert';

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
  private chip: HTMLElement;
  private tempMood: Mood | null = null;
  private moodTimer = 0;

  private site: string;
  private handlers: Handlers;

  constructor(site: string, handlers: Handlers) {
    this.site = site;
    this.handlers = handlers;
    this.host = document.createElement('hotswap-root');
    this.root = this.host.attachShadow({ mode: 'open' });
    this.root.append(h('style', {}, CSS));
    this.chip = h('button', { class: 'chip', 'data-testid': 'hotswap-chip', 'data-mood': 'idle', 'aria-label': 'Open Hotswap', title: 'Hotswap', onclick: () => this.toggle() }, h('div', { class: 'bubble' }, 'Limit hit? Grab it!'), mascot());
    this.body = h('div');
    this.panel = h('div', { class: 'panel', role: 'dialog', 'aria-label': 'Hotswap', 'data-testid': 'hotswap-panel' }, this.body);
    this.root.append(this.panel, this.chip);
    this.render();
  }

  mount(): void { document.documentElement.append(this.host); }
  open(): void { this.panel.classList.add('open'); }
  close(): void { this.panel.classList.remove('open'); }
  toggle(): void { this.panel.classList.toggle('open'); }
  isOpen(): boolean { return this.panel.classList.contains('open'); }
  setPreset(p: Preset): void { this.preset = p; this.render(); }
  setBusy(text: string | null): void { this.busy = text; this.render(); this.refreshMood(); }
  setSaved(list: StoredCapsule[]): void { this.saved = list; this.render(); }
  setProbe(on: boolean): void { this.probe = on; this.render(); }
  showResult(summary: Summary, md: string): void { this.result = { summary, md }; this.busy = null; this.render(); this.flash('happy', 2400); }

  // the mascot's mood: busy while reading, otherwise a short happy / oops / alert moment, then back to idle
  private flash(m: Mood, ms: number): void {
    clearTimeout(this.moodTimer);
    this.tempMood = m;
    this.chip.dataset.mood = 'idle'; // restart the animation even if the mood is the same as before
    void this.chip.offsetWidth;
    this.refreshMood();
    this.moodTimer = window.setTimeout(() => { this.tempMood = null; this.refreshMood(); }, ms);
  }
  private refreshMood(): void { this.chip.dataset.mood = this.busy ? 'busy' : (this.tempMood ?? 'idle'); }

  toast(text: string, actions: { label: string; run: () => void; primary?: boolean }[] = [], kind: 'info' | 'error' = 'info', ms = 9000): void {
    this.toastEl?.remove();
    clearTimeout(this.toastTimer);
    const row = actions.length ? h('div', { class: 'row' }, ...actions.map((a) => h('button', { class: a.primary ? 'primary' : '', onclick: () => { this.toastEl?.remove(); a.run(); } }, a.label))) : null;
    this.toastEl = h('div', { class: `toast ${kind}`, role: 'status', 'data-testid': 'hotswap-toast' }, h('div', {}, text), row);
    this.root.append(this.toastEl);
    if (kind === 'error') this.flash('oops', 3200);
    else if (actions.length) this.flash('alert', ms);
    else this.flash('happy', 2400);
    this.toastTimer = window.setTimeout(() => this.toastEl?.remove(), ms);
  }

  private render(): void {
    const hd = this.handlers;
    const select = h('select', { 'data-testid': 'hotswap-preset', 'aria-label': 'How much to carry word for word', onchange: (e: Event) => { this.preset = (e.target as HTMLSelectElement).value as Preset; } },
      ...([['minimal', 'Short (last 3 turns)'], ['standard', 'Standard (last 10)'], ['verbose', 'Long (last 20)'], ['full', 'Everything']] as const).map(([v, l]) => h('option', { value: v, ...(v === this.preset ? { selected: 'selected' } : {}) }, l)));
    const capture = h('button', { class: 'primary', 'data-testid': 'hotswap-capture', disabled: this.busy ? 'disabled' : false, onclick: () => hd.capture(this.preset) }, this.busy ? 'Reading...' : 'Capture this chat');
    const kids: Child[] = [
      h('h2', {}, h('span', { class: 'brand' }, mascot(), 'Hotswap', h('span', { class: 'site' }, `on ${this.site}`)), h('button', { class: 'x', 'aria-label': 'Close', onclick: () => this.close() }, '×')),
      h('h3', {}, h('b', {}, '1'), 'Capture'),
      h('div', { class: 'row' }, select, capture),
      h('div', { class: 'status', 'data-testid': 'hotswap-status', 'aria-live': 'polite' }, this.busy ?? ''),
      this.busy ? h('div', { class: 'bar' }, h('i')) : null,
    ];
    if (this.result) kids.push(this.resultCard(this.result));
    kids.push(h('h3', {}, 'Saved capsules'));
    if (!this.saved.length) kids.push(h('div', { class: 'note' }, 'Nothing saved yet. Capture a chat and press Save.'));
    for (const s of this.saved.slice(0, 5)) {
      kids.push(h('div', { class: 'saved', 'data-testid': 'hotswap-saved' },
        h('span', { class: 'title' }, h('span', { class: 'pillicon' }), h('span', {}, `${s.title || 'Untitled'} `, h('small', {}, `${s.site} · ${s.tier} · ${(s.bytes / 1024).toFixed(0)} KB`))),
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
    const drag = h('div', { class: 'drag', draggable: 'true', 'data-testid': 'hotswap-drag', title: 'Drag this onto the message box of another AI' }, h('span', { class: 'pillicon' }), 'Drag this capsule into another chat');
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
      h('h3', {}, h('b', {}, '2'), 'Continue elsewhere'),
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
