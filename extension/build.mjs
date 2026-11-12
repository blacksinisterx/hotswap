// Builds the Chrome extension.
//   node extension/build.mjs        -> extension/dist      (the real one: only the supported chat sites)
//                                      extension/dist-dev  (same, plus localhost, for the tests and the demo)
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(ROOT, '..', 'package.json'), 'utf8'));
const HOSTS = ['https://chatgpt.com/*', 'https://chat.openai.com/*', 'https://claude.ai/*', 'https://gemini.google.com/*'];

for (const dev of [false, true]) {
  const out = join(ROOT, dev ? 'dist-dev' : 'dist');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const common = { bundle: true, format: 'iife', target: 'chrome110', define: { __DEV__: String(dev) }, legalComments: 'none', logLevel: 'warning' };
  await build({ ...common, entryPoints: [join(ROOT, 'src/content/index.ts')], outfile: join(out, 'content.js') });
  await build({ ...common, entryPoints: [join(ROOT, 'src/background.ts')], outfile: join(out, 'background.js') });
  await build({ ...common, entryPoints: [join(ROOT, 'src/popup/popup.ts')], outfile: join(out, 'popup.js') });
  cpSync(join(ROOT, 'src/popup/popup.html'), join(out, 'popup.html'));
  cpSync(join(ROOT, 'src/popup/popup.css'), join(out, 'popup.css'));
  cpSync(join(ROOT, 'static/icons'), join(out, 'icons'), { recursive: true });
  const matches = dev ? [...HOSTS, 'http://127.0.0.1/*', 'http://localhost/*'] : HOSTS;
  const manifest = {
    manifest_version: 3,
    name: dev ? 'Hotswap (dev)' : 'Hotswap',
    version: pkg.version.replace(/^0\.1\./, '0.2.'),
    description: 'Switch AI mid-task without losing the thread. Capture a chat as a capsule and continue it in another AI. No AI model, no server, no account.',
    permissions: ['storage', 'contextMenus', 'clipboardWrite'],
    host_permissions: matches,
    background: { service_worker: 'background.js' },
    action: { default_title: 'Hotswap', default_popup: 'popup.html', default_icon: { 16: 'icons/icon16.png', 32: 'icons/icon32.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' } },
    content_scripts: [{ matches, js: ['content.js'], run_at: 'document_idle' }],
    icons: { 16: 'icons/icon16.png', 32: 'icons/icon32.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' },
  };
  writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`built ${dev ? 'dist-dev' : 'dist'}`);
}
