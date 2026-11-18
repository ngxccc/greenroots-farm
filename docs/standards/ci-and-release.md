# CI, Release & Automation Standards

## 1. Workflow Ownership

Each workflow owns exactly one responsibility. A check runs in one workflow and nowhere else; other workflows consume its result instead of repeating the commands.

| File                             | Owns                                                         | Trigger                                           |
| :------------------------------- | :----------------------------------------------------------- | :------------------------------------------------ |
| `.github/workflows/ci.yml`       | Version consistency, shared/tooling, API, database gates.    | `pull_request` to `main`, `workflow_dispatch`.    |
| `.github/workflows/security.yml` | Trivy, `bun audit`, and CodeQL scans.                        | `pull_request`, `push` to `main`, weekly cron.    |
| `.github/workflows/release.yml`  | Version check, tag detection, and GitHub Release publishing. | `push` to `main`, `v*` tags, `workflow_dispatch`. |
| `.github/workflows/labels.yml`   | `area:*` and `type:*` labels on pull requests.               | `pull_request_target`.                            |

- Do not add a workflow that re-runs commands already owned by `ci.yml`. Call the existing job or rely on the branch protection check instead.
- A reusable `workflow_call` file is only justified with two or more callers. With a single caller, inline the jobs.
- Keep `name:` short and stable. Renaming a workflow renames every status check and breaks branch protection.

## 2. CI Pipeline

`ci.yml` runs on every pull request to `main` and can be dispatched manually. It is the only place that runs the quality commands.

| Job                   | Commands                                                                                                                           |
| :-------------------- | :--------------------------------------------------------------------------------------------------------------------------------- |
| `version-consistency` | `bun run version:check`                                                                                                            |
| `shared-package`      | `bun run format:check`, `bunx syncpack lint`, `bun run check-types:shared`, `bun run check-types:scripts`, shared and script tests |
| `api`                 | `bun run check-types:api`, `bun run lint:api`, `bun run test:api`, `bun run build` in `apps/api`                                   |
| `database`            | `bun run db:migrate`, `db:generate` drift check, `db:seed --clean` against PostgreSQL 18 + Redis 8 services                        |
| `quality-gate`        | Aggregates the four jobs above; fails unless every dependency succeeded                                                            |

- CI does not run on `push` to `main`. `main` only moves through pull requests that already passed the required checks.
- Do not add `paths-ignore` or `paths` filters to required workflows. A skipped workflow never reports a status, so the required check stays pending and blocks the pull request forever.
- `quality-gate` uses `if: always()` so it still reports when an upstream job fails. It is the single pass/fail signal consumers should observe.

## 3. Required Checks & Branch Protection

Branch protection is repository configuration, not YAML. Enable it in **Settings → Branches → Branch protection rules** for `main`:

1. Turn on **Require a pull request before merging**.
2. Turn on **Require status checks to pass before merging**.
3. Add these required checks:
   - `CI / Quality Gate`
   - `Security Scan / Trivy`
   - `Security Scan / Bun Audit`
   - `Security Scan / CodeQL (javascript-typescript)`
   - `Security Scan / CodeQL (actions)`
4. Turn on **Require branches to be up to date before merging**.
5. Turn on **Require conversation resolution before merging**.
6. Leave **Allow force pushes** and **Allow deletions** disabled.

- Only `CI / Quality Gate` is the quality signal. The per-job checks (`CI / API`, `CI / Migrations and Seed`, and so on) exist for debugging and must not be added as separate required checks.
- Workflow renames invalidate required checks. When a workflow name changes, update branch protection in the same change window.
- Branch protection requires repository admin rights; the change cannot be shipped through a pull request.

## 4. Release Flow

1. `bun run release` bumps manifests, updates `CHANGELOG.md`, and opens a `chore(release): vX.Y.Z` pull request.
2. Merging that pull request to `main` triggers `release.yml`, which detects the release commit, creates and pushes the `vX.Y.Z` tag, and publishes the GitHub Release.
3. Pushing a `v*` tag directly, or dispatching the workflow with `tag_name`, produces the same result.

- The release workflow verifies `version:check` and publishes. It does not re-run type checks, lint, tests, formatting, or builds; those already ran in `ci.yml` before merge.
- Release notes categories come from `.github/release.yml` and `type:*` labels.
- `release.yml` never deletes or rewrites an existing release or tag. Re-running it is a no-op when the release already exists.

## 5. Deploy Pipeline Policy

- There is no deploy workflow until a real target (Render, Docker registry, Kubernetes) with its secrets and environment exists.
- When a deploy target lands, add `api.yml` with `push` to `main`, a `Production` environment, and the deploy steps. Do not add it as a placeholder that only repeats the quality gate.
- Database migrations run as an explicit deploy step, never as a hidden side effect of application startup.

## 6. Local Equivalents

Run the same commands locally before opening a pull request:

```bash
bun run version:check
bun run format:check
bunx syncpack lint
bun run check-types
bun run lint:api
bun run test
bun run --cwd apps/api build
bun run docker:up
bun run --cwd apps/api db:migrate
bun run --cwd apps/api db:seed --clean
```

- `bun run check` covers type checks and lint across existing workspaces.
- Database commands need PostgreSQL and Redis from `docker compose`.
- Never bypass the pre-commit hook with `--no-verify`.
