---
status: Accepted
date: 2026-11-16
deciders: ngxccc
---

# 11. DTO Schema Co-Location and Pure Domain Interfaces

## Context

During media signed-upload work, one input schema lived in `media.interface.ts` while the matching output schema lived in `dto/`. Putting executable Zod schemas in `.interface.ts` files turns a compile-time contract into runtime JavaScript and creates circular-dependency risk between domain services and transport DTOs.

- **Target modules**: `apps/api/src/modules/*`
- **Symbol reference**: `apps/api/src/modules/media/dto`
- **Extracted from**: the pre-split ADR (0003) §1–§2 during the 2026-11-18 ADR split.

## Decision

- Co-locate every HTTP request and response Zod schema inside its DTO file: `src/modules/<module>/dto/<action>.dto.ts`.
- Each DTO file exports the schema constant, the inferred input type, and a `createZodDto` class.
- Domain services import the inferred type, never the NestJS DTO class.
- Reserve `<module>.interface.ts` for pure domain types, interfaces, and business constants. Executable Zod schemas are forbidden there.

## Positive Consequences

- Validation rules, inferred types, and DTO classes live in one file.
- `.interface.ts` files stay compile-time-only with no runtime bundle cost.
- Services depend on types rather than transport classes.

## Negative Consequences / Risks

- Contributors must know which of the two files a given symbol belongs to.
- A schema used by both a DTO and an internal job needs an explicit home, usually the DTO file.

## Explicit Tradeoffs

- **Co-location over a separate `schemas/` folder**: fewer directories and less file jumping, at the cost of DTO files that hold both schema and class.
