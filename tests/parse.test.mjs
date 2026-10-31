// The parsing rules, on strings (scripts/lib/parse.mjs).

import test from 'node:test';
import assert from 'node:assert/strict';
import { adrMeta, parseDoc, parseFrontMatter, planMeta, proseStatusLine, routeOf } from '../scripts/lib/parse.mjs';
import { classify } from '../scripts/lib/repo.mjs';

test('routeOf: a README is its folder; each segment is slugified', () => {
  assert.equal(routeOf('racing-drone', 'plan/b0/README.md'), '/racing-drone/plan/b0/');
  assert.equal(routeOf('cortex', 'adr/0001-third-party.md'), '/cortex/adr/0001-third-party/');
  assert.equal(routeOf('cortex', 'adr/README.md'), '/cortex/adr/');
  assert.equal(routeOf('x', 'plan/Big Plan/README.md'), '/x/plan/big-plan/');
});

test('classify: intro, record, attachment, template', () => {
  assert.equal(classify('README.md'), 'intro');
  assert.equal(classify('b0.md'), 'record');
  assert.equal(classify('b0/README.md'), 'record');
  assert.equal(classify('b0/notes.md'), 'attachment');
  assert.equal(classify('template.md'), 'skip');
});

test('front matter: none, valid, quoted, commented', () => {
  assert.equal(parseFrontMatter('# T\n').data, null);
  const f = parseFrontMatter('---\nstatus: "ready"   # approved\nissue: a/b#3\n---\n# T\n');
  assert.deepEqual(f.errors, []);
  assert.equal(f.lineCount, 4);
  assert.equal(f.data.status.value, 'ready');
  assert.equal(f.data.issue.value, 'a/b#3');
});

test('front matter: unclosed, malformed and repeated lines are errors', () => {
  assert.match(parseFrontMatter('---\nstatus: ready\n# T\n').errors[0].msg, /not closed/);
  assert.match(parseFrontMatter('---\njust text\n---\n').errors[0].msg, /not "key: value"/);
  const r = parseFrontMatter('---\nstatus: ready\nstatus: draft\n---\n');
  assert.equal(r.errors[0].line, 3);
  assert.match(r.errors[0].msg, /repeated/);
});

test('planMeta: a valid status and issue', () => {
  const m = planMeta(parseDoc('---\nstatus: complete\nissue: branes-ai/anatomy#10\n---\n# P\n'));
  assert.deepEqual(m, { status: 'complete', issue: 'branes-ai/anatomy#10', errors: [], missing: false });
});

test('planMeta: missing, invalid, unknown key, bad issue', () => {
  assert.equal(planMeta(parseDoc('# P\n')).missing, true);
  assert.equal(planMeta(parseDoc('---\nissue: a/b#1\n---\n# P\n')).missing, true);
  const bad = planMeta(parseDoc('---\nstatus: done\nowner: me\nissue: #4\n---\n# P\n'));
  assert.deepEqual(
    bad.errors.map((e) => [e.line, e.msg.split(' ')[0]]),
    [[3, 'unknown'], [2, 'status'], [4, 'issue']],
  );
});

test('proseStatusLine: finds "Status:" and "**Status:**" in the header only', () => {
  assert.equal(proseStatusLine(parseDoc('# P\n\nIssue: #5. Status: done.\n')), 3);
  assert.equal(proseStatusLine(parseDoc('---\nstatus: ready\n---\n# P\n\n**Status:** Approved\n')), 6);
  assert.equal(proseStatusLine(parseDoc('# P\n\n## Goal\n\nStatus: in the body\n')), null);
  assert.equal(proseStatusLine(parseDoc('# P\n\nThe status quo.\n')), null);
});

test('adrMeta: the statuses of the template, with a note', () => {
  const a = adrMeta(parseDoc('# A\n\n**Status:** Accepted (amended 2026-10-07: CMake 4.0)\n**Date:** 2026-05-20\n'));
  assert.deepEqual(a, { status: 'Accepted', state: 'accepted', note: 'amended 2026-10-07: CMake 4.0', date: '2026-05-20', errors: [] });
  assert.equal(adrMeta(parseDoc('# A\n\n**Status:** Superseded by [0009](0009-x.md)\n')).state, 'superseded');
  assert.equal(adrMeta(parseDoc('# A\n\n**Status:** Proposed\n')).date, null);
});

test('adrMeta: no status block, an unknown status, a bad date', () => {
  assert.match(adrMeta(parseDoc('# A\n\n## Context\n\n**Status:** Accepted\n')).errors[0].msg, /no "\*\*Status:\*\* \.\.\." line/);
  assert.match(adrMeta(parseDoc('# A\n\n**Status:** Approved\n')).errors[0].msg, /is not Proposed/);
  const d = adrMeta(parseDoc('# A\n\n**Status:** Accepted\n**Date:** May 2026\n'));
  assert.equal(d.errors[0].line, 4);
});

test('parseDoc: the title takes no slug; code fences hide headings', () => {
  const d = parseDoc('# Goal\n\n## Goal\n\n```\n## Not a heading\n```\n\n## Goal\n');
  assert.equal(d.title, 'Goal');
  assert.deepEqual([...d.anchors], ['goal', 'goal-1']);
});
