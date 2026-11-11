// Checks that every tweet in POSTS.md fits 280 characters (X counts any link as 23) and the LinkedIn post fits 3,000.
//   node launch/check-posts.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const text = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'POSTS.md'), 'utf8').replace(/\r/g, '');
const weight = (s) => [...s.replace(/\{REPO\}|https?:\/\/\S+/g, 'x'.repeat(23))].length;

// tweets: the ``` blocks after the "X thread" heading
const x = text.split('## X thread')[1].split('## Before you post')[0];
const blocks = [...x.matchAll(/```\n([\s\S]*?)\n```/g)].map((m) => m[1].trim());
let bad = 0;
blocks.forEach((b, i) => {
  const n = weight(b);
  if (n > 280) bad += 1;
  console.log(`${i < 7 ? `post ${i + 1}/7` : 'single post'}: ${n} characters ${n > 280 ? 'TOO LONG' : 'ok'}`);
});

const li = text.split('## LinkedIn post')[1].split('*(about')[0].split('\n').filter((l) => l.startsWith('>')).map((l) => l.replace(/^>\s?/, '')).join('\n').trim();
const n = weight(li);
console.log(`LinkedIn post: ${n} characters ${n > 3000 ? 'TOO LONG' : 'ok (limit 3,000)'}`);
if (bad || n > 3000) process.exit(1);
