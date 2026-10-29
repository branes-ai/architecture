---
status: complete
issue: branes-ai/architecture#1
---
# Plan: one site for the stack's ADRs and plans

Approved 2026-10-29 ([architecture#1](https://github.com/branes-ai/architecture/issues/1)). Implemented in [architecture#2](https://github.com/branes-ai/architecture/pull/2) (A), [anatomy#14](https://github.com/branes-ai/anatomy/pull/14) (B1), [racing-drone#74](https://github.com/branes-ai/racing-drone/pull/74) (B2), [cortex#525](https://github.com/branes-ai/cortex/pull/525) (B3) and [architecture#7](https://github.com/branes-ai/architecture/pull/7) (C).

## Goal

The repos' documentation sites (`branes-ai.github.io/<repo>`) serve the users of each library: what it does, and how to use it. The ADRs and plans serve the architects. Today both go to the same site, from the same `docs/`.

This plan separates them:
- **The architects' site**, branes-ai.github.io/architecture, gathers every stack repo's ADRs and plans, each with its status. It has indexes across the repos.
- **Each repo's user site** stops publishing its ADRs and plans.
- **The sources stay where they are.** ADRs and plans stay in each repo's `docs/adr/` and `docs/plan/`. A PR that implements a plan can still update the plan and its ADR, in the same review.

**Not in scope:**
- Privacy. The repos are public, so their ADRs and plans stay readable on github.com. This plan separates audiences; it doesn't restrict access.
- Folders other than `adr/` and `plan/` (racing-drone's `arch/`, `assessments/`, `requirements/`). Each repo's entry names the folders it publishes, so one can be added later in one line.

## The repos

`sources.yaml` lists the repos the site collects from, and the folders it takes from each:

```yaml
repos:
  - { name: architecture,  folders: [adr, plan] }   # this repo's own records
  - { name: cortex,        folders: [adr, plan] }
  - { name: synapse,       folders: [adr, plan] }
  - { name: reflex,        folders: [adr, plan] }
  - { name: anatomy,       folders: [adr, plan] }
  - { name: racing-drone,  folders: [adr, plan] }
  - { name: scout-drone,   folders: [adr, plan] }
  - { name: isr-drone,     folders: [adr, plan] }
  - { name: nano-drone,    folders: [adr, plan] }
  - { name: interceptor-drone, folders: [adr, plan] }
  - { name: counter-uas,   folders: [adr, plan] }
```

A repo with no such folder yet contributes nothing until it has one.

## The status of a record

**Plans** carry YAML front matter. GitHub shows it as a table at the top of the file.

```yaml
---
status: in-progress        # draft | ready | in-progress | complete
issue: branes-ai/anatomy#10
---
```

| Status | Meaning |
|---|---|
| `draft` | written; not yet approved |
| `ready` | approved; no work merged yet |
| `in-progress` | at least one PR merged; more to come |
| `complete` | all of it merged |

- **`status`** is required. **`issue`** is optional, for the plans that have one.
- **The last update** is not typed in. The site takes it from the file's last commit date.
- **The prose `Status:` line goes.** The front matter holds the state. A plan's narrative of its PRs (for example "2a (#11), 2b (#13), 2c (racing-drone#72)") stays in the body, without the word "Status".

**ADRs** keep the block they already share:

```markdown
**Status:** Accepted
**Date:** 2026-10-28
```

Their statuses are those of cortex's template: `Proposed`, `Accepted`, `Superseded by NNNN`, `Deprecated`. An amendment note may follow the status in parentheses, as in cortex's ADR 0011. The site reads the block as it is, so the ADRs don't change.

## The site

A Starlight site, as in the other repos. Its build script, `scripts/collect.mjs`:

1. **Fetches.** For each repo in `sources.yaml`, a blobless clone of its default branch: no file contents beyond what it reads, but full history, for the commit dates.
2. **Reads and checks.** For each `.md` file under the listed folders:
   - it has a `# ` title;
   - it is a plan with valid front matter, or an ADR with a valid status block;
   - every relative link and anchor resolves. This is the same check as `sync-docs.mjs`.

   A failed check fails the build and names the file and line.
3. **Writes the pages:** `/<repo>/adr/<name>/` and `/<repo>/plan/<name>/`, with a status badge, the date, the issue link, and an "edit on GitHub" link.
4. **Rewrites the links:**
   - **to another record of any repo:** that record's page here, whether the link is relative or an absolute `github.com/branes-ai/<repo>/blob/main/docs/{adr,plan}/...` URL;
   - **to any other file:** the file on GitHub, at the commit the site was built from.
5. **Generates the indexes:**
   - **Plans:** every plan in the stack, grouped by status (in progress, ready, draft, complete), with its repo, issue and last update.
   - **Decisions:** every ADR, by repo, with its number, title, status and date.
   - **One page per repo:** its ADRs and plans.
6. **Writes the sidebar:** Plans, Decisions, then one group per repo.

**Publishing** (`.github/workflows/deploy.yml`):
- every hour, so a merged change in any repo is online within the hour;
- on a push to this repo;
- by hand (`workflow_dispatch`).

The sources are public, so no token is needed. A webhook from each repo for instant updates would need a token stored in every repo; it can be added later if an hour turns out to be too slow.

## The check in each repo

A composite action, `actions/check-records`, runs the same checks as step 2 on one repo's records (`scripts/check-records.mjs`). Each repo calls it from its CI, pinned to a commit of this repo:

```yaml
records:
  runs-on: ubuntu-24.04
  steps:
    - uses: actions/checkout@<sha>
    - uses: branes-ai/architecture/actions/check-records@<sha>
```

So a plan with no status, or with a broken link, fails the PR that adds it, not the hourly build. The failures are annotations on the file and line. Links to another repo's records are checked by the site's build only, since the action sees one repo.

## The user sites

In anatomy, racing-drone and cortex (reflex and synapse have no ADRs or plans):
- **`sync-docs.mjs`** skips `docs/adr/` and `docs/plan/`.
- **A link from a user document to a skipped record** points to its page on the architecture site. The route follows from the file's path, so the user site can compute it, and the source file must exist as before.
- **The documentation map** (`docs/README.md`) and the sidebar link to the architecture site, in place of the two groups.

## Status of today's plans

| Plan | Proposed | Evidence |
|---|---|---|
| anatomy generalize-core | complete | v0.2.0, racing-drone#70 |
| anatomy move-from-racing-drone | complete | racing-drone#65 closed. The prose still says "in progress" |
| anatomy split-libraries | complete | 2a #11, 2b #13, 2c racing-drone#72. This also closes anatomy#10 |
| racing-drone b0, sitl, reference-log, time-base, precision-sweep, gate-error-by-gate | complete | each says implemented, with its PR |
| racing-drone docs-site, drone-racing-history, framework-split, consume-anatomy | complete | issues #48, #50, #58 and #65 closed |
| racing-drone docs-site-landing | complete | #52 closed. The prose still says "in progress" |
| racing-drone implementation-plan | in-progress | phases 0 and 1 are closed; epics 9–15 are open. The prose says Draft |
| racing-drone test-plan | in-progress | in use since phase 0. The prose says Draft |
| cortex bootstrap-plan | complete | cortex has been built from it since May (confirmed). The prose still says "DRAFT — awaiting review" |

## The PRs

| PR | Repo | Content |
|---|---|---|
| **A** | architecture | <ul><li>`sources.yaml`, `scripts/collect.mjs`, the site and the deploy workflow</li><li>the `check-records` action</li><li>this plan, as `docs/plan/records-site/README.md`, with its own front matter</li><li>a README</li></ul> While the plans have no front matter yet, a missing status shows as **unknown** on the indexes, with a build warning instead of an error. |
| **B1–B3** | anatomy, racing-drone, cortex | <ul><li>front matter on each plan, with the statuses above</li><li>the user site skips the records</li><li>CI calls the `check-records` action</li></ul> The anatomy PR also closes anatomy#10. |
| **C** | architecture | Strict mode: a missing status is an error. Both workflows run `collect.mjs --strict`. |

## Departures from the approved plan

1. **The per-repo check is a composite action, not a reusable workflow.** A reusable workflow cannot name the commit of its own repo it was called at, so it could not load its scripts at that commit. A composite action is checked out at the commit the caller pins, so the checks a repo runs are the checks it pinned.

## Acceptance (stated before any test is run)

1. The site lists every `.md` file under `docs/adr/` and `docs/plan/` of every repo in `sources.yaml`, at its default branch's head. That is 25 ADRs and 17 plans today, checked against a `find` of the clones. A folder's own `README.md` (`docs/adr/README.md`) is its repo's introduction to the folder, not a record. `template.md` is skipped.
2. Each plan's status on the site is its front matter's; each ADR's is its status block's.
3. The build fails, naming the file and line, on:
   - a plan with no status or an invalid one;
   - an ADR with no status block;
   - a relative link or anchor that doesn't resolve.

   One deliberately broken fixture checks each case.
4. After B1–B3, the user sites of anatomy, racing-drone and cortex have no ADR or plan pages, and every link to one reaches the architecture site.
5. After C, no record shows unknown.
6. CI is green, and commitlint is clean.

## Results

- **After B1–B3:** the strict check in anatomy, racing-drone and cortex has 0 errors; the user sites have no ADR or plan pages, and their old record URLs redirect to the architecture site (anatomy, racing-drone; cortex's site never published them).
- **After C:** `collect.mjs --strict` over the 11 repos: 46 pages (43 records), 0 warnings. No record shows unknown.

## Risks

- **One repo's mistake breaks the hourly build.** The `check-records` action catches it on the PR first. If one gets through, the failed build keeps the last good site online.
- **Two link rewriters,** this one and each repo's `sync-docs.mjs`. They share the route rule (path → route), which is written once, in this repo, and pinned by tests.
- **New repos:** a repo added to the stack is missing from the site until it is added to `sources.yaml`.
