## Summary

<!-- Concise explanation of what this PR changes and why -->

## Context

- Resolves: # <!-- If closing an issue, e.g. Resolves: #123 -->
- Relates to: # <!-- If referencing an issue without closing -->
- None <!-- If standalone change -->

## Changes

- <!-- Key code, config, or contract changes introduced by this PR -->

## Evidence

- **Before:** <!-- Previous behavior, screenshot, or failing check -->
- **After:** <!-- Verified behavior, screenshot, or passing output -->
- **Commands run**:
  - `bun run check` / `bun run test` / `bun run format:check` <!-- Exact commands run -->
- **Database / migration**:
  - [ ] No schema change
  - [ ] Migration included and backward-compatible (expand/contract)
  - [ ] `bun run db:migrate` and `bun run db:seed --clean` verified locally
- **UI changes**:
  - [ ] No UI change (`N/A`)
  - [ ] Desktop & mobile screenshots attached below for all UI changes

## Risk

- **Door:** <!-- two-way door (low risk, cheap to roll back) | one-way door (high friction/irreversible) -->
- **Blast Radius:** <!-- Affected workspaces, modules, routes, or runtime services -->
- **Rollback:** <!-- Revert commit / down migration / feature flag -->

## Notes

- None <!-- Tradeoffs, preserved constraints, or follow-up items -->

## Checklist

- [ ] Tests pass locally.
- [ ] Any UI changes include desktop & mobile screenshots under `## Evidence` (or `No UI change` checked above).
- [ ] No `.env` files, secrets, PayOS keys, customer PII, or generated artifacts are committed.
- [ ] I read the relevant standards under `docs/standards/` before changing related code or tests.
- [ ] New behavior has tests; bug fixes include a regression test.
- [ ] Documentation, glossary, or ADR updated when introducing new domain terms or decisions.
- [ ] No unrelated formatting or refactoring changes.
- [ ] If this PR closes an issue labelled `needs-split`, I split it first, linked the children to the epic, and closed the parent as `not planned` instead of implementing the bundle.
