# Issue Tracker

Issues and specifications for this repository are managed via **GitHub Issues** in `ngxccc/greenroots-farm`. Use the official `gh` CLI for all operations.

## CLI Command Conventions

| Operation        | Command                                       | Notes                                          |
| :--------------- | :-------------------------------------------- | :--------------------------------------------- |
| **Create Issue** | `gh issue create --title "..." --body "..."`  | Use heredocs for structured markdown bodies.   |
| **View Issue**   | `gh issue view <number> --comments`           | Reads issue description, labels, and comments. |
| **List Issues**  | `gh issue list --state open --label "<name>"` | Filter open tickets by status, type, or area.  |
| **Comment**      | `gh issue comment <number> --body "..."`      | Post updates or link PRs.                      |
| **Apply Labels** | `gh issue edit <number> --add-label "<name>"` | Update status or metadata labels.              |
| **Close Issue**  | `gh issue close <number> --comment "..."`     | Close ticket with resolution summary.          |

## Repository Label Taxonomy

### A. Status & Lifecycle

Issue lifecycle is automated natively via Pull Requests (`Fixes #<id>`) and GitHub Projects. Retain only actionable exception labels:

- `status:blocked` — Blocked on an external dependency, credential, or upstream issue.
- `needs-split` — Deferred bundle that still contains more than one concern. It MUST be split before implementation; see [Issue Atomicity & Backlog Splitting](#issue-atomicity--backlog-splitting).
- `wontfix` — Explicitly closed as out of scope, superseded, or rejected.

### B. Type Labels (Conventional Commits Alignment)

- `type:epic` — Container issue that tracks native sub-issues. Epics carry no implementation acceptance criteria of their own.
- `type:feat` — New feature or capability.
- `type:fix` — Bug fix or patch.
- `type:bug` — Defect report.
- `type:refactor` — Code refactoring without behavior change.
- `type:perf` — Performance optimization.
- `type:test` — Adding or updating test suites.
- `type:docs` — Documentation only.
- `type:chore` — Tooling, dependencies, or maintenance.
- `type:ci` — CI/CD workflow updates.
- `type:style` — Formatting or cosmetic changes.
- `type:task` — Vertical slice or implementation sub-task.

### C. Area Labels (Monorepo Workspaces)

- `area:api` — NestJS backend (`apps/api`), Drizzle schemas, migrations, and domain modules.
- `area:storefront` — Next.js customer storefront (`apps/storefront`).
- `area:backoffice` — React + Vite internal operations console (`apps/backoffice`).
- `area:shared` — Shared enums, business constants, Haversine, JSONB contracts, and shared labels (`packages/shared`).
- `area:ui` — Shared Shadcn Base UI primitives and Organic Minimalism tokens (`packages/ui`).
- `area:ci` — CI/CD workflows, Husky hooks, root tooling configs, and scripts.
- `area:docs` — Documentation, ADRs, glossaries, and standards.

### D. Priority & Automation Labels

- `priority:p0` — Critical blocker (emergency / system down).
- `priority:p1` — High priority (blocks release milestone).
- `priority:p2` — Normal priority (default).
- `dependencies` — Automated dependency bump PRs (Dependabot).
- `github_actions` — Automated GitHub Actions update PRs (Dependabot).
- `security` — Security fix or vulnerability alert (grouped in release notes).

## Issue Body Contract

Every issue body uses the same four H3 headings, in this order:

```markdown
### Outcome

One verifiable result, stated in domain language.

### Context

Links to the epic, related issues, ADRs, standards, and the specific files or symbols involved.

### Acceptance Criteria

- [ ] Observable, testable statement. Include the command that proves it when one exists.
- [ ] Generated contracts are committed when the route or DTO surface changes.

### Non-goals

Explicit boundaries that keep the issue from absorbing sibling work.
```

An issue that cannot name a single verifiable outcome is not ready; split it first.

## Issue Atomicity & Backlog Splitting

An issue is **atomic** when it has exactly one outcome, one trust boundary, one transaction or contract, and one reviewer can verify it without reading a second issue's diff. An issue is a **bundle** when any of these is true:

- It mutates and reads different resources with independent migrations or RBAC rules.
- It mixes a financial or auth mutation with a read-only projection.
- It spans more than one role matrix or more than one aggregate.
- Its acceptance criteria cannot all fail or pass together.

### When to split

| Situation                               | Action                                                              |
| :-------------------------------------- | :------------------------------------------------------------------ |
| Bundle is in the current milestone      | Split now. Close the parent as `not planned` and link the children. |
| Bundle is deferred to a later milestone | Apply `needs-split` and add it to the split register below.         |
| Issue is already atomic                 | Leave it alone. Do not split for symmetry.                          |

Never split a deferred bundle whose downstream feature does not exist yet. Acceptance criteria for code that is not designed become speculative; record the bundle and split it when its milestone opens.

### Split procedure

1. Create one child per atomic outcome with the [Issue Body Contract](#issue-body-contract) and a `type:*`, `area:*`, and `priority:*` label. Child titles follow `<type>(<area>): <summary>`.
2. Attach each child to its existing epic with the [GitHub Native Sub-Issues Protocol](#github-native-sub-issues-protocol). Do not create a second epic layer.
3. Close the parent with `--reason "not planned"` and a comment that lists the children and names the decision that justified the split.
4. Remove `needs-split` from anything that was split, and tick it off in the split register.

### Split register (memory, not recall)

The single source of truth for deferred splits is the open issue labelled `needs-split`, grouped by its tracking issue. Query it at the start of every planning session and before starting any `needs-split` ticket:

```bash
gh issue list --state open --label needs-split --limit 100 \
  --json number,title --jq '.[] | "#\(.number) \(.title)"'
```

Rules that keep the register honest:

- The tracking issue is the only place that lists deferred batches. Do not duplicate the list in ADRs, standards, or chat.
- A `needs-split` issue is not ready work. A pull request that resolves one MUST split it first and resolve the children instead.
- When a milestone opens, drain its `needs-split` issues before starting neighbouring implementation work.
- The tracking issue closes only when the register is empty.

The register maintains itself:

- The `backlog-split` job in `.github/workflows/ci.yml` fails any pull request that closes a `needs-split` issue, so an unsplit bundle cannot merge through the required `Quality Gate`.
- `.github/workflows/backlog-digest.yml` rewrites one sticky comment on the tracking issue every Monday with the current list, so the plan never depends on anyone remembering to look.
- Closing a split parent removes it from the digest automatically; no manual bookkeeping is required beyond removing the label.

### Choosing the next split

Apply these rules in order; the first match wins, so the decision never depends on memory.

1. **The bundle in front of you.** If you are about to implement an issue labelled `needs-split`, split that one now. Its context is loaded and its children's acceptance criteria are cheapest to write.
2. **The open milestone.** Otherwise pick the lowest-numbered `needs-split` issue inside the epic whose milestone is currently open.
3. **The batch order.** Otherwise follow the batch checklist in the tracking issue.
4. **Nothing applies.** Leave the register alone. Splitting a bundle whose feature is not designed produces speculative criteria.

## Epic Convention

- Epic titles keep the human form `epic(<area>): <summary>` and carry `type:epic`; they are containers, not commits, so they do not use a Conventional Commits body.
- Every implementation issue belongs to exactly one epic through native sub-issues.
- An epic closes when all of its sub-issues are closed.
- Split parents that are replaced by children are closed as `not planned`; the epic stays open and owns the children.

## Triage Label Vocabulary

The `triage` skill is not installed in this workspace. If it is added later, use this mapping; until then these labels are the canonical vocabulary for manual triage.

| Canonical triage role | Mapped repo label                          |
| :-------------------- | :----------------------------------------- |
| `needs-triage`        | Default open issue (no extra label needed) |
| `needs-info`          | `status:blocked`                           |
| `ready-for-agent`     | `type:*` + `area:*`                        |
| `ready-for-human`     | `priority:p0` / `priority:p1`              |
| `wontfix`             | `wontfix`                                  |

## Issue Forms

`.github/ISSUE_TEMPLATE/` provides:

- `feature_request.yml` — New feature, architectural change, or RFC.
- `bug_report.yml` — Reproducible defect.
- `task.yml` — Task, chore, refactor, docs, or dependency work.
- `config.yml` — Free-form issues disabled; contact links point to standards and the glossary.

All templates require an `area:*` selection. The bug template applies `type:fix`; the feature template applies `type:feat`; the task template applies `type:task` and lets the author pick the precise work type.

## Repository Automation

| File                                           | Purpose                                                                                 |
| :--------------------------------------------- | :-------------------------------------------------------------------------------------- |
| `.github/PULL_REQUEST_TEMPLATE.md`             | 5-section PR body, verification evidence, standards checklist.                          |
| `.github/workflows/backlog-digest.yml`         | Weekly sticky comment that lists every open `needs-split` issue on the tracking issue.  |
| `.github/dependabot.yml`                       | Weekly grouped updates for the Bun workspace, GitHub Actions, and Docker images.        |
| `.github/actions/setup-environment/action.yml` | Bun + cache + deps, with the Doppler CLI behind the `doppler` input.                    |
| `.github/labeler.yml`                          | Declares `area:*` labels from changed file paths.                                       |
| `.github/workflows/ci.yml`                     | Pull request quality gate; includes the `backlog-split` guard and `CI / Quality Gate`.  |
| `.github/workflows/labels.yml`                 | Applies `area:*` labels and keeps exactly one `type:*` label in sync with the PR title. |
| `.github/workflows/release.yml`                | Creates a GitHub Release on `v*` tags, using `.github/release.yml` categories.          |
| `.github/workflows/security.yml`               | Weekly/manual Trivy + CodeQL (SARIF) and `bun audit` dependency checks.                 |
| `.github/release.yml`                          | Groups release notes by `type:*` labels.                                                |

Labels used by automation MUST exist in the repository. Create them with `gh label create` before enabling the workflows.

## GitHub Native Sub-Issues Protocol

When splitting an Epic or parent feature into child tasks, link them natively using the GitHub Issues REST API:

1. **Create the child ticket:**

   ```bash
   gh issue create --title "<type>(<area>): <title>" --body "..." --label "<labels>"
   ```

2. **Get the child database ID and link it to the parent:**

   ```bash
   CHILD_ID=$(gh api repos/ngxccc/greenroots-farm/issues/<child_number> --jq .id)
   gh api --method POST repos/ngxccc/greenroots-farm/issues/<parent_number>/sub_issues -F sub_issue_id=$CHILD_ID
   ```

3. **Query native sub-issues:**

   ```bash
   gh api repos/ngxccc/greenroots-farm/issues/<parent_number>/sub_issues --jq '.[] | "#\(.number): \(.title)"'
   ```

## Dependency Blocking

Use GitHub native issue dependencies. A ticket is unblocked when all blocker issues are closed.

```bash
gh api --method POST repos/ngxccc/greenroots-farm/issues/<child_number>/dependencies/blocked_by -F issue_id=<blocker_database_id>
```
