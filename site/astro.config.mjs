// @ts-check
import fs from 'node:fs';
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import rehypeRewrite from 'rehype-rewrite';

// The content and the sidebar are generated from the repos in ../sources.yaml
// by ../scripts/collect.mjs (`npm run collect` in the repo root).
const sidebarFile = new URL('./src/generated/sidebar.json', import.meta.url);
if (!fs.existsSync(sidebarFile)) {
  throw new Error('src/generated/sidebar.json is missing: run `npm run collect` in the repo root first');
}
const sidebar = JSON.parse(fs.readFileSync(sidebarFile, 'utf8'));

// Deployment configuration.
//   For GitHub Pages: DEPLOY_TARGET=github-pages (sets the project base path).
//   For local dev / other hosts: no env vars needed.
const isGitHubPages = process.env.DEPLOY_TARGET === 'github-pages';
const site = isGitHubPages
  ? 'https://branes-ai.github.io'
  : (process.env.SITE_URL || 'http://localhost:4321');
const base = isGitHubPages ? '/architecture/' : '/';

// Rehype plugin to rewrite absolute internal links with the base path, so the
// root-relative routes collect.mjs generates resolve under /architecture/ on
// Pages. Every root-relative link in the content is such a route (collect.mjs
// rejects one in a record), so each is prefixed, including the routes of this
// repo's own records, which already start with /architecture/. Protocol-
// relative `//host` links are left untouched.
const basePrefix = base.replace(/\/$/, ''); // '/architecture'
const rehypeBaseLinks = isGitHubPages ? [
  [
    rehypeRewrite,
    {
      rewrite: (node) => {
        if (node.type !== 'element') return;
        const attr = node.tagName === 'a' ? 'href' : node.tagName === 'img' ? 'src' : null;
        if (!attr || typeof node.properties?.[attr] !== 'string') return;
        const val = node.properties[attr];
        if (val.startsWith('/') && !val.startsWith('//')) {
          node.properties[attr] = basePrefix + val;
        }
      },
    },
  ],
] : [];

// https://astro.build/config
export default defineConfig({
  server: { host: '0.0.0.0' },
  site,
  base,
  trailingSlash: 'always',
  markdown: {
    rehypePlugins: [...rehypeBaseLinks],
  },
  integrations: [
    starlight({
      title: 'Architecture',
      description: 'The decisions (ADRs) and plans of every repo of the Branes.AI stack, with their status.',
      favicon: '/favicon.svg',
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/branes-ai/architecture' },
      ],
      // Each record's page sets its own editUrl, to its source in its repo;
      // the generated indexes set none.
      editLink: {
        baseUrl: 'https://github.com/branes-ai/architecture/edit/main/',
      },
      sidebar,
      customCss: ['./src/styles/custom.css'],
    }),
  ],
});
