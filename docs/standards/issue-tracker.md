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
- `wontfix` — Explicitly closed as out of scope, superseded, or rejected.

### B. Type Labels (Conventional Commits Alignment)

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
| `.github/dependabot.yml`                       | Weekly grouped updates for the Bun workspace, GitHub Actions, and Docker images.        |
| `.github/actions/setup-environment/action.yml` | Bun + cache + deps, with the Doppler CLI behind the `doppler` input.                    |
| `.github/labeler.yml`                          | Declares `area:*` labels from changed file paths.                                       |
| `.github/workflows/ci.yml`                     | Pull request quality gate; `CI / Quality Gate` is the required check.                   |
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
