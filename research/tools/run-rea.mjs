// Runs REA (rea analyze-javascript-application) on each research target and saves the raw output under ../rea-raw/.
// REA reads the code as text and never runs it. Needs Node 22.19+ and REA (set REA_CLI, default: the Code Crew install).
//   node tools/run-rea.mjs [name ...]
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = process.env.REA_CLI ?? 'D:/Projects/code-crew/tools/node_modules/rea-agents/scripts/rea.mjs';
const pkg = JSON.parse(readFileSync(join(dirname(dirname(CLI)), 'package.json'), 'utf8'));
const TARGETS = {
  dropdat: 'downloads/dropdat/x',
  contextswitch: 'downloads/contextswitch/x',
  capsulehub: 'downloads/capsulehub/x',
  contextcapsule: 'downloads/contextcapsule/x',
  aicontextsaver: 'downloads/aicontextsaver/x',
  llmcontextbridge: 'downloads/llmcontextbridge/x',
  clio: 'repos/Clio/extensions',
  'gemini-export': 'repos/gemini-export',
  'ai-chat-exporter': 'repos/ai-chat-exporter',
  'aicontextcapsule-repo': 'repos/AIContextCapsule',
};
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(TARGETS);
mkdirSync(join(HERE, 'rea-raw'), { recursive: true });
for (const n of names) {
  const dir = join(HERE, TARGETS[n]);
  if (!existsSync(dir)) { console.log(`${n}: missing ${dir}`); continue; }
  const t0 = Date.now();
  try {
    const raw = execFileSync(process.execPath, [CLI, 'analyze-javascript-application', dir, '--json'], { maxBuffer: 1024 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'], timeout: 600000 });
    writeFileSync(join(HERE, 'rea-raw', `${n}.json`), raw);
    writeFileSync(join(HERE, 'rea-raw', `${n}.meta.json`), JSON.stringify({ target: TARGETS[n], version: pkg.version, node: process.versions.node, milliseconds: Date.now() - t0 }));
    console.log(`${n}: ${(raw.length / 1024).toFixed(0)} KB in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  } catch (e) {
    console.log(`${n}: REA failed (${String(e.message).slice(0, 120)})`);
  }
}
