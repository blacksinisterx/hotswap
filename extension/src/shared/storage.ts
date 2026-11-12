// Everything is kept in chrome.storage.local, on this computer. Nothing is sent anywhere.
import type { Preset } from '../../../src/core/capsule.ts';

export interface Settings { preset: Preset; probe: boolean; limitHints: boolean }
export const DEFAULTS: Settings = { preset: 'standard', probe: false, limitHints: true };

export interface StoredCapsule {
  id: string;
  createdAt: string;
  title: string;
  site: string;
  tier: string;
  turns: number;
  bytes: number;
  text: string;
}

export interface ProbeEntry { t: string; site: string; kind: 'capture' | 'inject' | 'limit' | 'adapter'; data: Record<string, unknown> }

const MAX_CAPSULES = 12;
const MAX_PROBE = 200;

export async function getSettings(): Promise<Settings> {
  const r = await chrome.storage.local.get('settings');
  return { ...DEFAULTS, ...(r.settings as Partial<Settings> | undefined) };
}
export const setSettings = (s: Partial<Settings>): Promise<void> => getSettings().then((cur) => chrome.storage.local.set({ settings: { ...cur, ...s } }));

export async function listCapsules(): Promise<StoredCapsule[]> {
  const r = await chrome.storage.local.get('capsules');
  return (r.capsules as StoredCapsule[] | undefined) ?? [];
}
export async function saveCapsule(c: StoredCapsule): Promise<void> {
  const all = (await listCapsules()).filter((x) => x.id !== c.id);
  await chrome.storage.local.set({ capsules: [c, ...all].slice(0, MAX_CAPSULES) });
}
export async function deleteCapsule(id: string): Promise<void> {
  await chrome.storage.local.set({ capsules: (await listCapsules()).filter((x) => x.id !== id) });
}
export const latestCapsule = async (): Promise<StoredCapsule | undefined> => (await listCapsules())[0];

export async function probeLog(entry: Omit<ProbeEntry, 't'>): Promise<void> {
  const r = await chrome.storage.local.get('probe');
  const list = ((r.probe as ProbeEntry[] | undefined) ?? []).concat({ t: new Date().toISOString(), ...entry }).slice(-MAX_PROBE);
  await chrome.storage.local.set({ probe: list });
}
export async function getProbe(): Promise<ProbeEntry[]> {
  const r = await chrome.storage.local.get('probe');
  return (r.probe as ProbeEntry[] | undefined) ?? [];
}
export const clearProbe = (): Promise<void> => chrome.storage.local.remove('probe');
