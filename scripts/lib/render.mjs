// Writing the site's content: one page per record, the indexes, the sidebar,
// and the manifest (docs/plan/records-site).
//
//   site/src/content/docs/<repo>/<path under docs/>  the records (README.md → index.md)
//   site/src/content/docs/index.md                   the overview
//   site/src/content/docs/plans.md                   every plan, by status
//   site/src/content/docs/decisions.md               every ADR, by repo
//   site/src/content/docs/<repo>/index.md            one repo's records
//   site/src/generated/sidebar.json                  the sidebar
//   site/src/generated/manifest.json                 what was published, per repo
//
// Everything under these paths is deleted and rewritten on every run.

import fs from 'node:fs';
import path from 'node:path';
import { PLAN_STATUSES } from './parse.mjs';
import { kindOf } from './repo.mjs';

export const STATUS_LABEL = {
  'in-progress': 'In progress',
  ready: 'Ready',
  draft: 'Draft',
  complete: 'Complete',
  unknown: 'Unknown',
};
const PLAN_VARIANT = { 'in-progress': 'caution', ready: 'note', draft: 'default', complete: 'success', unknown: 'danger' };
const ADR_VARIANT = { proposed: 'note', accepted: 'success', superseded: 'default', deprecated: 'default' };

const html = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const link = (text, href) => `[${cell(text).replace(/[[\]]/g, '\\$&')}](${href})`;

function issueUrl(issue) {
  const [repo, n] = issue.split('#');
  return `https://github.com/${repo}/issues/${n}`;
}

/** The output path of a page, under content/docs/. */
function outPath(page) {
  return path.posix.join(page.repo, page.docsRel.replace(/(^|\/)README\.md$/, '$1index.md'));
}

/** The line under a record's title: its status, date, issue and source. */
function metaLine(page, source) {
  const ref = source.sha ?? 'main';
  const parts = [];
  if (page.kind === 'plan') {
    const s = page.meta.status;
    parts.push(`<span class="rec-status rec-status--${s}">${html(STATUS_LABEL[s])}</span>`);
    if (page.date) parts.push(`updated ${html(page.date)}`);
    if (page.meta.issue) parts.push(`<a href="${html(issueUrl(page.meta.issue))}">${html(page.meta.issue)}</a>`);
  } else if (page.kind === 'adr' && page.meta.status) {
    const note = page.meta.note ? ` (${html(page.meta.note)})` : '';
    parts.push(`<span class="rec-status rec-status--adr-${page.meta.state}">${html(page.meta.status)}</span>${note}`);
    if (page.date) parts.push(html(page.date));
  }
  parts.push(`<a href="${html(`${source.github}/blob/${ref}/${page.repoRel}`)}">${html(`${page.repo}/${page.repoRel}`)}</a>`);
  return `<p class="rec-meta">${parts.join(' · ')}</p>\n\n`;
}

function frontMatter(title, editUrl) {
  const lines = ['---', `title: ${JSON.stringify(title)}`];
  if (editUrl) lines.push(`editUrl: ${JSON.stringify(editUrl)}`);
  else lines.push('editUrl: false');
  return lines.concat(['---', '']).join('\n');
}

const byDateThenTitle = (a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.title.localeCompare(b.title);

function planTable(plans, { withRepo }) {
  const head = withRepo ? '| Plan | Repo | Issue | Updated |\n|---|---|---|---|' : '| Plan | Issue | Updated |\n|---|---|---|';
  const rows = plans.map((p) => {
    const issue = p.meta.issue ? link(p.meta.issue, issueUrl(p.meta.issue)) : '';
    const cols = [link(p.title, p.route), ...(withRepo ? [link(p.repo, `/${p.repo}/`)] : []), issue, p.date ?? ''];
    return `| ${cols.join(' | ')} |`;
  });
  return `${head}\n${rows.join('\n')}\n`;
}

function adrTable(adrs) {
  const rows = adrs.map((a) => `| ${link(a.title, a.route)} | ${cell(a.meta.status ?? '')}${a.meta.note ? ` (${cell(a.meta.note)})` : ''} | ${a.date ?? ''} |`);
  return `| Decision | Status | Date |\n|---|---|---|\n${rows.join('\n')}\n`;
}

const planStatusOrder = (pages) => {
  const statuses = pages.some((p) => p.meta.status === 'unknown') ? ['unknown', ...PLAN_STATUSES] : PLAN_STATUSES;
  return statuses.map((s) => [s, pages.filter((p) => p.meta.status === s).sort(byDateThenTitle)]);
};

/**
 * Writes the site's content into siteSrc (site/src). pages are all sources'
 * pages; bodies maps each page to its rewritten body; copies are the images
 * to copy; sources and folders are by repo name, in sources.yaml's order.
 */
export function writeSite(siteSrc, { pages, bodies, copies, sources, folders }) {
  const contentDir = path.join(siteSrc, 'content', 'docs');
  const genDir = path.join(siteSrc, 'generated');
  fs.rmSync(contentDir, { recursive: true, force: true });
  fs.rmSync(genDir, { recursive: true, force: true });
  fs.mkdirSync(contentDir, { recursive: true });
  fs.mkdirSync(genDir, { recursive: true });
  const write = (rel, text) => {
    const out = path.join(contentDir, rel);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, text);
  };

  for (const page of pages) {
    const source = sources.get(page.repo);
    write(outPath(page), frontMatter(page.title, `${source.github}/edit/main/${page.repoRel}`) + metaLine(page, source) + bodies.get(page) + '\n');
  }
  for (const { repo, repoRel } of copies) {
    const out = path.join(contentDir, repo, repoRel.slice('docs/'.length));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.copyFileSync(path.join(sources.get(repo).root, repoRel), out);
  }

  const repos = [...sources.keys()];
  // A repo's plans or ADRs, of every folder of that kind or of one folder.
  const ofKind = (kind, repo, folder) =>
    pages.filter((p) => p.kind === kind && (repo === undefined || p.repo === repo) && (folder === undefined || p.folder === folder));
  const plansOf = (repo, folder) => ofKind('plan', repo, folder);
  const adrsOf = (repo) => ofKind('adr', repo);
  const introOf = (repo, folder) => pages.find((p) => p.repo === repo && p.kind === 'intro' && p.folder === folder);
  const otherOf = (repo, folder) => ofKind(kindOf(folder), repo, folder);
  const headingOf = (folder) => ({ adr: 'Decisions', plan: 'Plans' })[kindOf(folder)] ?? folder;

  // The overview.
  const allPlans = plansOf();
  const statuses = planStatusOrder(allPlans).map(([s]) => s);
  const overviewRows = repos.map((repo) => {
    const plans = plansOf(repo);
    const counts = statuses.map((s) => plans.filter((p) => p.meta.status === s).length || '');
    const has = pages.some((p) => p.repo === repo);
    const name = has ? link(repo, `/${repo}/`) : repo;
    return `| ${name} | ${adrsOf(repo).length || ''} | ${counts.join(' | ')} |`;
  });
  const built = repos.map((repo) => {
    const s = sources.get(repo);
    return s.sha ? `[${repo}@${s.sha.slice(0, 7)}](${s.github}/tree/${s.sha})` : `${repo} (no commits)`;
  });
  write(
    'index.md',
    frontMatter('Architecture records', null) +
      'The decisions (ADRs) and plans of every repo of the Branes.AI stack, with their status. ' +
      'Each record lives in its repo, under `docs/adr/` or `docs/plan/` (or `docs/adrs/`, `docs/plans/`), and is edited there; this site gathers them every hour.\n\n' +
      '- [Plans](/plans/): every plan, by status.\n' +
      '- [Decisions](/decisions/): every ADR, by repo.\n\n' +
      '## By repo\n\n' +
      `| Repo | Decisions | ${statuses.map((s) => `Plans: ${STATUS_LABEL[s].toLowerCase()}`).join(' | ')} |\n` +
      `|---|---|${statuses.map(() => '---|').join('')}\n` +
      overviewRows.join('\n') +
      '\n\n## Built from\n\n' +
      built.join(', ') +
      '\n',
  );

  // Every plan, by status.
  let plansPage = frontMatter('Plans', null) +
    'Every plan of the stack, by its status: **draft** (written, not yet approved), **ready** (approved, no work merged), ' +
    '**in progress** (work merged, more to come), **complete** (all merged). The newest update comes first.\n\n';
  for (const [s, list] of planStatusOrder(allPlans)) {
    if (list.length === 0) continue;
    plansPage += `## ${STATUS_LABEL[s]} (${list.length})\n\n`;
    if (s === 'unknown') plansPage += 'These plans have no front matter status yet.\n\n';
    plansPage += planTable(list, { withRepo: true }) + '\n';
  }
  write('plans.md', plansPage);

  // Every ADR, by repo.
  let decisions = frontMatter('Decisions', null) + 'Every architecture decision record (ADR) of the stack, by repo.\n\n';
  for (const repo of repos) {
    const adrs = adrsOf(repo);
    if (adrs.length === 0) continue;
    decisions += `## ${repo}\n\n${adrTable(adrs)}\n`;
  }
  write('decisions.md', decisions);

  // One page per repo with records.
  for (const repo of repos) {
    if (!pages.some((p) => p.repo === repo)) continue;
    const s = sources.get(repo);
    let text = frontMatter(repo, null) + `The records of [branes-ai/${repo}](${s.github}).\n\n`;
    for (const folder of folders.get(repo)) {
      const intro = introOf(repo, folder);
      const records = otherOf(repo, folder);
      if (!intro && records.length === 0) continue;
      text += `## ${headingOf(folder)}\n\n`;
      if (intro) text += `${link(intro.title, intro.route)}\n\n`;
      if (kindOf(folder) === 'plan') {
        for (const [st, list] of planStatusOrder(records)) {
          if (list.length) text += `### ${STATUS_LABEL[st]}\n\n${planTable(list, { withRepo: false })}\n`;
        }
      } else if (kindOf(folder) === 'adr') {
        text += adrTable(records) + '\n';
      } else {
        text += records.map((r) => `- ${link(r.title, r.route)}`).join('\n') + '\n\n';
      }
    }
    write(`${repo}/index.md`, text);
  }

  // The sidebar.
  const item = (p) => {
    const it = { label: p.title, link: p.route };
    if (p.kind === 'plan') it.badge = { text: STATUS_LABEL[p.meta.status], variant: PLAN_VARIANT[p.meta.status] };
    if (p.kind === 'adr' && p.meta.state) it.badge = { text: p.meta.state[0].toUpperCase() + p.meta.state.slice(1), variant: ADR_VARIANT[p.meta.state] };
    return it;
  };
  const sidebar = [
    { label: 'Overview', link: '/' },
    { label: 'Plans', link: '/plans/' },
    { label: 'Decisions', link: '/decisions/' },
  ];
  for (const repo of repos) {
    if (!pages.some((p) => p.repo === repo)) continue;
    const items = [{ label: 'Overview', link: `/${repo}/` }];
    for (const folder of folders.get(repo)) {
      const intro = introOf(repo, folder);
      const records = kindOf(folder) === 'plan'
        ? planStatusOrder(plansOf(repo, folder)).flatMap(([, list]) => list)
        : otherOf(repo, folder);
      if (!intro && records.length === 0) continue;
      items.push({
        label: headingOf(folder),
        collapsed: true,
        items: [...(intro ? [{ label: 'About', link: intro.route }] : []), ...records.map(item)],
      });
    }
    sidebar.push({ label: repo, collapsed: true, items });
  }
  fs.writeFileSync(path.join(genDir, 'sidebar.json'), JSON.stringify(sidebar, null, 2) + '\n');

  const manifest = {
    repos: repos.map((repo) => ({
      name: repo,
      sha: sources.get(repo).sha,
      folders: folders.get(repo),
      pages: pages
        .filter((p) => p.repo === repo)
        .map((p) => ({ path: p.repoRel, kind: p.kind, route: p.route, status: p.meta?.status ?? null })),
    })),
  };
  fs.writeFileSync(path.join(genDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}
