## Summary

<!-- Concise explanation of what this PR changes and the technical rationale -->

## Context

- Resolves: # <!-- If closing an issue, e.g. Resolves: #123 -->
- Relates to: # <!-- If referencing an issue without closing -->
- None <!-- If standalone change -->

## Type

- [ ] feat: New feature
- [ ] fix: Bug fix
- [ ] refactor: Code refactoring
- [ ] perf: Performance improvement
- [ ] test: Testing updates
- [ ] docs: Documentation update
- [ ] ci: CI/CD or workflow update
- [ ] chore: Maintenance or dependencies

## Verification & Evidence

- **App(s) affected**:
  - [ ] API (`apps/api`)
  - [ ] Storefront (`apps/storefront`)
  - [ ] Backoffice (`apps/backoffice`)
  - [ ] Shared (`packages/shared`)
- **Commands run**:
  - [ ] `bun run check`
  - [ ] `bun run test`
  - [ ] `bun run format:check`
- **Database / migration**:
  - [ ] No schema change
  - [ ] Migration included and backward-compatible (expand/contract)
- **Evidence**:
  - Output / screenshots / test logs: <!-- Attach screenshots for UI changes, or paste test output -->

## Checklist

- [ ] Tests pass locally.
- [ ] No `.env` files, secrets, PayOS keys, customer PII, or generated artifacts are committed.
- [ ] I read the relevant standards under `docs/standards/` before changing related code or tests.
- [ ] New behavior has tests; bug fixes include a regression test.
- [ ] Documentation, glossary, or ADR updated when introducing new domain terms or decisions.
- [ ] No unrelated formatting or refactoring changes.
