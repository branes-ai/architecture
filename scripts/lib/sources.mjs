// sources.yaml: the repos the site collects from, and the folders it takes
// from each (docs/plan/records-site).

import fs from 'node:fs';
import { parse } from 'yaml';

const NAME = /^[A-Za-z0-9_.-]+$/;
export const FOLDER = /^[a-z0-9][a-z0-9-]*$/;

/** The records folders are singular (docs/plan/records-coverage): `plans`
 *  and `adrs` are errors that name the folder to use, or null for any other. */
const SINGULAR = { plans: 'plan', adrs: 'adr' };
export const pluralFolder = (f) =>
  Object.hasOwn(SINGULAR, f) ? `folder "${f}" is not used: records go in docs/${SINGULAR[f]}/ (folder "${SINGULAR[f]}")` : null;

/** Reads and checks sources.yaml. Returns [{ name, folders }], in file order;
 *  throws with every problem found. */
export function readSources(file) {
  const data = parse(fs.readFileSync(file, 'utf8'));
  const problems = [];
  if (!data || !Array.isArray(data.repos) || data.repos.length === 0) {
    throw new Error(`${file}: expected a non-empty "repos:" list`);
  }
  const seen = new Set();
  const repos = data.repos.map((r, i) => {
    const where = `${file}: repos[${i}]`;
    if (!r || typeof r.name !== 'string' || !NAME.test(r.name)) problems.push(`${where}: "name" is not a repo name`);
    else if (seen.has(r.name)) problems.push(`${where}: repo "${r.name}" is listed twice`);
    else seen.add(r.name);
    const folders = r?.folders;
    if (!Array.isArray(folders) || folders.length === 0 || !folders.every((f) => typeof f === 'string' && FOLDER.test(f))) {
      problems.push(`${where}: "folders" is not a non-empty list of folder names`);
    } else if (new Set(folders).size !== folders.length) {
      problems.push(`${where}: "folders" lists a folder twice`);
    } else {
      for (const msg of folders.map(pluralFolder).filter(Boolean)) problems.push(`${where}: ${msg}`);
    }
    const extra = Object.keys(r ?? {}).filter((k) => k !== 'name' && k !== 'folders');
    if (extra.length) problems.push(`${where}: unknown key(s) ${extra.join(', ')}`);
    return { name: r?.name, folders };
  });
  if (problems.length) throw new Error(problems.join('\n'));
  return repos;
}
