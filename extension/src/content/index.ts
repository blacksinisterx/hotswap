// The content script: runs on a supported chat page, adds the Hotswap button, and wires capture, insert, copy,
// download, save, limit hints and the right-click commands together.
import { buildCapsule } from '../../../src/core/capsule.ts';
import type { Capsule, Preset } from '../../../src/core/capsule.ts';
import { renderCapsule } from '../../../src/core/render.ts';
import { getProbe, getSettings, latestCapsule, listCapsules, probeLog, saveCapsule, deleteCapsule } from '../shared/storage.ts';
import type { StoredCapsule } from '../shared/storage.ts';
import { pickAdapter } from './adapters/index.ts';
import { captureMessages, toSession } from './capture.ts';
import { attachFile, insertText } from './inject.ts';
import { watchLimits } from './limit.ts';
import { HotswapUI } from './ui.ts';

declare const __DEV__: boolean;

const adapter = pickAdapter(location, document, __DEV__);
if (adapter && !document.querySelector('hotswap-root')) start(adapter);

function start(a: NonNullable<typeof adapter>): void {
  let current: { capsule: Capsule; md: string } | null = null;
  let probe = false;
  let preset: Preset = 'standard';

  const file = () => `hotswap-${a.id}-${current?.capsule.id ?? 'capsule'}.hotswap.md`;
  const log = (kind: 'capture' | 'inject' | 'limit' | 'adapter', data: Record<string, unknown>) => { if (probe) void probeLog({ site: a.id, kind, data }); };

  const toStored = (c: Capsule, md: string): StoredCapsule => ({ id: c.id, createdAt: c.createdAt, title: c.source.title ?? 'Untitled chat', site: a.name, tier: c.fidelity.tier, turns: c.fidelity.messagesRead, bytes: new TextEncoder().encode(md).length, text: md });

  const refreshSaved = async () => ui.setSaved(await listCapsules());

  async function copy(text: string): Promise<boolean> {
    try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
  }

  async function insert(text: string, label: string): Promise<void> {
    const box = a!.composer(document);
    if (!box) {
      const ok = await copy(text);
      ui.toast(`Could not find the message box on this page. ${ok ? 'The capsule is on your clipboard: paste it with Ctrl+V.' : 'Use Copy instead.'}`, [], 'error');
      log('inject', { ok: false, reason: 'no composer', health: a!.selectorHealth(document) });
      return;
    }
    const r = await insertText(box, text);
    log('inject', { ok: r.ok, technique: r.technique, tried: r.tried, size: text.length, health: a!.selectorHealth(document) });
    if (r.ok) ui.toast(`${label} inserted into the message box. Read it, then press Enter yourself.`);
    else {
      const ok = await copy(text);
      ui.toast(`Could not insert it automatically. ${ok ? 'It is on your clipboard: click the message box and paste with Ctrl+V.' : 'Use Copy and paste it yourself.'}`, [], 'error');
    }
  }

  async function capture(p: Preset): Promise<void> {
    preset = p;
    ui.setBusy('Reading this conversation...');
    try {
      const { messages, flags } = await captureMessages(a!, document, { onProgress: (t) => ui.setBusy(t) });
      if (!messages.length) {
        ui.setBusy(null);
        log('capture', { ok: false, health: a!.selectorHealth(document) });
        ui.toast('No messages were found on this page. Open a conversation first. (If you are in one, this site may have changed; the probe report in the panel footer helps fix that.)', [], 'error');
        return;
      }
      const session = toSession(a!, document, location, messages, flags);
      const capsule = buildCapsule(session, { preset: p });
      const md = renderCapsule(capsule);
      current = { capsule, md };
      const f = capsule.fidelity;
      const red = Object.entries(f.redactions).map(([k, v]) => `${v} ${k}`).join(', ');
      ui.showResult({
        turns: f.messagesRead, tail: f.messagesInTail, codeBlocks: f.codeBlocksInVault, secrets: red || 'none found', tier: f.tier,
        complete: flags.reachedTop === true ? 'Read from the start of the conversation' : `The start of the conversation was not clearly reached (${flags.stoppedBecause})`,
        notes: f.notes,
      }, md);
      log('capture', { ok: true, turns: f.messagesRead, codeBlocks: f.codeBlocksFound, flags, health: a!.selectorHealth(document) });
    } catch (e) {
      ui.setBusy(null);
      ui.toast(`Capture failed: ${(e as Error).message}`, [], 'error');
    }
  }

  const ui: HotswapUI = new HotswapUI(a.name, {
    capture: (p) => void capture(p),
    insertCurrent: () => { if (current) void insert(current.md, 'The capsule'); },
    attachCurrent: async () => {
      if (!current) return;
      const box = a.composer(document);
      if (!box) { ui.toast('Could not find the message box on this page.', [], 'error'); return; }
      await attachFile(box, file(), current.md);
      log('inject', { ok: 'attempted', technique: 'file-paste-and-drop' });
      ui.toast('Attached as a file (tried paste and drop). If no file shows up in the message box, use Insert or Copy instead.');
    },
    copyCurrent: async () => { if (current) ui.toast((await copy(current.md)) ? 'Copied. Paste it into the other AI.' : 'The browser blocked copying. Use Download instead.'); },
    downloadCurrent: () => {
      if (!current) return;
      const url = URL.createObjectURL(new Blob([current.md], { type: 'text/markdown' }));
      const link = document.createElement('a');
      link.href = url; link.download = file();
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    },
    saveCurrent: async () => { if (!current) return; await saveCapsule(toStored(current.capsule, current.md)); await refreshSaved(); ui.toast('Saved. Open another chat and press "Insert here".'); },
    insertSaved: async (id) => { const s = (await listCapsules()).find((x) => x.id === id); if (s) await insert(s.text, 'The saved capsule'); },
    copySaved: async (id) => { const s = (await listCapsules()).find((x) => x.id === id); if (s) ui.toast((await copy(s.text)) ? 'Copied.' : 'The browser blocked copying.'); },
    deleteSaved: async (id) => { await deleteCapsule(id); await refreshSaved(); },
    dragPayload: () => (current ? { text: current.md, name: file() } : null),
    probeReport: async () => {
      const report = { extension: chrome.runtime.getManifest().version, site: a.id, host: location.hostname, health: a.selectorHealth(document), entries: await getProbe() };
      ui.toast((await copy(JSON.stringify(report, null, 2))) ? 'Probe report copied. It holds counts, techniques and banner text only, no chat text.' : 'Could not copy the probe report.');
    },
  });
  ui.mount();
  void refreshSaved();

  void getSettings().then((s) => {
    probe = s.probe; preset = s.preset;
    ui.setPreset(s.preset); ui.setProbe(s.probe);
    log('adapter', { health: a.selectorHealth(document), url: location.pathname.split('/')[1] ?? '' });
    if (s.limitHints) {
      watchLimits(document, (text) => {
        log('limit', { text: text.slice(0, 300) });
        ui.toast('This looks like a usage limit (experimental). Capture this chat now so you can continue in another AI.', [{ label: 'Capture now', primary: true, run: () => { ui.open(); void capture(preset); } }], 'info', 20000);
      });
    }
  });
  chrome.storage.onChanged.addListener((ch) => {
    if (ch.settings) { const s = ch.settings.newValue as { probe?: boolean }; probe = !!s?.probe; ui.setProbe(probe); }
    if (ch.capsules) void refreshSaved();
  });

  chrome.runtime.onMessage.addListener((msg: { type?: string; id?: string }) => {
    if (msg?.type === 'hotswap:open') ui.open();
    else if (msg?.type === 'hotswap:capture') { ui.open(); void capture(preset); }
    else if (msg?.type === 'hotswap:insert-latest') void latestCapsule().then((s) => (s ? insert(s.text, 'The latest saved capsule') : ui.toast('No saved capsule yet. Capture a chat and press Save first.', [], 'error')));
    else if (msg?.type === 'hotswap:insert' && msg.id) void listCapsules().then((l) => { const s = l.find((x) => x.id === msg.id); if (s) void insert(s.text, 'The saved capsule'); });
  });
}
