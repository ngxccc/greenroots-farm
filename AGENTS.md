# AGENTS.md

## Project

GreenRoots Farm — farm-to-customer commerce monorepo (Bun workspaces, TypeScript).

- Runtime/package manager: Bun 1.4
- Backend: `apps/api` (PostgreSQL 18 + Redis 8 via Docker Compose)
- Storefront: `apps/storefront` (Next.js 16 + Tailwind CSS v4)
- Backoffice: `apps/backoffice` (React 19 + Vite SPA + TanStack Suite)
- Shared contracts: `packages/shared`
- Shared UI: `packages/ui` (Shadcn Base UI + Tailwind tokens)

## Repository Layout

| Path               | Purpose                                                     |
| ------------------ | ----------------------------------------------------------- |
| `apps/api`         | REST API, domain services, persistence, integrations        |
| `apps/api/drizzle` | Forward-only Drizzle PostgreSQL migrations and snapshots    |
| `apps/storefront`  | Customer-facing storefront                                  |
| `apps/backoffice`  | Farm operations and admin console                           |
| `packages/shared`  | Enums, business constants, Haversine, JSONB, shared labels  |
| `packages/ui`      | Shared Shadcn Base UI primitives and Organic Minimalism CSS |
| `scripts/`         | Release, version sync, and GitHub Actions pinning scripts   |
| `docs/standards`   | Engineering standards (SSOT)                                |
| `docs/adr`         | Repo-wide architecture decisions                            |
| `GLOSSARY-MAP.md`  | Entry point for context glossaries and ADRs                 |

## Commands & Release

Scripts live in root `package.json` (`bun run dev`, `check`, `test`, `test:e2e`, `types:sync`, `format`, `version:check`, `release`, `actions:pin`). Release and workflow rules live in `docs/standards/ci-and-release.md`.

## Issue Tracking

Issues and specifications live in **GitHub Issues** (`ngxccc/greenroots-farm`). Use the `gh` CLI. See `docs/standards/issue-tracker.md` and `.github/PULL_REQUEST_TEMPLATE.md`.

Every issue is atomic: one outcome, one trust boundary, one transaction or contract. Deferred bundles carry `needs-split` and are listed only in the split tracking issue. Query the register before planning or starting work on a bundle:

```bash
gh issue list --state open --label needs-split --limit 100 \
  --json number,title --jq '.[] | "#\(.number) \(.title)"'
```

## Engineering Standards

`docs/standards/` is the single source of truth, and reading the matching file is a gate before the first edit — not a suggestion. Do not reconstruct a rule from memory or from another repository.

| Change you are about to make               | Read first                                        |
| :----------------------------------------- | :------------------------------------------------ |
| A route, DTO, status code, or error shape  | `docs/standards/api-design-and-error-handling.md` |
| A UI page, component, token, or BFF call   | `docs/standards/ui-and-frontend.md`               |
| A schema, query, index, or migration       | `docs/standards/database-and-migrations.md`       |
| A lock, transaction, or retry              | `docs/standards/concurrency-and-locking.md`       |
| Auth, tokens, hashing, or sanitization     | `docs/standards/security-and-cryptography.md`     |
| A test, factory, or fixture                | `docs/standards/testing-and-fixtures.md`          |
| A comment or docstring                     | `docs/standards/code-comment-taxonomy.md`         |
| A branch, commit, or pull request          | `docs/standards/git-flow-and-pr-matrix.md`        |
| An issue, spec, or scope decision          | `docs/standards/issue-tracker.md`                 |
| A glossary term, domain model, or ADR      | `docs/standards/domain-docs.md`                   |
| A workflow, action, release, or label rule | `docs/standards/ci-and-release.md`                |
| Reviewing a branch, diff, or PR            | `docs/standards/code-review.md`                   |

Protocol for every implementation task:

1. Map the planned edits to the table and read every matching file before writing code, tests, docs, or commit messages.
2. Open the response that accompanies the first edit with one line naming the read set, for example `Standards read: api-design-and-error-handling.md, testing-and-fixtures.md`.
3. When the diff grows into another area, read that area's standard before continuing instead of at the end.
4. When the mapping is unclear, read every file in `docs/standards/` plus `GLOSSARY-MAP.md` rather than guessing.
5. When code and a standard disagree, surface the conflict before changing either one.

This file is loaded automatically at the start of every OpenCode session, and the `implement` skill runs this protocol as a workflow. Add durable reminders here instead of re-pasting them into each prompt.

## Conventions

- Code, comments, commit messages, and engineering docs are written in English. Vietnamese is reserved for user-facing copy.
- Use `@greenroots/shared` as the SSOT for enums, business constants, JSONB contracts, shared Vietnamese order/payment/delivery labels, and the RFC 9457 error dictionary. Reference `@greenroots/shared` directly (`BUSINESS_RULES.*`, enums, error codes); do not duplicate, re-export, or create local/renamed alias constants (`const X = BUSINESS_RULES.Y`, `export const X = ...`) for shared values in app code. Keep surface-specific labels (customer vs staff batch statuses) in each app.
- Manage shared dependency versions via root `package.json` `catalog:` (`react`, `react-dom`, `@types/react*`, `lucide-react`, `tailwindcss`, `zod`, `typescript`).
- Secrets come from Doppler, not from committed files. Run local commands as `doppler run -- <command>` and see `docs/standards/security-and-cryptography.md`.
