# Domain Docs

How engineering skills consume this repository's domain documentation.

## Read Before Exploring

1. `GLOSSARY-MAP.md` at the repo root — the entry point for every context glossary and ADR directory.
2. The `GLOSSARY.md` of every context you touch.
3. The ADRs that touch the area: `docs/adr/` and `<context>/docs/adr/`.

Missing files are not a problem: proceed silently, and do not propose creating them. The `/domain-modeling` skill creates them lazily when a term or decision is actually resolved.

| Scope            | Glossary                      | ADRs                        |
| :--------------- | :---------------------------- | :-------------------------- |
| Repo-wide        | `GLOSSARY-MAP.md`             | `docs/adr/`                 |
| Shared contracts | `packages/shared/GLOSSARY.md` | `packages/shared/docs/adr/` |
| API              | `apps/api/GLOSSARY.md`        | `apps/api/docs/adr/`        |
| Storefront       | `apps/storefront/GLOSSARY.md` | `apps/storefront/docs/adr/` |
| Backoffice       | `apps/backoffice/GLOSSARY.md` | `apps/backoffice/docs/adr/` |

ADR files are `000X-<kebab-name>.md`. Cross-context decisions live in `docs/adr/`; context-scoped decisions live in that context's `docs/adr/`.

## Ownership

1. `packages/shared/GLOSSARY.md` owns cross-app vocabulary: entities, enums, statuses, money and delivery rules.
2. `apps/api/GLOSSARY.md` is authoritative for backend behavior and invariants.
3. Storefront and backoffice may add surface terms but never redefine shared ones.
4. A conflict resolves toward the API glossary, recorded as an ADR.

## Vocabulary

Name a domain concept exactly as its glossary defines it, in issue titles, proposals, tests, and refactors. A concept the glossary lacks is a signal: either you are inventing language, or there is a gap worth `/domain-modeling`.

When output contradicts an ADR, say so instead of overriding silently:

> _Contradicts ADR-0004 (integer VND storage) — worth reopening because…_

## Invariants

Invariants are module-scoped: `AuthDomainInvariants: INV-1..4`, `OrdersDomainInvariants: INV-1..4`. An identifier is unique inside its module and shared by every endpoint in that domain.

Keep the three sites in sync:

1. **Spec** — `docs/design/<feature>-workflow.md` enumerates every `INV-N`.
2. **Service TSDoc** — exported methods document enforcement with `@invariant INV-N (<Name>): <details>`.
3. **Tests** — the matching `it()` carries a `// Invariant: INV-N` comment above it (not in the title; see `testing-and-fixtures.md`).

```ts
/**
 * Reserves stock for every line item in a checkout request.
 *
 * @invariant INV-1 (No Oversell): Locks batch rows and rejects if available stock is insufficient.
 * @invariant INV-2 (Money Precision): All totals are computed as integer VND.
 */
async checkout(command: CheckoutCommand): Promise<Order> {}
```
