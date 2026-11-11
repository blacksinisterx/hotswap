// Runs the REAL hotswap CLI on an INVENTED session and saves what the terminal showed, for the demo video.
// No real conversation is used. Only the temporary folder name is shortened in the output (to ~/shop-api).
//   node launch/demo/make-transcript.mjs        (needs `npm run build` first)
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = join(ROOT, 'dist', 'cli.js');
const base = mkdtempSync(join(tmpdir(), 'hotswap-demo-'));
const claude = join(base, 'claude');
const agy = join(base, 'agy');
const proj = join(base, 'shop-api');
const proj2 = join(base, 'landing');
for (const d of [claude, agy, proj, proj2]) mkdirSync(d, { recursive: true });
const env = { ...process.env, HOTSWAP_CLAUDE_DIR: claude, HOTSWAP_ANTIGRAVITY_DIR: agy };
const short = (s) => s.split(proj).join('~/shop-api').split(proj2).join('~/landing').split(base).join('~');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- an invented Claude Code session in the real file shape
const SID = 'demo-session';
const ts = (m, s = 0) => `2026-11-12T19:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.000Z`;
const b = (i, m) => ({ sessionId: SID, cwd: proj, gitBranch: 'feature/jwt-auth', timestamp: ts(m, i), uuid: `u${m}-${i}`, isSidechain: false });
const user = (m, text) => ({ ...b(0, m), type: 'user', message: { role: 'user', content: text } });
const result = (m, id, text, err = false) => ({ ...b(1, m), type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: text, ...(err ? { is_error: true } : {}) }] } });
const asst = (m, id, content) => ({ ...b(2, m), type: 'assistant', message: { id, role: 'assistant', content } });
const rows = [
  { type: 'custom-title', customTitle: 'Add JWT auth to orders API', sessionId: SID },
  user(1, 'Add JWT auth to the orders endpoint in shop-api. Secrets live in .env, for example JWT_SECRET=Tr0ub4dor-demo-value-123'),
  asst(2, 'm1', [{ type: 'text', text: "I'll add a middleware that verifies the token, then protect the orders routes.\n\n```ts\nexport function requireAuth(req, res, next) {\n  const token = req.headers.authorization?.split(' ')[1];\n  if (!token) return res.status(401).end();\n  req.user = verify(token, process.env.JWT_SECRET);\n  next();\n}\n```" }, { type: 'tool_use', id: 't1', name: 'Write', input: { file_path: join(proj, 'src', 'auth.ts'), content: '...' } }]),
  result(3, 't1', 'File created'),
  asst(4, 'm2', [{ type: 'tool_use', id: 't2', name: 'Edit', input: { file_path: join(proj, 'src', 'routes', 'orders.ts'), old_string: 'router.get', new_string: 'router.use(requireAuth); router.get' } }]),
  result(5, 't2', 'File updated'),
  asst(6, 'm3', [{ type: 'tool_use', id: 't3', name: 'Bash', input: { command: 'npm test -- orders', description: 'Run the orders tests' } }]),
  result(7, 't3', 'FAIL orders.test.ts: expected 401 without a token, got 200', true),
  asst(8, 'm4', [{ type: 'text', text: 'The orders test fails: the route is still open when the token is missing. I will fix the order of the middleware next.' }, { type: 'tool_use', id: 't4', name: 'TodoWrite', input: { todos: [{ content: 'Fix middleware order so missing tokens get 401', status: 'in_progress' }, { content: 'Add tests for expired tokens', status: 'pending' }, { content: 'Write the auth section of the README', status: 'pending' }, { content: 'Create requireAuth middleware', status: 'completed' }] } }]),
  user(9, 'Good. Also make sure expired tokens return 401, not 500.'),
];
const dir = join(claude, 'shop-api');
mkdirSync(dir, { recursive: true });
const file = join(dir, `${SID}.jsonl`);
writeFileSync(file, `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`);

// ---- an invented Antigravity session
const agyLogs = join(agy, 'brain', 'agy-demo', '.system_generated', 'logs');
mkdirSync(agyLogs, { recursive: true });
const agyRows = [
  { step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', status: 'DONE', created_at: '2026-11-12T17:00:00Z', content: 'Build a landing page for the bakery with a menu section and an order form' },
  { step_index: 1, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', created_at: '2026-11-12T17:00:20Z', content: 'I will create index.html, a menu grid and a simple order form.', tool_calls: [{ name: 'write_to_file', args: { TargetFile: join(proj2, 'index.html'), CodeContent: '<html></html>' } }, { name: 'run_command', args: { CommandLine: 'npx serve .', Cwd: proj2 } }] },
  { step_index: 2, source: 'USER_EXPLICIT', type: 'USER_INPUT', status: 'DONE', created_at: '2026-11-12T17:10:00Z', content: `Make the order form validate the phone number and keep going. ${'Details: '.repeat(110)}... (truncated)` },
];
writeFileSync(join(agyLogs, 'overview.txt'), `${agyRows.map((r) => JSON.stringify(r)).join('\n')}\n`);
writeFileSync(join(agy, 'brain', 'agy-demo', 'task.md'), '# Task\n- [x] Create index.html\n- [/] Order form validation\n- [ ] Deploy preview\n');

const steps = [];
const say = (text) => steps.push({ t: 'caption', text });
const cmd = (text) => steps.push({ t: 'cmd', text });
const out = (text) => steps.push({ t: 'out', text: short(text).replace(/\r/g, '').trimEnd() });
const run = (args) => spawnSync(process.execPath, [CLI, ...args], { env, encoding: 'utf8', cwd: proj });

// scene 1: the limit arrives while watching
say('1  You are mid-task in Claude Code. Hotswap is watching.');
cmd('hotswap watch --dir .');
const child = spawn(process.execPath, [CLI, 'watch', '--dir', proj], { env, cwd: proj });
let buf = '';
child.stdout.on('data', (d) => { buf += d; });
await wait(1500);
const first = buf;
appendFileSync(file, `${JSON.stringify({ ...b(0, 30), type: 'assistant', isApiErrorMessage: true, error: 'rate_limit', apiErrorStatus: 429, message: { model: '<synthetic>', role: 'assistant', content: [{ type: 'text', text: "You've hit your session limit · resets 11:40pm (Asia/Karachi)" }] } })}\n`);
await wait(4500);
child.kill();
const sofar = buf.slice(first.length);
out(`${first}${sofar}`.replace(/^Watching Claude Code sessions in .*?\n/, 'Watching Claude Code sessions (Ctrl+C to stop). Only new activity counts.\n'));

// scene 2: what is inside the capsule
say('2  The capsule is a plain Markdown file any AI can read.');
cmd('head -34 HANDOFF.md');
const md = readFileSync(join(proj, 'HANDOFF.md'), 'utf8').split('\n').slice(0, 34).join('\n');
out(md);

// scene 3: checkable
say('3  It is checkable: change one word and Hotswap notices.');
cmd('hotswap check HANDOFF.md');
out(run(['check', 'HANDOFF.md']).stdout);
cmd("sed -i 's/orders endpoint/payments endpoint/' HANDOFF.md");
const p = join(proj, 'HANDOFF.md');
writeFileSync(p, readFileSync(p, 'utf8').replace('orders endpoint', 'payments endpoint'));
cmd('hotswap check HANDOFF.md');
out(run(['check', 'HANDOFF.md']).stdout);

// scene 4: another tool, honestly partial
say('4  Antigravity too. It cuts long messages itself, so Hotswap says "partial".');
cmd('hotswap to claude --from antigravity');
out(run(['to', 'claude', '--from', 'antigravity', '--dir', proj2]).stdout);

steps.push({ t: 'end', text: 'No AI model. No server. No account. Everything stays on your computer.' });
writeFileSync(join(ROOT, 'launch', 'demo', 'transcript.json'), JSON.stringify({ title: 'hotswap v0.1', note: 'Real output of the real CLI on an invented session. Only the temporary folder name is shortened.', steps }, null, 1));
console.log(`transcript: ${steps.length} steps`);
console.log(steps.filter((s) => s.t === 'out').map((s) => s.text.split('\n').length).join(' / '), 'lines per output');
