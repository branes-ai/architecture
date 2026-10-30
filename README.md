# architecture

Aggregation repo to discuss, plan, refine, and track ADRs and implementation plans for the features of the Branes AI Embodied AI platform.

It publishes every repo's decisions (ADRs) and plans, with their status, in one site: **[branes-ai.github.io/architecture](https://branes-ai.github.io/architecture/)**. The repos' own documentation sites are for the users of each library; this site is for the architects. A decision or plan that spans several repos reads as one thread here ([plan](docs/plan/records-site/README.md), [#1](https://github.com/branes-ai/architecture/issues/1)).

## Where the records live

Each record stays in its repo, and is edited and reviewed there:
- **ADRs** in `docs/adr/`, one file each, with a status block under the title:

  ```markdown
  # ADR 0001 — A decision

  **Status:** Accepted
  **Date:** 2026-10-28
  ```

  The status is `Proposed`, `Accepted`, `Deprecated` or `Superseded by …`, with an optional note in parentheses.
- **Plans** in `docs/plan/`, as `<name>.md` or `<name>/README.md`, with front matter:

  ```markdown
  ---
  status: in-progress
  issue: branes-ai/anatomy#10
  ---
  # Plan: the libraries split
  ```

  | `status` | Meaning |
  |---|---|
  | `draft` | written; not yet approved |
  | `ready` | approved; no work merged yet |
  | `in-progress` | at least one PR merged; more to come |
  | `complete` | all of it merged |

  `issue` is optional. The date shown is the file's last commit.

A folder's `README.md` is its introduction, `template.md` is skipped, and any other `.md` under a plan's folder is published with the plan.

## How it is built

- **[`sources.yaml`](sources.yaml)** lists the repos and the folders taken from each. Adding a repo is one line.
- **[`scripts/collect.mjs`](scripts/collect.mjs)** clones each repo (blobless, `docs/` only) and checks every record: its title, its status, and every relative link and anchor. Then it writes the site's content: a page per record, the indexes (plans by status, decisions by repo, one page per repo), and the sidebar. A link between records becomes a link between pages, in any repo; a link to any other file goes to GitHub, at the commit the site was built from. Any error fails the build, naming the file and line; the workflows run it with `--strict`, so a plan without a status is an error too.
- **[`site/`](site/)** is the Starlight site.
- **[`deploy.yml`](.github/workflows/deploy.yml)** builds and publishes it every hour, on a push to `main`, and by hand.

## Checking a repo's records in its CI

The [`check-records`](actions/check-records/action.yml) action runs the same checks on one repo, so a bad record fails its PR rather than the hourly build:

```yaml
records:
  name: Architecture records
  runs-on: ubuntu-24.04
  steps:
    - uses: actions/checkout@<sha>
    - uses: branes-ai/architecture/actions/check-records@<sha of this repo>
      with:
        strict: 'true'
```

A repo not yet in `sources.yaml` names its folders: `folders: plans`. A `plans/` folder holds plans and an `adrs/` folder ADRs, as `plan/` and `adr/` do.

## Working on it

```bash
npm ci && npm --prefix site ci
npm test                                          # the collector's tests
npm run preview                                   # the site, from the sibling clones in ../ where present
node scripts/check-records.mjs --dir ../anatomy   # one repo's records
```
