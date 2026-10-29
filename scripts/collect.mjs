// Builds the site's content from every repo in sources.yaml
// (docs/plan/records-site).
//
//   node scripts/collect.mjs [--strict] [--local-root <dir>] [--cache <dir>]
//
// Each repo is cloned (blobless, docs/ checked out) into the cache, default
// .cache/sources/; with --local-root, a repo found at <dir>/<name> is read
// from there instead, as checked out, for a local preview. This repo's own
// records are always read from its working tree. Every record is checked
// (repo.mjs, links.mjs); any error fails the run, naming the file and line,
// and nothing is written. --strict makes a plan without a status an error.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkRoutes, loadPages, openSource } from './lib/repo.mjs';
import { indexPages, rewriteBody } from './lib/links.mjs';
import { writeSite } from './lib/render.mjs';
import { readSources } from './lib/sources.mjs';
import { report } from './lib/report.mjs';

const REPO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = 'architecture';

function parseArgs(argv) {
  const opts = { strict: false, localRoot: null, cache: path.join(REPO_DIR, '.cache', 'sources'), site: path.join(REPO_DIR, 'site', 'src'), sources: path.join(REPO_DIR, 'sources.yaml') };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return path.resolve(argv[++i]);
    };
    if (a === '--strict') opts.strict = true;
    else if (a === '--local-root') opts.localRoot = value();
    else if (a === '--cache') opts.cache = value();
    else if (a === '--site') opts.site = value();
    else if (a === '--sources') opts.sources = value();
    else throw new Error(`unknown argument ${a}`);
  }
  return opts;
}

function run(args) {
  execFileSync('git', args, { stdio: ['ignore', 'ignore', 'pipe'] });
}

/** A blobless clone of branes-ai/<name>, with only docs/ checked out. */
function clone(name, cache) {
  const dir = path.join(cache, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(cache, { recursive: true });
  run(['clone', '--quiet', '--filter=blob:none', '--no-checkout', `https://github.com/branes-ai/${name}.git`, dir]);
  let branch;
  try {
    branch = execFileSync('git', ['-C', dir, 'symbolic-ref', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
    execFileSync('git', ['-C', dir, 'rev-parse', '--verify', '--quiet', 'HEAD'], { stdio: 'ignore' });
  } catch {
    return dir; // an empty repo: nothing to check out
  }
  run(['-C', dir, 'sparse-checkout', 'set', '--cone', 'docs']);
  run(['-C', dir, 'checkout', '--quiet', branch]);
  return dir;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const repos = readSources(opts.sources);
  const sources = new Map();
  const folders = new Map();
  for (const { name, folders: f } of repos) {
    let root;
    let from;
    if (name === SELF) {
      root = REPO_DIR;
      from = 'this working tree';
    } else if (opts.localRoot && fs.existsSync(path.join(opts.localRoot, name, '.git'))) {
      root = path.join(opts.localRoot, name);
      from = root;
    } else {
      root = clone(name, opts.cache);
      from = `github.com/branes-ai/${name}`;
    }
    const source = openSource(name, root);
    sources.set(name, source);
    folders.set(name, f);
    console.log(`collect: ${name} @ ${source.sha ? source.sha.slice(0, 7) : '(no commits)'} from ${from}`);
  }

  const diagnostics = [];
  const pages = [];
  for (const [name, source] of sources) {
    const loaded = loadPages(source, folders.get(name), { strict: opts.strict });
    pages.push(...loaded.pages);
    diagnostics.push(...loaded.diagnostics);
  }
  checkRoutes(pages, diagnostics);

  const index = indexPages(pages);
  const bodies = new Map();
  const copies = [];
  for (const p of pages) bodies.set(p, rewriteBody(p, { sources, folders, index, diagnostics, copies }));

  const { errors, warnings } = report(diagnostics);
  if (errors) {
    console.error(`collect: ${errors} error(s), ${warnings} warning(s); nothing written`);
    process.exit(1);
  }
  writeSite(opts.site, { pages, bodies, copies, sources, folders });
  const records = pages.filter((p) => p.kind !== 'intro' && p.kind !== 'attachment').length;
  console.log(`collect: ${pages.length} pages (${records} records) from ${sources.size} repos, ${copies.length} images, ${warnings} warning(s)`);
}

try {
  main();
} catch (e) {
  console.error(`collect: ${e.message}`);
  process.exit(1);
}
