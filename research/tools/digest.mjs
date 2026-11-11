// Turns REA's raw output for each research target into a compact digest (JSON + console), and adds a plain-text search of the
// same files for things REA does not keep (string literals inside call arguments). Never runs the code under study.
//   node --max-old-space-size=6144 tools/digest.mjs [name ...]
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGETS = JSON.parse(readFileSync(join(HERE, 'tools', 'targets.json'), 'utf8'));
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(TARGETS);

// property names that show HOW text gets into a chat box, how a page is read, and where data goes
const INTEREST = {
  inject: ['execCommand', 'insertText', 'insertHTML', 'DataTransfer', 'dataTransfer', 'clipboardData', 'ClipboardEvent', 'InputEvent', 'dispatchEvent', 'setData', 'items', 'files', 'isContentEditable', 'contentEditable', 'textContent', 'innerText', 'innerHTML', 'selectionStart', 'getSelection', 'createRange', 'selectNodeContents', 'focus'],
  read: ['MutationObserver', 'observe', 'querySelector', 'querySelectorAll', 'scrollTop', 'scrollTo', 'scrollIntoView', 'getAttribute', 'dataset'],
  chrome: ['contextMenus', 'create', 'onClicked', 'connectNative', 'sendNativeMessage', 'sendMessage', 'onMessage', 'executeScript', 'getAuthToken', 'launchWebAuthFlow', 'downloads', 'notifications', 'sidePanel', 'commands'],
  storage: ['localStorage', 'sessionStorage', 'indexedDB', 'storage', 'local', 'sync'],
  network: ['fetch', 'XMLHttpRequest', 'WebSocket', 'sendBeacon', 'EventSource'],
};
const pos = (x) => x?.evidence?.location?.value?.start ?? null;
const rel = (p) => p.replace(/\\/g, '/');

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    if (f === '.git' || f === 'node_modules') continue;
    const p = join(dir, f);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out); else if (/\.(c?js|mjs)$/.test(f)) out.push(p);
  }
  return out;
}

const digest = {};
for (const n of names) {
  const rawPath = join(HERE, 'rea-raw', `${n}.json`);
  if (!existsSync(rawPath)) { console.log(`${n}: no REA output`); continue; }
  const rea = JSON.parse(readFileSync(rawPath, 'utf8'));
  const sem = rea.normalized_result.semantic_graph;
  const graph = rea.normalized_result.graph;
  const d = { modules: graph.nodes.filter((x) => x.kind === 'javascript-module').length, semNodes: sem.nodes.length, unknowns: (sem.unknowns ?? []).length, limitations: (rea.normalized_result.limitations ?? []).length };
  const hits = {};
  for (const x of sem.nodes) {
    const m = x.kind === 'expression' ? /^(read|write):\/(.+)$/.exec(x.label ?? '') : null;
    if (!m) continue;
    const path = m[2].split('/');
    const leaf = path[path.length - 1];
    for (const [group, list] of Object.entries(INTEREST)) {
      if (list.includes(leaf) || (group === 'chrome' && path.includes('chrome'))) {
        const p = pos(x);
        const key = `${group}:${m[2]}`;
        (hits[key] ??= { count: 0, at: [] }).count += 1;
        if (p && hits[key].at.length < 2) hits[key].at.push(`${rel(x.identity?.module_path ?? '')}:${p.line}:${p.column}`);
      }
    }
  }
  // bare calls such as fetch(url) are expressions labelled exactly like the function
  for (const x of sem.nodes) {
    if (x.kind === 'expression' && ['fetch', 'XMLHttpRequest', 'WebSocket', 'MutationObserver', 'DataTransfer', 'ClipboardEvent', 'InputEvent', 'KeyboardEvent', 'DragEvent', 'Event', 'CustomEvent', 'File', 'Blob', 'FileReader', 'URL'].includes(x.label)) {
      const p = pos(x);
      const key = `bare:${x.label}`;
      (hits[key] ??= { count: 0, at: [] }).count += 1;
      if (p && hits[key].at.length < 2) hits[key].at.push(`${rel(x.identity?.module_path ?? '')}:${p.line}:${p.column}`);
    }
  }
  d.hits = Object.fromEntries(Object.entries(hits).sort((a, b) => b[1].count - a[1].count));
  d.endpoints = [...new Set(graph.nodes.filter((x) => x.kind === 'endpoint').flatMap((x) => (x.observations ?? []).map((o) => o.properties?.value)).filter(Boolean))].slice(0, 40);
  d.relations = {};
  for (const r of sem.relations) d.relations[r.relation] = (d.relations[r.relation] ?? 0) + 1;

  // plain-text search of the same files: URLs and limit wording, which REA does not keep
  const root = join(HERE, TARGETS[n]);
  const files = walk(root);
  const urls = new Set();
  const limit = [];
  const injectText = [];
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    for (const u of text.match(/https?:\/\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]{6,120}/g) ?? []) urls.add(u.replace(/[)'",;]+$/, ''));
    for (const m of text.matchAll(/.{0,60}(you['’]ve hit|usage limit|rate limit|message limit|reached (your|the) limit|limit reached|too many requests|quota)[^\n]{0,80}/gi)) if (limit.length < 8) limit.push(`${rel(relative(root, f))}: ${m[0].trim().slice(0, 160)}`);
    for (const m of text.matchAll(/execCommand\(['"]insertText['"]|new DataTransfer\(|new ClipboardEvent\(['"]paste['"]|dispatchEvent\(new (DragEvent|ClipboardEvent|InputEvent)|['"]drop['"]|['"]dragover['"]|beforeinput/g)) if (injectText.length < 12) injectText.push(`${rel(relative(root, f))}: ${m[0]}`);
  }
  d.urlsInSource = [...urls].filter((u) => !/w3\.org|schema\.org|github\.com\/(facebook|developit)|reactjs|mozilla\.org|developer\.mozilla|stackoverflow|npmjs/.test(u)).slice(0, 60);
  d.limitWording = limit;
  d.injectionMarkers = injectText;
  d.files = files.length;
  digest[n] = d;
  console.log(`\n##### ${n}: ${d.modules} modules, ${d.semNodes} semantic nodes, ${d.unknowns} unknowns`);
  console.log('endpoints (REA):', d.endpoints.join(' | ') || 'none');
  console.log('injection / read / chrome hits:');
  for (const [k, v] of Object.entries(d.hits).filter(([k]) => /^(inject|chrome|bare)/.test(k)).slice(0, 26)) console.log(`   ${String(v.count).padStart(4)}  ${k}   ${v.at[0] ?? ''}`);
  console.log('hosts/urls in source:', [...new Set(d.urlsInSource.map((u) => u.replace(/^(https?:\/\/[^/]+).*/, '$1')))].slice(0, 25).join(' '));
  console.log('limit wording:', d.limitWording.length ? '' : 'none found');
  for (const l of d.limitWording) console.log('   ', l);
  console.log('injection markers (plain text):', [...new Set(d.injectionMarkers.map((s) => s.split(': ')[1]))].join(', ') || 'none');
}
writeFileSync(join(HERE, 'digest.json'), JSON.stringify(digest, null, 1));
