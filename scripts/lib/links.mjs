// Link checking and rewriting, across the repos (docs/plan/records-site).
//
// A relative link must resolve to a file or folder of its repo; an anchor,
// to a heading of its target. Then it is rewritten:
//   to a page of this site     → the page's route
//   to an image under a published folder → kept (the image is copied)
//   to an image elsewhere      → the raw file on GitHub, at the built commit
//   to any other file          → the file on GitHub, at the built commit
// An absolute github.com/branes-ai/<repo>/blob/main/... link to a page of
// this site becomes the page's route; any other absolute link is kept.

import path from 'node:path';

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp']);
const ABSOLUTE = /^https:\/\/github\.com\/branes-ai\/([A-Za-z0-9_.-]+)\/(?:blob|tree)\/(?:main|master)\/([^#?]+)(?:#(.*))?$/;

const key = (repo, repoRel) => `${repo}\0${repoRel}`;

/** The pages of every source, by repo and repo-relative path. */
export function indexPages(pages) {
  const index = new Map();
  for (const p of pages) index.set(key(p.repo, p.repoRel), p);
  return index;
}

/** The page at repoRel of repo, or at repoRel/README.md when it is a folder. */
function pageAt(index, repo, repoRel) {
  return index.get(key(repo, repoRel)) ?? index.get(key(repo, path.posix.join(repoRel, 'README.md'))) ?? null;
}

/**
 * Rewrites the links of one page. Returns the body (the page without its
 * front matter and title) and adds to `copies` each image to copy, as
 * { repo, repoRel }. Failed checks go to `diagnostics`.
 *   sources : Map name → source (see repo.mjs), for the commit and files
 *   folders : Map name → the folders published from that repo
 */
export function rewriteBody(page, { sources, folders, index, diagnostics, copies }) {
  const source = sources.get(page.repo);
  const ref = source.sha ?? 'main';
  const fail = (lineNo, msg) => diagnostics.push({ level: 'error', repo: page.repo, file: page.repoRel, line: lineNo, msg });

  const route = (target, anchor, lineNo, label) => {
    if (anchor !== null && !target.doc.anchors.has(anchor)) {
      fail(lineNo, `${label}: ${target.repo}/${target.repoRel} has no heading for anchor #${anchor}`);
    }
    return target.route + (anchor !== null ? `#${anchor}` : '');
  };

  const rewrite = (raw, lineNo) => {
    const abs = raw.match(ABSOLUTE);
    if (abs) {
      const [, repo, repoRel, anchor] = abs;
      const target = pageAt(index, repo, decodeURIComponent(repoRel).replace(/\/$/, ''));
      return target ? route(target, anchor === undefined ? null : decodeURIComponent(anchor), lineNo, `link ${raw}`) : raw;
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//')) return raw;
    if (raw.startsWith('#')) {
      const anchor = decodeURIComponent(raw.slice(1));
      if (!page.doc.anchors.has(anchor)) fail(lineNo, `no heading for anchor ${raw}`);
      return raw;
    }
    if (raw.startsWith('/')) {
      fail(lineNo, `root-relative link ${raw}; use a path relative to the document`);
      return raw;
    }
    const [pathPart, ...rest] = raw.split('#');
    const anchor = rest.length ? decodeURIComponent(rest.join('#')) : null;
    const repoRel = path.posix.normalize(path.posix.join(path.posix.dirname(page.repoRel), decodeURIComponent(pathPart))).replace(/\/$/, '');
    if (repoRel === '..' || repoRel.startsWith('../')) {
      fail(lineNo, `link ${raw} leaves the repository`);
      return raw;
    }
    const isFile = source.files.has(repoRel);
    const isDir = repoRel === '.' || source.dirs.has(repoRel);
    if (!isFile && !isDir) {
      fail(lineNo, `link target ${raw} does not exist`);
      return raw;
    }
    const target = pageAt(index, page.repo, repoRel);
    if (target) return route(target, anchor, lineNo, `link ${raw}`);
    const ext = path.posix.extname(repoRel).toLowerCase();
    if (isFile && IMAGE_EXT.has(ext)) {
      const published = (folders.get(page.repo) ?? []).some((f) => repoRel.startsWith(`docs/${f}/`));
      if (published) {
        copies.push({ repo: page.repo, repoRel });
        return raw;
      }
      return `https://raw.githubusercontent.com/branes-ai/${page.repo}/${ref}/${repoRel}`;
    }
    const kind = isDir ? 'tree' : 'blob';
    const where = repoRel === '.' ? '' : `/${repoRel}`;
    return `${source.github}/${kind}/${ref}${where}` + (anchor !== null ? `#${anchor}` : '');
  };

  // Inline links and reference definitions, outside code spans and fences.
  const rewriteLine = (line, lineNo) =>
    line
      .split(/(`+[^`]*`+)/)
      .map((part, i) => {
        if (i % 2 === 1) return part;
        return part
          .replace(/(\]\()(<[^>]+>|[^)\s]+)((?:\s+"[^"]*")?\))/g, (_, open, target, close) => {
            const bare = target.startsWith('<') ? target.slice(1, -1) : target;
            return open + rewrite(bare, lineNo) + close;
          })
          .replace(/^(\s*\[[^\]]+\]:\s+)(\S+)/, (_, open, target) => open + rewrite(target, lineNo));
      })
      .join('');

  const { doc } = page;
  return doc.tagged
    .map((t, i) => (i === doc.titleLine ? null : t.code ? t.line : rewriteLine(t.line, i + 1 + doc.offset)))
    .filter((l) => l !== null)
    .join('\n')
    .replace(/^\s*\n/, '');
}
