---
status: Accepted
date: 2026-11-15
deciders: ngxccc
---

# 2. Offline OpenAPI Generation, Idempotency Interceptor, Mail/Cloudinary Infrastructure, and E2E Test Harness

## Context

Following the baseline established in ADR-0001, Issue #16 addresses critical infrastructure required before implementing authentication, user onboarding, and core order mutations:

1. **Offline Type Synchronization**: `bun run types:sync` previously pointed to a non-existent API script. Client workspaces (`apps/storefront`, `apps/backoffice`) and API contract tests required automated offline type generation from NestJS without spinning up live PostgreSQL or Redis instances.
2. **Idempotency Coordination**: Financial and checkout endpoints (`POST /api/v1/orders/checkout`, payments, refunds) require an idempotency layer to protect against network replays, double-charging, and concurrent race conditions.
3. **Media Upload Bottlenecks**: Cultivation logs, customer complaints, and catalog images require uploads. Passing media payloads through the API server causes CPU and memory bottlenecks; signed direct uploads to Cloudinary are required.
4. **Asynchronous Email Pipeline**: Verification and password recovery emails must not block domain transactions or cause transaction rollbacks on third-party provider latency.
5. **E2E & Integration Test Harness**: Tests needed to graduate from throwaway chaos scripts to a deterministic test harness inspired by OpenGenset, featuring dynamic PostgreSQL worker schemas, scoped Redis keys, and real HTTP execution via Supertest.

## Decision

### 1. Offline OpenAPI & Type Synchronization Pipeline

- Implemented `apps/api/scripts/generate-openapi.ts` using NestJS headless application context (`NestFactory.create(AppModule, { logger: false })`).
- Generates `apps/api/openapi.json` and uses `openapi-typescript` with AST parsing to generate and distribute TypeScript contracts to:
  - `apps/storefront/src/types/api-schema.d.ts`
  - `apps/backoffice/src/types/api-schema.d.ts`
  - `apps/api/test/generated/api-schema.d.ts`
- Wired as `bun run types:sync` at monorepo root and `bun run openapi:generate` in `apps/api`.
- Operates 100% offline without live database or Redis connections.

### 2. Redis 24h Idempotency Interceptor & Fail-Closed Guard

- Implemented `@Idempotent()` decorator and `IdempotencyInterceptor` driven by `IdempotencyService`.
- Header contract: `Idempotency-Key: <UUID>` (or UUIDv7). Missing or non-UUID headers on required routes return `400 Bad Request`.
- Two-phase execution:
  - Phase 1 (Acquire): Computes canonical JSON SHA-256 payload hash (`sha256(canonicalJson(body))`). Atomically acquires key in Redis with 60-second `PROCESSING` lock.
  - Phase 2 (Complete): On successful HTTP response, stores status code and body in Redis with 24-hour (`86400s`) TTL under status `COMPLETED`.
- Enforces 5 domain invariants:
  - `INV-IDEMP-1`: Replay with exact same payload within 24 hours returns cached status and response body without re-executing controller/service/DB logic.
  - `INV-IDEMP-2`: Replay with same key but altered payload returns `422 Unprocessable Entity` (`/errors/unprocessable-entity`).
  - `INV-IDEMP-3`: Concurrent requests while key is `PROCESSING` return `409 Conflict` (`/errors/conflict`).
  - `INV-IDEMP-4`: Fail-closed policy: Redis connectivity failure during key acquisition returns `503 Service Unavailable` (`/errors/service-unavailable`).
  - `INV-IDEMP-5`: Transaction rollback / downstream error deletes key from Redis, allowing immediate client retry.

### 3. Cloudinary Signed Upload with Boundary Constraints

- Implemented `MediaModule`, `CloudinaryService`, and `MediaController` (`POST /api/v1/media/upload-signature`).
- Enforces strict media boundaries:
  - Images $\le 5\text{MB}$ (`image/jpeg`, `image/png`, `image/webp`).
  - Videos $\le 15\text{MB}$ (`video/mp4`, `video/quicktime`, `video/webm`).
  - Whitelisted folders: `farming_logs`, `complaints`, `products`.
  - Violations rejected at HTTP boundary with `422 Unprocessable Entity` (`INV-MEDIA-1`).
- Server computes HMAC SHA-256 signature from sorted parameter strings and `CLOUDINARY_API_SECRET`.
- Development fallback: when `CLOUDINARY_API_SECRET` is omitted, generates mock signature allowing full local frontend development without third-party credentials.

### 4. BullMQ Asynchronous MailQueue

- Registered `BullModule` queue named `mail` with exponential backoff retries (3 attempts).
- `MailService` exposes domain producers: `sendVerificationEmail()` and `sendPasswordResetEmail()`.
- Implemented `IMailDriver` interface with two drivers:
  - `ResendMailDriver`: Dispatches emails via Resend HTTP API using `env.RESEND_API_KEY` and `env.EMAIL_FROM`.
  - `MockMailDriver`: In-memory capture for local development and test assertion without external side-effects.
- `MailProcessor` consumes queue jobs asynchronously without blocking HTTP requests.

### 5. OpenGenset-Aligned E2E & Integration Test Harness

- Provisioned standard test architecture in `apps/api/test/`:
  - `helpers/database.helper.ts`: Implements schema-per-worker virtualization (`test_<timestamp>_<uuid>`), server-side template cloning from `test_template`, and isolated connection pools. Falls back gracefully to `createMockDb()` when PostgreSQL is unreachable.
  - `helpers/app.helper.ts`: `createTestApp()` and `teardownTestApp()` provision `TestingModule`, prefix Redis keys with `test:<workerSchema>:`, and register `ZodValidationPipe` and `GlobalExceptionFilter`.
  - `helpers/auth.helper.ts`: Generates authenticated test sessions and signed JWT headers (`createAuthenticatedUser`, `createAuthenticatedAdmin`).
  - `factories/user.factory.ts`: Seed factory for Drizzle ORM user entities.
- Replaced manual chaos scripts with 4 automated Supertest integration suites:
  - `global-exception.e2e-spec.ts`: RFC 9457 `application/problem+json` contract verification.
  - `openapi.spec.ts`: Verification of OpenAPI 3.1.0 document, `/openapi.json`, and `/api/docs`.
  - `integration/idempotency.spec.ts`: End-to-end HTTP verification of the 5 idempotency invariants.
  - `integration/media.spec.ts`: End-to-end HTTP verification of upload constraints and signature generation.
  - `integration/mail.spec.ts`: Verification of queue enqueueing and processor dispatch.

## Positive Consequences

- `bun run types:sync` works out-of-the-box across all workspaces offline.
- Mutation endpoints have fail-closed protection against replay attacks, double-charges, and data duplication.
- Uploads never pass large file streams through API memory, avoiding server crashes and bandwidth saturation.
- Test suites run deterministically in parallel without database cross-talk or Redis key collisions.

## Negative Consequences / Risks

- In degraded local development without Redis, mutating endpoints with `@Idempotent({ required: true })` return `503 Service Unavailable`. Local developers must run `bun run docker:up`.
- Client applications must implement direct multipart upload handling to Cloudinary using the returned signature payload.

## Explicit Tradeoffs

- **Offline headless app vs HTTP scraper**: Headless Nest context creation avoids port collisions and network requirements during build/CI type checks.
- **Fail-closed idempotency vs fail-open availability**: Consistency and financial correctness strictly override availability for mutating commands.
- **Signed upload vs API proxy**: Direct client-to-CDN upload shifts multi-megabyte payloads away from API worker threads.
