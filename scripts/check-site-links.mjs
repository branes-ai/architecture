// Checks the built site: every internal link (href under the base path) of
// every page reaches a page of the site (docs/plan/records-site).
//
//   node scripts/check-site-links.mjs [--dist site/dist] [--base /architecture/]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1];
};
const dist = path.resolve(arg('--dist', path.join(REPO_DIR, 'site', 'dist')));
const base = arg('--base', '/architecture/');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
  );
}

let links = 0;
const broken = [];
for (const file of walk(dist).filter((f) => f.endsWith('.html'))) {
  const text = fs.readFileSync(file, 'utf8');
  for (const [, href] of text.matchAll(/href="([^"#?]*)/g)) {
    if (!href.startsWith(base)) continue;
    links++;
    let rel = decodeURIComponent(href.slice(base.length));
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    if (!fs.existsSync(path.join(dist, rel))) broken.push(`${path.relative(dist, file)}: ${href}`);
  }
}
for (const b of broken) console.error(`check-site-links: broken: ${b}`);
console.log(`check-site-links: ${links} internal links, ${broken.length} broken`);
if (broken.length) process.exit(1);
