#!/usr/bin/env node
// hotswap: switch AI mid-task without losing the thread.
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RedactionFailed, buildCapsule, PRESETS } from './core/capsule.ts';
import type { Capsule, Preset } from './core/capsule.ts';
import { renderCapsule, verifyCapsule } from './core/render.ts';
import type { SessionInfo, ToolName } from './core/types.ts';
import { antigravityRoot } from './readers/antigravity.ts';
import { codexRoot } from './readers/codex.ts';
import { geminiRoot } from './readers/geminiCli.ts';
import { claudeRoot, readClaude } from './readers/claudeCode.ts';
import { discover, pick, readSession } from './readers/index.ts';
import type { ToolChoice } from './readers/index.ts';
import { currentLimit, watchClaude } from './watch/limit.ts';
import type { LimitHit } from './watch/limit.ts';
import { startFor, writeHandoff } from './writers/handoff.ts';
import type { Target } from './writers/handoff.ts';

const HELP = `hotswap: switch AI mid-task without losing the thread

  hotswap list      [--from claude|antigravity|all] [--limit 10]
  hotswap capture   [--from ...] [--id ID] [--project DIR] [--preset minimal|standard|verbose|full] [--out FILE]
  hotswap to TARGET [--from ...] [--id ID] [--project DIR] [--preset ...] [--dir DIR] [--force]
                    TARGET: claude | codex | gemini | cursor | antigravity | web
  hotswap watch     [--once] [--to TARGET] [--interval SECONDS]     (Claude Code limit watcher)
  hotswap check FILE            (is this capsule exactly as Hotswap wrote it?)
  hotswap doctor                (what Hotswap can see on this machine)

No AI model is used and nothing leaves your computer. Secrets are removed before anything is written;
if that step fails, nothing is written.`;

interface Args { cmd: string; pos: string[]; flags: Record<string, string | true> }

function parse(argv: string[]): Args {
  const [cmd = 'help', ...rest] = argv;
  const pos: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith('--') && !['force', 'once'].includes(key)) { flags[key] = next; i += 1; } else flags[key] = true;
    } else pos.push(a);
  }
  return { cmd, pos, flags };
}

const str = (v: string | true | undefined): string | undefined => (typeof v === 'string' ? v : undefined);
const toolChoice = (v: string | undefined): ToolChoice => (v === 'claude' || v === 'claude-code' ? 'claude-code' : v === 'antigravity' ? 'antigravity' : v === 'codex' ? 'codex' : v === 'gemini-cli' || v === 'gemini' ? 'gemini-cli' : 'all');
const when = (ms: number) => new Date(ms).toISOString().replace('T', ' ').slice(0, 16);
const TARGETS: Target[] = ['claude', 'codex', 'gemini', 'cursor', 'antigravity', 'web'];

function die(msg: string, code = 1): never {
  console.error(msg);
  process.exit(code);
}

function preset(args: Args): Preset {
  const p = (str(args.flags.preset) ?? 'standard') as Preset;
  if (!(p in PRESETS)) die(`Unknown preset "${p}". Use minimal, standard, verbose or full.`);
  return p;
}

function chooseSession(args: Args): SessionInfo {
  const info = pick(toolChoice(str(args.flags.from)), { id: str(args.flags.id), project: str(args.flags.project) });
  if (!info) die('No matching session found. Run `hotswap doctor` to see what Hotswap can see.');
  return info;
}

function build(info: SessionInfo, p: Preset): Capsule {
  try {
    return buildCapsule(readSession(info), { preset: p });
  } catch (e) {
    if (e instanceof RedactionFailed) die(e.message, 2);
    throw e;
  }
}

function summary(c: Capsule): string[] {
  const f = c.fidelity;
  const red = Object.entries(f.redactions).map(([k, v]) => `${v} ${k}`).join(', ');
  return [
    `  source: ${c.source.tool}, session ${c.source.sessionId.slice(0, 8)}${c.source.title ? ` ("${c.source.title.slice(0, 50)}")` : ''}`,
    `  tier: ${f.tier}; turns read ${f.messagesRead}, word for word ${f.messagesInTail}; code blocks ${f.codeBlocksInVault}/${f.codeBlocksFound}`,
    `  secrets removed: ${red || 'none found'}`,
    ...f.notes.map((n) => `  note: ${n}`),
  ];
}

function cmdList(args: Args): void {
  const limit = Number(str(args.flags.limit) ?? 10);
  const all = discover(toolChoice(str(args.flags.from)));
  if (!all.length) { console.log('No sessions found. Run `hotswap doctor`.'); return; }
  for (const s of all.slice(0, limit)) console.log(`${when(s.mtimeMs)}  ${s.tool.padEnd(11)} ${s.id.slice(0, 8)}  ${(s.bytes / 1024).toFixed(0).padStart(6)} KB  ${s.cwd ?? ''}`);
  if (all.length > limit) console.log(`... and ${all.length - limit} more (use --limit)`);
}

function cmdCapture(args: Args): void {
  const info = chooseSession(args);
  const c = build(info, preset(args));
  const out = resolve(str(args.flags.out) ?? `hotswap-${info.tool}-${c.id}.hotswap.md`);
  writeFileSync(out, renderCapsule(c), 'utf8');
  console.log(`Capsule written: ${out}`);
  for (const l of summary(c)) console.log(l);
  console.log('Drag this file into another AI, or attach it, then say: ' + startFor('web').command);
}

function folderFor(c: Capsule, args: Args): string {
  const dir = str(args.flags.dir);
  if (dir) return resolve(dir);
  const cwd = c.workspace.cwd;
  return cwd && existsSync(cwd) && statSync(cwd).isDirectory() ? cwd : process.cwd();
}

function cmdTo(args: Args): void {
  const target = args.pos[0] as Target | undefined;
  if (!target || !TARGETS.includes(target)) die(`Say where to: hotswap to ${TARGETS.join('|')}`);
  const info = chooseSession(args);
  const c = build(info, preset(args));
  const w = writeHandoff(c, folderFor(c, args), target, { force: args.flags.force === true });
  console.log(`Handoff written: ${w.path} (${(w.bytes / 1024).toFixed(1)} KB)`);
  for (const l of summary(c)) console.log(l);
  console.log(`\n${w.start.how}\n\n  ${w.start.command}\n${w.start.verified ? '' : '\n(This start form is the best known one for that tool and has not been verified here.)'}`);
  console.log('\nHANDOFF.md can contain text from your project. Do not commit or share it unless you have read it.');
}

function announce(hit: LimitHit, args: Args): void {
  console.log(`\n=== Limit reached ${hit.at ? `(${hit.at})` : ''} ===`);
  console.log(`  ${hit.text}`);
  try {
    const c = buildCapsule(readClaude(hit.file), { preset: preset(args) });
    const target = (str(args.flags.to) ?? 'claude') as Target;
    const w = writeHandoff(c, folderFor(c, args), target, { force: true });
    console.log(`\nA capsule is ready: ${w.path}`);
    for (const l of summary(c)) console.log(l);
    console.log(`\n${w.start.how}\n\n  ${w.start.command}\n`);
  } catch (e) {
    console.error(e instanceof RedactionFailed ? e.message : `Could not build the capsule: ${(e as Error).message}`);
  }
}

async function cmdWatch(args: Args): Promise<void> {
  if (args.flags.once === true) {
    const hit = currentLimit();
    if (!hit) { console.log('The newest Claude Code session is not stuck on a limit.'); return; }
    announce(hit, args);
    return;
  }
  const ac = new AbortController();
  process.on('SIGINT', () => ac.abort());
  console.log(`Watching Claude Code sessions in ${claudeRoot()} (Ctrl+C to stop). Only new activity counts.`);
  await watchClaude({ signal: ac.signal, intervalMs: Number(str(args.flags.interval) ?? 2) * 1000, includeCurrent: true, onLimit: (h) => announce(h, args) });
}

function cmdCheck(args: Args): void {
  const file = args.pos[0];
  if (!file || !existsSync(file)) die('Give the capsule file: hotswap check FILE');
  const v = verifyCapsule(readFileSync(file, 'utf8'));
  console.log(`${v.ok ? 'OK' : 'NOT OK'}: ${v.reason}`);
  if (v.meta) console.log(`  id ${v.meta.id}, tier ${v.meta.tier}, ${v.meta.counts?.turns} turns, created ${v.meta.createdAt}`);
  process.exitCode = v.ok ? 0 : 1;
}

function cmdDoctor(): void {
  const rows: [string, string, ToolName][] = [['Claude Code', claudeRoot(), 'claude-code'], ['Antigravity', antigravityRoot(), 'antigravity'], ['Codex CLI (experimental)', codexRoot(), 'codex'], ['Gemini CLI (experimental)', geminiRoot(), 'gemini-cli']];
  console.log(`Node ${process.version}`);
  for (const [name, root, tool] of rows) {
    const found = existsSync(root) ? discover(tool) : [];
    console.log(`${name}: ${existsSync(root) ? root : `${root} (not found)`}`);
    console.log(`  sessions Hotswap can read: ${found.length}${found[0] ? `, newest ${when(found[0].mtimeMs)}` : ''}`);
  }
  console.log('\nHotswap opens only session text files, read-only. It never opens Antigravity\'s conversations/*.pb or state.vscdb (sign-in data).');
}

async function main(): Promise<void> {
  const args = parse(process.argv.slice(2));
  switch (args.cmd) {
    case 'list': return cmdList(args);
    case 'capture': return cmdCapture(args);
    case 'to': return cmdTo(args);
    case 'watch': return cmdWatch(args);
    case 'check': return cmdCheck(args);
    case 'doctor': return cmdDoctor();
    default: console.log(HELP);
  }
}

main().catch((e: Error) => die(`hotswap failed: ${e.message}`));
