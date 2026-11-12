import { deleteCapsule, getSettings, listCapsules, setSettings } from '../shared/storage.ts';
import type { Preset } from '../../../src/core/capsule.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function activeTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}
const tell = async (msg: object) => { const id = await activeTabId(); if (id) await chrome.tabs.sendMessage(id, msg).catch(() => alert('Open a ChatGPT, Claude or Gemini chat first.')); };

async function render(): Promise<void> {
  const list = await listCapsules();
  const box = $('list');
  box.replaceChildren();
  if (!list.length) { box.textContent = 'Nothing saved yet.'; box.className = 'hint'; return; }
  box.className = '';
  for (const c of list) {
    const row = document.createElement('div');
    row.className = 'item';
    const t = document.createElement('div');
    t.className = 't';
    const a = document.createElement('div'); a.textContent = c.title || 'Untitled';
    const b = document.createElement('small'); b.textContent = `${c.site} · ${c.tier} · ${(c.bytes / 1024).toFixed(0)} KB`;
    t.append(a, b);
    const act = document.createElement('div'); act.className = 'row';
    const mk = (label: string, fn: () => void) => { const x = document.createElement('button'); x.textContent = label; x.addEventListener('click', fn); act.append(x); };
    mk('Insert', () => void tell({ type: 'hotswap:insert', id: c.id }));
    mk('Copy', () => void navigator.clipboard.writeText(c.text));
    mk('×', () => void deleteCapsule(c.id).then(render));
    row.append(t, act);
    box.append(row);
  }
}

$('open').addEventListener('click', () => void tell({ type: 'hotswap:open' }).then(() => window.close()));
void getSettings().then((s) => {
  ($('preset') as HTMLSelectElement).value = s.preset;
  ($('hints') as HTMLInputElement).checked = s.limitHints;
  ($('probe') as HTMLInputElement).checked = s.probe;
});
$('preset').addEventListener('change', (e) => void setSettings({ preset: (e.target as HTMLSelectElement).value as Preset }));
$('hints').addEventListener('change', (e) => void setSettings({ limitHints: (e.target as HTMLInputElement).checked }));
$('probe').addEventListener('change', (e) => void setSettings({ probe: (e.target as HTMLInputElement).checked }));
void render();
chrome.storage.onChanged.addListener(() => void render());
