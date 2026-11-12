# Git Flow & Pull Request Standards

## 1. Branch Naming Conventions

- `feature/<kebab-case-name>` — New feature.
- `fix/<kebab-case-name>` — Bug fix.
- `hotfix/<kebab-case-name>` — Production patch.
- `core/<kebab-case-name>` — Major architecture or database schema refactor (Tier 3).
- `chore/<kebab-case-name>` — Tooling, dependencies, or maintenance.
- `docs/<kebab-case-name>` — Documentation only.

- Branch from `main`. Keep branches short-lived and focused on one logical change.
- Rebase on `main` before opening a PR when the branch has fallen behind.

## 2. Conventional Commits Standard

**Format**: `<type>(<scope>): <summary>` — header length ≤ 72 characters.

**Types**: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `ci`, `style`.
**Scope**: lowercase module name.

| Scope        | Area                        |
| :----------- | :-------------------------- |
| `api`        | `apps/api`                  |
| `storefront` | `apps/storefront`           |
| `backoffice` | `apps/backoffice`           |
| `shared`     | `packages/shared`           |
| `infra`      | Docker, CI, repo tooling    |
| `docs`       | Documentation and standards |

- Use the imperative mood: `add`, `fix`, `remove`, not `added` or `fixes`.
- Commit bodies use concise bullet points (`- ...`), not long paragraphs.
- Reference tickets with `Fixes #<id>` when the commit closes an issue.

### Pre-Commit Hook

`.husky/pre-commit` runs on every commit and MUST NOT be bypassed with `--no-verify`:

1. `bun run check-types` — only when `apps/api` exists, because the API workspace is still being scaffolded.
2. `bunx lint-staged` — formats staged files with `oxfmt` and lints them with `oxlint --type-aware --fix`.

If the hook fails, fix the reported file and re-stage it; do not commit a partially formatted tree.

## 3. Adaptive 3-Tier PR Matrix

| Tier                    | Scope & Risk                                   | Requirements                                            |
| :---------------------- | :--------------------------------------------- | :------------------------------------------------------ |
| **Tier 1 (Patch)**      | Typos, minor docs, dependency bumps.           | Single-sentence PR summary.                             |
| **Tier 2 (Standard)**   | Feature, bug fix, refactor.                    | Conventional Commits, 5-section PR body, passing tests. |
| **Tier 3 (Enterprise)** | Core architecture, DB schema, breaking change. | Atomic commits, ADR/RFC link, human audit evidence.     |

**5-section PR body**:

1. **Summary** — what changed and why.
2. **Changes** — bullet list of the important edits.
3. **Testing** — commands run and results.
4. **Risk / Rollback** — blast radius and rollback path.
5. **Linked issues** — `Fixes #<id>` or `Part of #<id>`.

## 4. Human Audit & Verification Protocol

1. **Inspection & proposal only**: before committing, inspect `git status` and `git diff`, propose an atomic commit slicing plan, and display the formatted Conventional Commit messages. Commit bodies MUST use concise bullet points.
2. **Explicit confirmation required**: NEVER execute `git commit` until the human confirms with explicit approval.
3. **No hook bypass**: do not use `--no-verify` unless the human explicitly approves it and the reason is recorded.
4. **Atomic commits**: one logical change per commit. Do not mix refactoring, formatting, and behavior changes.
5. **Tier 3 changes**: attach ADR/RFC links and human audit evidence to the PR before merge.

## 5. PR Checklist

- [ ] Branch name follows the convention.
- [ ] Commit messages follow Conventional Commits and are ≤ 72 characters.
- [ ] Tests pass locally (`bun run test`, `bun run check`).
- [ ] New behavior has tests; bug fixes have regression tests.
- [ ] Standards under `docs/standards/` were read and followed.
- [ ] No secrets, generated artifacts, or unrelated formatting changes.
- [ ] PR body includes Summary, Changes, Testing, Risk/Rollback, and Linked issues.
