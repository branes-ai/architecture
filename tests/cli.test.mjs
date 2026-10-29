// The two commands end to end, on fixture repos: collect.mjs writes the site's
// content, and check-records.mjs checks one repo.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { adr, makeRepo, plan, tempDir } from './helpers.mjs';

const SCRIPTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts');
const node = (script, args, env = {}) =>
  spawnSync(process.execPath, [path.join(SCRIPTS, script), ...args], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_ACTIONS: '', GITHUB_REPOSITORY: '', ...env },
  });

function fixture() {
  const root = tempDir();
  makeRepo(root, 'one', {
    'docs/adr/0001-x.md': adr('ADR 0001 — X'),
    'docs/plan/p/README.md': plan('Plan P', 'See [the ADR](../../adr/0001-x.md).'),
    'docs/plan/q.md': plan('Plan Q', '', 'complete'),
  });
  makeRepo(root, 'two', { 'docs/plan/r.md': plan('Plan R', '', 'draft'), 'README.md': '# two\n' });
  makeRepo(root, 'three', { 'README.md': '# no records yet\n' });
  const sources = path.join(root, 'sources.yaml');
  fs.writeFileSync(sources, 'repos:\n  - { name: one, folders: [adr, plan] }\n  - { name: two, folders: [adr, plan] }\n  - { name: three, folders: [adr, plan] }\n');
  return { root, sources, site: path.join(root, 'site-src') };
}

test('collect: writes the pages, indexes, sidebar and manifest', () => {
  const { root, sources, site } = fixture();
  const r = node('collect.mjs', ['--local-root', root, '--sources', sources, '--site', site]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /collect: 4 pages \(4 records\) from 3 repos, 0 images, 0 warning\(s\)/);
  const content = path.join(site, 'content', 'docs');
  const files = fs.readdirSync(content, { recursive: true }).filter((f) => f.endsWith('.md')).sort();
  assert.deepEqual(files, [
    'decisions.md',
    'index.md',
    'one/adr/0001-x.md',
    'one/index.md',
    'one/plan/p/index.md',
    'one/plan/q.md',
    'plans.md',
    'two/index.md',
    'two/plan/r.md',
  ]);
  const p = fs.readFileSync(path.join(content, 'one/plan/p/index.md'), 'utf8');
  assert.match(p, /^---\ntitle: "Plan P"\neditUrl: "https:\/\/github.com\/branes-ai\/one\/edit\/main\/docs\/plan\/p\/README.md"\n---\n/);
  assert.match(p, /<span class="rec-status rec-status--in-progress">In progress<\/span> · updated 2026-10-01/);
  assert.match(p, /\[the ADR\]\(\/one\/adr\/0001-x\/\)/);
  const plans = fs.readFileSync(path.join(content, 'plans.md'), 'utf8');
  assert.deepEqual([...plans.matchAll(/^## (.+)$/gm)].map((m) => m[1]), ['In progress (1)', 'Draft (1)', 'Complete (1)']);
  const manifest = JSON.parse(fs.readFileSync(path.join(site, 'generated', 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.repos.map((x) => [x.name, x.pages.length]), [['one', 3], ['two', 1], ['three', 0]]);
  const sidebar = JSON.parse(fs.readFileSync(path.join(site, 'generated', 'sidebar.json'), 'utf8'));
  assert.deepEqual(sidebar.map((s) => s.label), ['Overview', 'Plans', 'Decisions', 'one', 'two']);
  assert.deepEqual(sidebar[3].items[2].items.map((i) => [i.label, i.badge.text]), [['Plan P', 'In progress'], ['Plan Q', 'Complete']]);
});

test('collect: an error fails the run, names the file and line, and writes nothing', () => {
  const { root, sources, site } = fixture();
  fs.appendFileSync(path.join(root, 'two', 'docs/plan/r.md'), '\n[gone](gone.md)\n');
  const r = node('collect.mjs', ['--local-root', root, '--sources', sources, '--site', site]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /two\/docs\/plan\/r\.md:8: error: link target gone\.md does not exist/);
  assert.match(r.stderr, /1 error\(s\), 0 warning\(s\); nothing written/);
  assert.equal(fs.existsSync(site), false);
});

test('check-records: passes a good repo, fails a bad one with annotations', () => {
  const { root } = fixture();
  const good = node('check-records.mjs', ['--dir', path.join(root, 'one'), '--repo', 'one']);
  assert.equal(good.status, 0, good.stderr);
  assert.match(good.stdout, /check-records: one: 3 records in docs\/adr\/, docs\/plan\/; 0 error\(s\), 0 warning\(s\)/);

  const bad = makeRepo(root, 'bad', { 'docs/plan/p.md': '# P\n', 'docs/adr/0001-x.md': '# X\n' });
  const lenient = node('check-records.mjs', ['--dir', bad], { GITHUB_ACTIONS: 'true' });
  assert.equal(lenient.status, 1);
  assert.match(lenient.stdout, /::error file=docs\/adr\/0001-x\.md,line=1::ADR has no "\*\*Status:\*\* \.\.\." line under its title/);
  assert.match(lenient.stdout, /::warning file=docs\/plan\/p\.md,line=1::plan has no front matter status/);
  assert.match(lenient.stdout, /check-records: bad: 2 records in docs\/adr\/, docs\/plan\/; 1 error\(s\), 1 warning\(s\)/);
  const strict = node('check-records.mjs', ['--dir', bad, '--strict'], { GITHUB_ACTIONS: 'true' });
  assert.match(strict.stdout, /::error file=docs\/plan\/p\.md,line=1::plan has no front matter status/);
});

test('sources.yaml: a repo listed twice, or with no folders, is an error', () => {
  const { root, site } = fixture();
  const sources = path.join(root, 'bad-sources.yaml');
  fs.writeFileSync(sources, 'repos:\n  - { name: one, folders: [adr] }\n  - { name: one, folders: [] }\n');
  const r = node('collect.mjs', ['--local-root', root, '--sources', sources, '--site', site]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /repos\[1\]: repo "one" is listed twice/);
  assert.match(r.stderr, /repos\[1\]: "folders" is not a non-empty list/);
});
