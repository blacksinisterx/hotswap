// Makes releases/hotswap-extension-<version>.zip from extension/dist (the same files "Load unpacked" uses).
//   npm run package:extension
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(ROOT, 'extension', 'dist');
if (!existsSync(join(dist, 'manifest.json'))) throw new Error('Run `npm run build:extension` first.');
const { version } = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
mkdirSync(join(ROOT, 'releases'), { recursive: true });
const out = join(ROOT, 'releases', `hotswap-extension-${version}.zip`);
rmSync(out, { force: true });
if (process.platform === 'win32') execFileSync('powershell', ['-NoProfile', '-Command', `Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory('${dist}', '${out}', [IO.Compression.CompressionLevel]::Optimal, $false)`], { stdio: 'inherit' });
else execFileSync('zip', ['-r', '-q', out, '.'], { cwd: dist, stdio: 'inherit' });
console.log('wrote', out);
