# Glossary Map

Multi-context domain documentation. Read the glossary for every context you touch before naming domain concepts or changing behavior.

## Context Glossaries

| Context          | Glossary                      | ADRs                        | Status  |
| ---------------- | ----------------------------- | --------------------------- | ------- |
| Shared contracts | `packages/shared/GLOSSARY.md` | `packages/shared/docs/adr/` | Active  |
| API              | `apps/api/GLOSSARY.md`        | `apps/api/docs/adr/`        | Planned |
| Storefront       | `apps/storefront/GLOSSARY.md` | `apps/storefront/docs/adr/` | Planned |
| Backoffice       | `apps/backoffice/GLOSSARY.md` | `apps/backoffice/docs/adr/` | Planned |

## Repo-wide Decisions

- `docs/adr/` — cross-context decisions (runtime, persistence, integrations, deployment).

## Ownership Rules

1. `packages/shared/GLOSSARY.md` owns cross-app vocabulary: entities, enums, statuses, money and delivery rules.
2. `apps/api/GLOSSARY.md` is authoritative for backend domain behavior and invariants.
3. `apps/storefront/GLOSSARY.md` and `apps/backoffice/GLOSSARY.md` may add surface-specific terms but MUST NOT redefine shared terms.
4. If a term conflicts, the API glossary wins; record the resolution as an ADR.

## Status

Planned contexts get a glossary when their first domain feature lands. Do not create empty glossary files.
