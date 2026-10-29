// Checks one repo's records, as the site's build does
// (docs/plan/records-site). The repos run it in their CI, through the
// actions/check-records action, so a bad record fails its PR.
//
//   node scripts/check-records.mjs [--dir <repo>] [--repo <name>] [--strict]
//
// The folders are the repo's in sources.yaml, or adr and plan when it is not
// listed. Links to another repo's records are not checked here: the site's
// build checks them.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkRoutes, loadPages, openSource } from './lib/repo.mjs';
import { indexPages, rewriteBody } from './lib/links.mjs';
import { readSources } from './lib/sources.mjs';
import { report } from './lib/report.mjs';

const REPO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function main() {
  const argv = process.argv.slice(2);
  let dir = process.cwd();
  let name = null;
  let strict = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--strict') strict = true;
    else if (a === '--dir' && i + 1 < argv.length) dir = path.resolve(argv[++i]);
    else if (a === '--repo' && i + 1 < argv.length) name = argv[++i];
    else throw new Error(`unknown argument ${a}`);
  }
  name ??= process.env.GITHUB_REPOSITORY?.split('/')[1] ?? path.basename(dir);

  const listed = readSources(path.join(REPO_DIR, 'sources.yaml')).find((r) => r.name === name);
  const folders = listed?.folders ?? ['adr', 'plan'];
  const source = openSource(name, dir);
  const { pages, diagnostics } = loadPages(source, folders, { strict });
  checkRoutes(pages, diagnostics);
  const index = indexPages(pages);
  const ctx = { sources: new Map([[name, source]]), folders: new Map([[name, folders]]), index, diagnostics, copies: [] };
  for (const p of pages) rewriteBody(p, ctx);

  const { errors, warnings } = report(diagnostics, { annotate: process.env.GITHUB_ACTIONS === 'true' });
  const records = pages.filter((p) => p.kind !== 'intro' && p.kind !== 'attachment').length;
  console.log(`check-records: ${name}: ${records} records in ${folders.map((f) => `docs/${f}/`).join(', ')}; ${errors} error(s), ${warnings} warning(s)`);
  if (errors) process.exit(1);
}

try {
  main();
} catch (e) {
  console.error(`check-records: ${e.message}`);
  process.exit(1);
}
