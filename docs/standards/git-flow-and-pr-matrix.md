# Git Flow & Pull Request Standards

## 1. Branches

Branch from `main` and keep the branch short-lived and focused on one logical change. Rebase on `main` before opening a pull request when the branch has fallen behind.

`feature/<name>`, `fix/<name>`, `hotfix/<name>` (production patch), `core/<name>` (architecture or schema refactor, Tier 3), `chore/<name>`, `docs/<name>`. Names are kebab-case.

## 2. Commits

`<type>(<scope>): <summary>`, header ≤ 72 characters, imperative mood (`add`, `fix`, `remove`).

- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `ci`, `style`.
- Scopes: `api`, `storefront`, `backoffice`, `shared`, `infra` (Docker, CI, repo tooling), `docs`.
- Bodies use short bullet points, not paragraphs.
- Close an issue with `Fixes #<id>`.

The pre-commit hook (`bun run check-types` plus `oxfmt` and `oxlint --type-aware --fix` on staged files) must pass. Fix the reported file and re-stage instead of committing a partially formatted tree.

## 3. PR Tiers

| Tier   | Scope                                                | Requirements                                        |
| :----- | :--------------------------------------------------- | :-------------------------------------------------- |
| Tier 1 | Typos, minor docs, dependency bumps.                 | Single-sentence summary.                            |
| Tier 2 | Feature, bug fix, refactor.                          | Conventional commits, full PR body, passing tests.  |
| Tier 3 | Core architecture, database schema, breaking change. | Atomic commits, ADR/RFC link, human audit evidence. |

The PR body follows `.github/PULL_REQUEST_TEMPLATE.md`. Whatever the tier, it states what changed and why, links the issue (`Fixes #<id>` or `Part of #<id>`), lists the commands run with their results, and names the blast radius and rollback path.

## 4. Human Audit

1. Inspect `git status` and `git diff`, propose an atomic commit slicing plan, and show the formatted messages before committing.
2. Do not run `git commit` until the human approves explicitly.
3. Do not use `--no-verify` unless the human approves and the reason is recorded.
4. One logical change per commit: never mix refactoring, formatting, and behavior changes.
5. Sequence multi-step sweeps or migrations into small verifiable units that each end in a passing check before starting the next.
6. Tier 3 changes carry their ADR/RFC link and audit evidence before merge.
