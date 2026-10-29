// Test fixtures: small git repos built in a temporary directory.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const git = (dir, args) =>
  execFileSync('git', ['-C', dir, ...args], {
    stdio: 'ignore',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@example.com',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@example.com',
      GIT_AUTHOR_DATE: '2026-10-01T12:00:00Z',
      GIT_COMMITTER_DATE: '2026-10-01T12:00:00Z',
    },
  });

const made = [];
process.on('exit', () => {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
});

/** A fresh temporary directory, removed when the process exits. */
export function tempDir(prefix = 'records-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  made.push(dir);
  return dir;
}

/** A git repo at <parent>/<name> holding `files` ({ path: text }), all in one
 *  commit dated 2026-10-01. Returns its path. */
export function makeRepo(parent, name, files) {
  const dir = path.join(parent, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const [rel, text] of Object.entries(files)) {
    const out = path.join(dir, rel);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, text);
  }
  git(dir, ['init', '--quiet', '--initial-branch=main']);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '--quiet', '-m', 'fixture']);
  return dir;
}

/** A plan with valid front matter. */
export const plan = (title, body = '', status = 'in-progress') => `---\nstatus: ${status}\n---\n# ${title}\n\n${body}\n`;

/** An ADR with a valid status block. */
export const adr = (title, body = '', status = 'Accepted') => `# ${title}\n\n**Status:** ${status}\n**Date:** 2026-10-28\n\n## Context\n\n${body}\n`;
