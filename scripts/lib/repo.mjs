// One source repo: its files, its commit, and its records, checked
// (docs/plan/records-site).
//
// A source is a working tree, a clone or a local checkout. Only docs/ needs to
// be on disk; the list of the repo's files (for link targets) comes from git.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { adrMeta, parseDoc, planMeta, proseStatusLine, routeOf } from './parse.mjs';

const toPosix = (p) => p.split(path.sep).join('/');

function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '.git' && entry.name !== 'node_modules') out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

/**
 * The source repo `name` at `root`. Model:
 *   name    : the repo's name in branes-ai
 *   root    : its working tree
 *   sha     : the commit checked out (null when root is not a git repo)
 *   files   : every file of the repo, repo-relative (tracked, and untracked
 *             but not ignored, so a local preview sees new files)
 *   dateOf  : a file's last commit date, YYYY-MM-DD, or null
 * A repo with no commits yet has no files.
 */
export function openSource(name, root) {
  let sha = null;
  let files;
  let isGit = false;
  try {
    git(root, ['rev-parse', '--git-dir']);
    isGit = true;
  } catch {
    isGit = false;
  }
  if (isGit) {
    try {
      sha = git(root, ['rev-parse', 'HEAD']).trim();
    } catch {
      sha = null; // no commits yet
    }
    const listed = git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']);
    files = new Set(listed.split('\0').filter(Boolean));
  } else {
    files = new Set(walk(root).map((f) => toPosix(path.relative(root, f))));
  }
  const dirs = new Set();
  for (const f of files) {
    const parts = f.split('/');
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
  }
  const dates = new Map();
  const dateOf = (rel) => {
    if (!isGit || sha === null) return null;
    if (!dates.has(rel)) {
      const d = git(root, ['log', '-1', '--format=%cs', '--', rel]).trim();
      dates.set(rel, d === '' ? null : d);
    }
    return dates.get(rel);
  };
  return { name, root, sha, files, dirs, dateOf, github: `https://github.com/branes-ai/${name}` };
}

/** The kind of a folder's records: `plans/` holds plans and `adrs/` ADRs, as
 *  `plan/` and `adr/` do; any other folder's records are of its own kind. */
const RECORD_KIND = { adr: 'adr', adrs: 'adr', plan: 'plan', plans: 'plan' };
export const kindOf = (folder) => RECORD_KIND[folder] ?? folder;

/**
 * What a file under docs/<folder>/ is:
 *   'intro'      docs/<folder>/README.md, the folder's own introduction
 *   'record'     docs/<folder>/<name>.md, or docs/<folder>/<name>/README.md
 *   'attachment' any other .md under the folder (published, no status)
 *   'skip'       a template.md
 */
export function classify(relInFolder) {
  const parts = relInFolder.split('/');
  if (parts.at(-1) === 'template.md') return 'skip';
  if (relInFolder === 'README.md') return 'intro';
  if (parts.length === 1) return 'record';
  if (parts.length === 2 && parts[1] === 'README.md') return 'record';
  return 'attachment';
}

/**
 * The pages of one source: each .md file under docs/<folder>/ for each
 * folder, parsed and checked. Returns { pages, diagnostics }.
 *
 * A page: { repo, folder, kind, docsRel, repoRel, route, doc, title, meta,
 * date }. kind is the folder's record kind (kindOf) for records, else
 * 'intro' or 'attachment'. meta is the plan's or ADR's status (null for other pages).
 *
 * A diagnostic: { level: 'error' | 'warning', file, line, msg }, file being
 * repo-relative. A plan without a status is a warning, or an error when
 * `strict`; every other failed check is an error.
 */
export function loadPages(source, folders, { strict = false } = {}) {
  const pages = [];
  const diagnostics = [];
  const report = (level, repoRel, line, msg) => diagnostics.push({ level, repo: source.name, file: repoRel, line, msg });
  for (const folder of folders) {
    const rels = [...source.files]
      .filter((f) => f.startsWith(`docs/${folder}/`) && f.endsWith('.md'))
      .sort();
    for (const repoRel of rels) {
      const relInFolder = repoRel.slice(`docs/${folder}/`.length);
      const cls = classify(relInFolder);
      if (cls === 'skip') continue;
      const abs = path.join(source.root, repoRel);
      if (!fs.existsSync(abs)) {
        report('error', repoRel, 1, 'listed by git but not on disk (is docs/ checked out?)');
        continue;
      }
      const text = fs.readFileSync(abs, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
      const doc = parseDoc(text);
      const docsRel = repoRel.slice('docs/'.length);
      const kind = cls === 'record' ? kindOf(folder) : cls;
      const page = { repo: source.name, folder, kind, docsRel, repoRel, route: routeOf(source.name, docsRel), doc, title: doc.title, meta: null, date: null };
      if (doc.title === null) report('error', repoRel, doc.offset + 1, 'no "# " title heading');
      if (kind === 'plan') {
        const m = planMeta(doc);
        for (const e of m.errors) report('error', repoRel, e.line, e.msg);
        if (m.missing) {
          report(strict ? 'error' : 'warning', repoRel, 1, 'plan has no front matter status (draft, ready, in-progress or complete)');
        }
        const prose = proseStatusLine(doc);
        if (prose !== null) {
          report(strict ? 'error' : 'warning', repoRel, prose, 'prose "Status:" line; the front matter holds the status');
        }
        page.meta = { status: m.missing ? 'unknown' : m.status, issue: m.issue };
        page.date = source.dateOf(repoRel);
      } else if (kind === 'adr') {
        const m = adrMeta(doc);
        for (const e of m.errors) report('error', repoRel, e.line, e.msg);
        page.meta = { status: m.status, state: m.state, note: m.note };
        page.date = m.date;
      }
      pages.push(page);
    }
  }
  return { pages, diagnostics };
}

/** Two pages with one route (for example plan/x.md and plan/x/README.md) are
 *  an error on the second. */
export function checkRoutes(pages, diagnostics) {
  const routes = new Map();
  for (const p of pages) {
    const other = routes.get(p.route);
    if (other) diagnostics.push({ level: 'error', repo: p.repo, file: p.repoRel, line: 1, msg: `same route ${p.route} as ${other.repo}/${other.repoRel}` });
    else routes.set(p.route, p);
  }
}
