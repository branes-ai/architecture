// Parsing one record: its front matter, title, headings, and ADR status block,
// and the route rule (docs/plan/records-site).
//
// Nothing here touches the file system; every function takes text and
// returns data, so the rules are tested on strings.

import GithubSlugger, { slug as slugify } from 'github-slugger';

/** A plan's states, in the order the plans index lists them. */
export const PLAN_STATUSES = ['in-progress', 'ready', 'draft', 'complete'];

/** The keys a plan's front matter may have. */
export const PLAN_KEYS = new Set(['status', 'issue']);

/** An ADR's status: cortex's template, with an optional note in parentheses. */
const ADR_STATUS = /^(Proposed|Accepted|Deprecated|Superseded by \S.*?)(?:\s+\((.+)\))?$/;

const ISSUE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+#[1-9][0-9]*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The site route of the document at `docsRel` (a path under the repo's docs/,
 * such as plan/b0/README.md) of repo `repo`. Each segment is slugified as
 * Starlight's loader does; a README is its folder's page.
 *   routeOf('racing-drone', 'plan/b0/README.md') === '/racing-drone/plan/b0/'
 *   routeOf('cortex', 'adr/0001-x.md')            === '/cortex/adr/0001-x/'
 */
export function routeOf(repo, docsRel) {
  const parts = docsRel.split('/');
  const base = parts.pop().replace(/\.md$/, '');
  if (base !== 'README') parts.push(base);
  return `/${[repo, ...parts].map((s) => slugify(s)).join('/')}/`;
}

/** Splits text into lines tagged with whether they sit in a code fence. */
export function lines(text) {
  let fence = null;
  return text.split('\n').map((line) => {
    const m = line.match(/^\s*(`{3,}|~{3,})/);
    if (m) {
      if (fence === null) fence = m[1][0];
      else if (m[1][0] === fence) fence = null;
      return { line, code: true };
    }
    return { line, code: fence !== null };
  });
}

/** A heading's text as the slugger sees it: links become their text, and
 *  emphasis and code markers are dropped. */
export function headingText(raw) {
  return raw
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .trim();
}

/**
 * Front matter: a first line `---`, flat `key: value` lines, and a closing
 * `---`. Values may be quoted; a `#` after whitespace starts a comment.
 * Returns { data, lineCount, errors } — lineCount is the number of lines it
 * spans (0 when there is none); each error is { line, msg }, 1-based.
 */
export function parseFrontMatter(text) {
  const all = text.split('\n');
  if (all[0] !== '---') return { data: null, lineCount: 0, errors: [] };
  const end = all.indexOf('---', 1);
  if (end === -1) return { data: null, lineCount: 0, errors: [{ line: 1, msg: 'front matter is not closed by a "---" line' }] };
  const data = {};
  const errors = [];
  for (let i = 1; i < end; i++) {
    const raw = all[i].replace(/\s+#.*$/, '');
    if (raw.trim() === '' || raw.trimStart().startsWith('#')) continue;
    const m = raw.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*?)\s*$/);
    if (!m) {
      errors.push({ line: i + 1, msg: `front matter line is not "key: value": ${JSON.stringify(all[i])}` });
      continue;
    }
    const [, key, rawValue] = m;
    const value = rawValue.replace(/^(["'])(.*)\1$/, '$2');
    if (key in data) errors.push({ line: i + 1, msg: `front matter key "${key}" is repeated` });
    data[key] = { value, line: i + 1 };
  }
  return { data, lineCount: end + 1, errors };
}

/**
 * One document: its front matter, the lines after it, its title (the first
 * `# ` heading) and the anchors of its other headings. The title is removed
 * from the page, so it takes no slug.
 */
export function parseDoc(text) {
  const front = parseFrontMatter(text);
  const bodyLines = text.split('\n').slice(front.lineCount);
  const tagged = lines(bodyLines.join('\n'));
  const slugger = new GithubSlugger();
  const anchors = new Set();
  let title = null;
  let titleLine = -1;
  tagged.forEach((t, i) => {
    if (t.code) return;
    const m = t.line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!m) return;
    if (m[1].length === 1 && title === null) {
      title = headingText(m[2]);
      titleLine = i;
    } else {
      anchors.add(slugger.slug(headingText(m[2])));
    }
  });
  // Lines are numbered as in the file, so messages point at the source.
  const offset = front.lineCount;
  return { front, tagged, offset, title, titleLine, anchors };
}

/** The lines of a document's header: from its title to its first `## `. */
function headerLines(doc) {
  const out = [];
  for (let i = doc.titleLine + 1; i < doc.tagged.length; i++) {
    const t = doc.tagged[i];
    if (!t.code && /^##\s/.test(t.line)) break;
    if (!t.code) out.push({ line: t.line, lineNo: i + 1 + doc.offset });
  }
  return out;
}

/**
 * A plan's status, from its front matter. Returns { status, issue, errors,
 * missing } — missing is true when there is no status at all, which the
 * caller reports as a warning (lenient) or an error (strict).
 */
export function planMeta(doc) {
  const errors = doc.front.errors.map((e) => ({ ...e }));
  const data = doc.front.data;
  if (data === null) return { status: null, issue: null, errors, missing: true };
  for (const [key, { line }] of Object.entries(data)) {
    if (!PLAN_KEYS.has(key)) errors.push({ line, msg: `unknown front matter key "${key}" (allowed: ${[...PLAN_KEYS].join(', ')})` });
  }
  let status = null;
  if (!data.status) {
    return { status: null, issue: null, errors, missing: true };
  }
  if (PLAN_STATUSES.includes(data.status.value)) status = data.status.value;
  else errors.push({ line: data.status.line, msg: `status "${data.status.value}" is not one of ${PLAN_STATUSES.join(', ')}` });
  let issue = null;
  if (data.issue) {
    if (ISSUE.test(data.issue.value)) issue = data.issue.value;
    else errors.push({ line: data.issue.line, msg: `issue "${data.issue.value}" is not "owner/repo#N"` });
  }
  return { status, issue, errors, missing: false };
}

/** A plan's prose status line in its header ("Status: ..."), which the front
 *  matter replaces. Returns its line number, or null. */
export function proseStatusLine(doc) {
  for (const { line, lineNo } of headerLines(doc)) {
    if (/\bStatus(?::\*\*|\*\*:|:)/.test(line)) return lineNo;
  }
  return null;
}

/**
 * An ADR's status and date, from its header's `**Status:** X` and
 * `**Date:** YYYY-MM-DD` lines. Returns { status, state, note, date, errors }
 * — state is the status's kind (proposed, accepted, superseded, deprecated).
 */
export function adrMeta(doc) {
  const errors = [];
  let status = null;
  let state = null;
  let note = null;
  let date = null;
  let statusSeen = false;
  for (const { line, lineNo } of headerLines(doc)) {
    const s = line.match(/^\*\*Status:\*\*\s*(.*?)\s*$/);
    if (s) {
      statusSeen = true;
      const m = s[1].match(ADR_STATUS);
      if (!m) {
        errors.push({ line: lineNo, msg: `ADR status "${s[1]}" is not Proposed, Accepted, Deprecated or "Superseded by ..." (with an optional note in parentheses)` });
      } else {
        status = m[1];
        state = m[1].split(' ')[0].toLowerCase();
        note = m[2] ?? null;
      }
    }
    const d = line.match(/^\*\*Date:\*\*\s*(.*?)\s*$/);
    if (d) {
      if (DATE.test(d[1])) date = d[1];
      else errors.push({ line: lineNo, msg: `ADR date "${d[1]}" is not YYYY-MM-DD` });
    }
  }
  if (!statusSeen) {
    errors.push({ line: doc.titleLine + 1 + doc.offset, msg: 'ADR has no "**Status:** ..." line under its title' });
  }
  return { status, state, note, date, errors };
}
