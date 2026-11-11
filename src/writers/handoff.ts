// Writes HANDOFF.md into the folder where the next AI will work, and says how to start it.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Capsule } from '../core/capsule.ts';
import { renderCapsule } from '../core/render.ts';

export type Target = 'claude' | 'codex' | 'gemini' | 'cursor' | 'antigravity' | 'web';

export const START_PROMPT = 'Read HANDOFF.md fully, then continue the task from "Latest request". Do not start over.';

export interface Start { how: string; command?: string; verified: boolean }

/** `claude "<prompt>"` starts an interactive session with that first message; the others are best-known forms. */
export function startFor(target: Target): Start {
  switch (target) {
    case 'claude': return { how: 'Open a terminal in the folder and run:', command: `claude "${START_PROMPT}"`, verified: true };
    case 'codex': return { how: 'Open a terminal in the folder and run (check `codex --help` if your version differs):', command: `codex "${START_PROMPT}"`, verified: false };
    case 'gemini': return { how: 'Open a terminal in the folder, start `gemini`, then paste this first message (flags differ between versions):', command: START_PROMPT, verified: false };
    case 'cursor': return { how: 'Open the folder in Cursor, open its agent chat and paste this first message:', command: START_PROMPT, verified: false };
    case 'antigravity': return { how: 'Open the folder in Antigravity, open the agent panel and paste this first message:', command: START_PROMPT, verified: false };
    case 'web': return { how: 'Open the other AI in your browser, attach HANDOFF.md (or paste its text) and add this line:', command: START_PROMPT, verified: true };
  }
}

export interface WrittenHandoff { path: string; bytes: number; start: Start }

export function writeHandoff(capsule: Capsule, dir: string, target: Target, opts: { force?: boolean; fileName?: string } = {}): WrittenHandoff {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, opts.fileName ?? 'HANDOFF.md');
  if (existsSync(path) && !opts.force) throw new Error(`${path} already exists. Use --force to replace it.`);
  const text = renderCapsule(capsule);
  writeFileSync(path, text, 'utf8');
  return { path, bytes: Buffer.byteLength(text), start: startFor(target) };
}
