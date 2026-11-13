# AGENTS.md

## Project

GreenRoots Farm — farm-to-customer commerce monorepo (Bun workspaces, TypeScript).

- Runtime/package manager: Bun 1.4
- Backend: `apps/api` (PostgreSQL 18 + Redis 8 via Docker Compose)
- Storefront: `apps/storefront`
- Backoffice: `apps/backoffice`
- Shared contracts: `packages/shared`

## Repository Layout

| Path              | Purpose                                                       |
| ----------------- | ------------------------------------------------------------- |
| `apps/api`        | REST API, domain services, persistence, integrations          |
| `apps/storefront` | Customer-facing storefront                                    |
| `apps/backoffice` | Farm operations and admin console                             |
| `packages/shared` | Enums, business constants, JSONB contracts shared across apps |
| `scripts/`        | Release, version sync, and GitHub Actions pinning scripts     |
| `docs/standards`  | Engineering standards (SSOT)                                  |
| `docs/adr`        | Repo-wide architecture decisions                              |
| `GLOSSARY-MAP.md` | Entry point for context glossaries and ADRs                   |

## Commands

| Command                  | Purpose                          |
| ------------------------ | -------------------------------- |
| `bun install`            | Install workspace dependencies   |
| `bun run docker:up`      | Start PostgreSQL + Redis         |
| `bun run docker:down`    | Stop PostgreSQL + Redis          |
| `bun run dev:api`        | Run API in watch mode            |
| `bun run dev:storefront` | Run storefront                   |
| `bun run dev:backoffice` | Run backoffice                   |
| `bun run check`          | Type-check + lint all workspaces |
| `bun run test`           | Run shared + API tests           |
| `bun run format`         | Format with oxfmt                |

## Release

- `bun run version:check` — verify every workspace manifest matches the root version.
- `bun run release` — infer the next version, generate notes, update `CHANGELOG.md`, and open a release PR.
- `bun run release --dry-run` — print the release plan without changing anything.
- `bun run actions:pin` — resolve and pin GitHub Actions to immutable commit SHAs.
- Pushing a `v*` tag, or merging a `chore(release): vX.Y.Z` commit to `main`, runs `.github/workflows/release.yml`.

## Issue Tracking

Issues and specifications live in **GitHub Issues** (`ngxccc/greenroots-farm`). Use the `gh` CLI. See `docs/standards/issue-tracker.md`.

Pull requests use `.github/PULL_REQUEST_TEMPLATE.md`. GitHub automation lives in `.github/workflows/`:

- `.github/workflows/ci.yml` — the pull request quality gate: version consistency, shared/tooling, API, database, and an aggregate `Quality Gate` check.
- `.github/workflows/labels.yml` + `.github/labeler.yml` — `area:*` labels from changed paths and one `type:*` label from the PR title.
- `.github/release.yml` + `.github/workflows/release.yml` — GitHub Releases on `v*` tags and `chore(release):` merges.
- `.github/workflows/security.yml` — Trivy, `bun audit`, and CodeQL scans on pull requests, `main`, and a weekly schedule.
- `.github/dependabot.yml` — grouped weekly dependency updates (Bun ecosystem; security-update PRs are not supported for Bun, so `bun audit` covers that gap).
- `.github/actions/setup-environment/action.yml` — shared environment bootstrap: runtime, install cache, optional dependency install (`install`), optional Doppler CLI and `DOPPLER_TOKEN` export (`doppler`, `doppler-token`).
- `.husky/pre-commit` — `check-types` (once `apps/api` exists) plus `lint-staged` on staged files.

## Engineering Standards

MUST read the corresponding standard file under `docs/standards/` before modifying related code or tests:

- **Issue tracking & tickets** → `docs/standards/issue-tracker.md`
- **Domain glossary & ADRs** → `docs/standards/domain-docs.md`
- **Comments & docstrings** → `docs/standards/code-comment-taxonomy.md`
- **Routes, DTOs, and error responses** → `docs/standards/api-design-and-error-handling.md`
- **Schemas, queries, and migrations** → `docs/standards/database-and-migrations.md`
- **Locks, race conditions, and transactions** → `docs/standards/concurrency-and-locking.md`
- **Tests, factories, and fixtures** → `docs/standards/testing-and-fixtures.md`
- **Auth, hashing, and sanitization** → `docs/standards/security-and-cryptography.md`
- **Branches, commits, and PRs** → `docs/standards/git-flow-and-pr-matrix.md`
- **CI, release, and automation** → `docs/standards/ci-and-release.md`

## Conventions

- Code, comments, commit messages, and engineering docs are written in English. Vietnamese is reserved for user-facing copy.
- Use `@greenroots/shared` as the SSOT for enums, business constants, and JSONB contracts. Do not duplicate these values in app code.
- Secrets come from Doppler, not from committed files. Run local commands as `doppler run -- <command>` and see `docs/standards/security-and-cryptography.md`.
