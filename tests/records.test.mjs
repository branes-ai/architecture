// Loading, checking and rewriting the records of fixture repos
// (scripts/lib/repo.mjs, links.mjs). Each failing check of the plan's
// acceptance criterion 3 has a fixture of its own.

import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRoutes, loadPages, openSource } from '../scripts/lib/repo.mjs';
import { indexPages, rewriteBody } from '../scripts/lib/links.mjs';
import { adr, makeRepo, plan, tempDir } from './helpers.mjs';

const FOLDERS = ['adr', 'plan'];

/** Loads and rewrites the repos { name: files }; returns the pages, their
 *  bodies by route, the diagnostics and the copies. */
function build(repos, { strict = false, folderList = FOLDERS } = {}) {
  const root = tempDir();
  const sources = new Map();
  const folders = new Map();
  for (const [name, files] of Object.entries(repos)) {
    sources.set(name, openSource(name, makeRepo(root, name, files)));
    folders.set(name, folderList);
  }
  const pages = [];
  const diagnostics = [];
  for (const [name, s] of sources) {
    const r = loadPages(s, folders.get(name), { strict });
    pages.push(...r.pages);
    diagnostics.push(...r.diagnostics);
  }
  checkRoutes(pages, diagnostics);
  const index = indexPages(pages);
  const copies = [];
  const bodies = new Map();
  for (const p of pages) bodies.set(p.route, rewriteBody(p, { sources, folders, index, diagnostics, copies }));
  return { pages, bodies, diagnostics, copies, sources };
}

const errorsOf = (r) => r.diagnostics.filter((d) => d.level === 'error').map((d) => `${d.file}:${d.line}: ${d.msg}`);

test('a valid repo: its pages, kinds, statuses and dates', () => {
  const r = build({
    one: {
      'docs/adr/README.md': '# Decisions\n',
      'docs/adr/0001-x.md': adr('ADR 0001 — X'),
      'docs/adr/template.md': '# Template\n\n**Status:** Proposed | Accepted\n',
      'docs/plan/p/README.md': plan('Plan P', '', 'ready'),
      'docs/plan/p/notes.md': '# Notes\n',
      'docs/plan/q.md': plan('Plan Q', '', 'complete'),
      'docs/guide.md': '# Not collected\n',
    },
  });
  assert.deepEqual(errorsOf(r), []);
  assert.deepEqual(
    r.pages.map((p) => [p.route, p.kind, p.meta?.status ?? null]),
    [
      ['/one/adr/0001-x/', 'adr', 'Accepted'],
      ['/one/adr/', 'intro', null],
      ['/one/plan/p/', 'plan', 'ready'],
      ['/one/plan/p/notes/', 'attachment', null],
      ['/one/plan/q/', 'plan', 'complete'],
    ],
  );
  assert.equal(r.pages.find((p) => p.kind === 'plan').date, '2026-10-01');
});

test('links: to records, files, folders, images, and other repos', () => {
  const body = [
    '[q](../q.md) [q-goal](../q.md#goal) [adr](../../adr/0001-x.md) [here](#scope)',
    '[code](../../../src/main.cpp) [src](../../../src/) [notes](notes.md)',
    '![in](fig.svg) ![out](../../figures/a.png)',
    '[two](https://github.com/branes-ai/two/blob/main/docs/adr/0002-y.md#context)',
    '[two-code](https://github.com/branes-ai/two/blob/main/src/x.cpp) `[code span](nowhere.md)`',
    '[ref]: ../q.md',
    '',
    '## Scope',
  ].join('\n');
  const r = build({
    one: {
      'docs/adr/0001-x.md': adr('X'),
      'docs/plan/p/README.md': plan('P', body),
      'docs/plan/p/notes.md': '# Notes\n',
      'docs/plan/p/fig.svg': '<svg/>',
      'docs/figures/a.png': 'png',
      'docs/plan/q.md': plan('Q', '## Goal\n'),
      'src/main.cpp': '',
    },
    two: { 'docs/adr/0002-y.md': adr('Y') },
  });
  assert.deepEqual(errorsOf(r), []);
  const sha = r.sources.get('one').sha;
  const out = r.bodies.get('/one/plan/p/');
  for (const expected of [
    '[q](/one/plan/q/)',
    '[q-goal](/one/plan/q/#goal)',
    '[adr](/one/adr/0001-x/)',
    '[here](#scope)',
    `[code](https://github.com/branes-ai/one/blob/${sha}/src/main.cpp)`,
    `[src](https://github.com/branes-ai/one/tree/${sha}/src)`,
    '[notes](/one/plan/p/notes/)',
    '![in](fig.svg)',
    `![out](https://raw.githubusercontent.com/branes-ai/one/${sha}/docs/figures/a.png)`,
    '[two](/two/adr/0002-y/#context)',
    '[two-code](https://github.com/branes-ai/two/blob/main/src/x.cpp)',
    '`[code span](nowhere.md)`',
    '[ref]: /one/plan/q/',
  ]) {
    assert.ok(out.includes(expected), `expected ${expected} in:\n${out}`);
  }
  assert.ok(!out.includes('# P'), 'the title is removed');
  assert.deepEqual(r.copies, [{ repo: 'one', repoRel: 'docs/plan/p/fig.svg' }]);
});

test('plans/ and adrs/: their records are plans and ADRs, checked as such', () => {
  const files = {
    'docs/plans/README.md': '# About the plans\n',
    'docs/plans/p.md': plan('Plan P', '', 'ready'),
    'docs/plans/notes/a.md': '# A note\n',
    'docs/plans/q.md': '# Q\n',
    'docs/adrs/0001-x.md': adr('X'),
  };
  const r = build({ one: files }, { strict: true, folderList: ['adrs', 'plans'] });
  assert.deepEqual(
    r.pages.map((p) => [p.route, p.kind, p.meta?.status ?? null]),
    [
      ['/one/adrs/0001-x/', 'adr', 'Accepted'],
      ['/one/plans/', 'intro', null],
      ['/one/plans/notes/a/', 'attachment', null],
      ['/one/plans/p/', 'plan', 'ready'],
      ['/one/plans/q/', 'plan', 'unknown'],
    ],
  );
  assert.deepEqual(errorsOf(r), ['docs/plans/q.md:1: plan has no front matter status (draft, ready, in-progress or complete)']);
});

test('a byte-order mark before the front matter or the title is ignored', () => {
  const r = build({ one: { 'docs/plan/p.md': '\uFEFF' + plan('P'), 'docs/adr/0001-x.md': '\uFEFF' + adr('X') } }, { strict: true });
  assert.deepEqual(errorsOf(r), []);
  assert.deepEqual(r.pages.map((p) => [p.title, p.meta.status]), [['X', 'Accepted'], ['P', 'in-progress']]);
});

test('a plan with no status: a warning, or an error when strict', () => {
  const files = { 'docs/plan/p.md': '# P\n\nIssue: #3. Status: done.\n' };
  const lenient = build({ one: files });
  assert.deepEqual(errorsOf(lenient), []);
  assert.deepEqual(lenient.diagnostics.map((d) => [d.level, d.line]), [['warning', 1], ['warning', 3]]);
  assert.equal(lenient.pages[0].meta.status, 'unknown');
  const strict = build({ one: files }, { strict: true });
  assert.deepEqual(strict.diagnostics.map((d) => d.level), ['error', 'error']);
});

test('fails: a plan with an invalid status', () => {
  assert.deepEqual(errorsOf(build({ one: { 'docs/plan/p.md': plan('P', '', 'done') } })), [
    'docs/plan/p.md:2: status "done" is not one of in-progress, ready, draft, complete',
  ]);
});

test('fails: an ADR with no status block', () => {
  assert.deepEqual(errorsOf(build({ one: { 'docs/adr/0001-x.md': '# X\n\n## Context\n' } })), [
    'docs/adr/0001-x.md:1: ADR has no "**Status:** ..." line under its title',
  ]);
});

test('fails: a record with no title', () => {
  assert.deepEqual(errorsOf(build({ one: { 'docs/plan/p.md': '---\nstatus: ready\n---\nText.\n' } })), [
    'docs/plan/p.md:4: no "# " title heading',
  ]);
});

test('fails: a relative link that does not resolve', () => {
  assert.deepEqual(errorsOf(build({ one: { 'docs/plan/p.md': plan('P', 'See [x](missing.md).') } })), [
    'docs/plan/p.md:6: link target missing.md does not exist',
  ]);
});

test('fails: an anchor with no heading, here or in the target', () => {
  const r = build({
    one: {
      'docs/plan/p.md': plan('P', '[a](#nope) [b](q.md#nope)'),
      'docs/plan/q.md': plan('Q'),
    },
  });
  assert.deepEqual(errorsOf(r), [
    'docs/plan/p.md:6: no heading for anchor #nope',
    'docs/plan/p.md:6: link q.md#nope: one/docs/plan/q.md has no heading for anchor #nope',
  ]);
});

test('fails: an anchor of another repo\'s record that does not exist', () => {
  const r = build({
    one: { 'docs/plan/p.md': plan('P', '[y](https://github.com/branes-ai/two/blob/main/docs/adr/0002-y.md#nope)') },
    two: { 'docs/adr/0002-y.md': adr('Y') },
  });
  assert.equal(errorsOf(r).length, 1);
  assert.match(errorsOf(r)[0], /two\/docs\/adr\/0002-y\.md has no heading for anchor #nope/);
});

test('fails: a root-relative link, and a link out of the repo', () => {
  assert.deepEqual(errorsOf(build({ one: { 'docs/plan/p.md': plan('P', '[a](/docs/x.md) [b](../../../other/x.md)') } })), [
    'docs/plan/p.md:6: root-relative link /docs/x.md; use a path relative to the document',
    'docs/plan/p.md:6: link ../../../other/x.md leaves the repository',
  ]);
});

test('fails: two records with one route', () => {
  const r = build({ one: { 'docs/plan/p.md': plan('P'), 'docs/plan/p/README.md': plan('P too') } });
  assert.deepEqual(errorsOf(r), ['docs/plan/p/README.md:1: same route /one/plan/p/ as one/docs/plan/p.md']);
});
