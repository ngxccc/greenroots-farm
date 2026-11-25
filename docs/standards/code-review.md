# Code Review Standards

Repo-specific overrides and structural invariants for `/code-review` (complements `.agents/skills/code-review/references/layered-risk-checklist.md`).

## Tool & Noise Boundaries

- **Exclude generated artifacts from primary diff**: `apps/api/openapi.json`, `**/api-schema.d.ts`, `**/snapshot.json`, `bun.lock`.
- **Skip tool-enforced checks**: leave formatting, lint rules, and static type errors to `oxfmt`, `oxlint`, and `tsc`.
- **Spot-check generated contracts**: inspect `apps/api/test/generated/api-schema.d.ts` directly (never read raw `openapi.json` line-by-line).

## Repo-Specific Overrides

- **Closed projections**: `.select()` and `.returning()` use explicit column objects (`PROFILE_COLUMNS`, `STAFF_USER_COLUMNS`) instead of full-row selects stripped in memory.
- **Shared SSOT**: enums, roles, error codes, and JSONB contracts come from `@greenroots/shared` without duplicate literals or local aliases; response DTO enums match actual output bounds (`STAFF_ROLES` vs `UserRole`).
- **Controller parity**: use module `<module>.routes.ts` constants, class-level `400`/`500` RFC 9457 decorators, and exact status decorators (`@HttpCode(HttpStatus.OK)` on `200` `POST`s, `403`/`404`/`409`/`422`/`429`).

## Design & Structural Invariants

- **Model the Domain & Type Discipline**: Encode stateful logic and repeated shape assumptions in explicit state machines, tables/registries, or discriminated/branded types so illegal states are unrepresentable; parse external data at boundaries and keep domain logic pure.
- **Minimize Reader Load & Subtract First**: Remove dead weight before adding abstractions, collapse one-caller wrappers, and shrink mutable scope.
- **Clean Cutover (Migrate & Delete in One Wave)**: When introducing a new internal API or target architecture, migrate all callers and delete legacy APIs or throwaway compatibility shims in the same wave.
