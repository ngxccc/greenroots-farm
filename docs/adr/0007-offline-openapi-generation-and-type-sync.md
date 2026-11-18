---
status: Accepted
date: 2026-11-15
deciders: ngxccc
---

# 7. Offline OpenAPI Generation and Type Synchronization

## Context

The storefront and backoffice must consume API contracts without booting PostgreSQL or Redis, and CI must type-check without services. Hand-maintained client types drifted from the API within one iteration. The API documentation also needed a renderer that reads the same generated document.

- **Target modules**: `apps/api`, `apps/storefront`, `apps/backoffice`
- **Symbol reference**: `apps/api/scripts/generate-openapi.ts`
- **Extracted from**: the pre-split ADR (0002) §1 and ADR (0001) §12 during the 2026-11-18 ADR split.

## Decision

- Generate `apps/api/openapi.json` from a headless NestJS application context created with `NestFactory.create(AppModule, { logger: false })`.
- Convert the document with `openapi-typescript` and distribute the generated types to `apps/storefront/src/types/api-schema.d.ts`, `apps/backoffice/src/types/api-schema.d.ts`, and `apps/api/test/generated/api-schema.d.ts`.
- Expose the pipeline as `bun run types:sync` at the monorepo root and `bun run openapi:generate` in `apps/api`.
- Keep generation fully offline: no live database or Redis connection.
- Render the document at `/api/docs` with `@scalar/nestjs-api-reference` and serve it at `/openapi.json`. The document version comes from `apps/api/package.json`; no duplicate version constant exists.

## Positive Consequences

- Client and test types are regenerated from one source, so contract drift is a build-time failure.
- CI type checks need no database, Redis, or listening port.
- API docs and generated types always describe the same document.

## Negative Consequences / Risks

- The headless app context still constructs every module, so a module that connects eagerly at bootstrap will break generation.
- Contributors must regenerate and commit contracts after changing a DTO.
- Adding a new consumer means adding a destination path to the script.

## Explicit Tradeoffs

- **Headless context over an HTTP scraper**: no port collisions and no network dependency, at the cost of bootstrapping the whole module graph.
- **Generated types over hand-written client models**: drift detection wins over total control of client shapes.
