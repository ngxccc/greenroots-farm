---
status: Accepted
date: 2026-11-15
deciders: ngxccc
---

# 8. Redis Idempotency Interceptor with Fail-Closed Semantics

## Context

Checkout, payments, and refunds are money-touching mutations exposed to network retries and double taps. Without a replay guard, a duplicate request can charge a customer twice or create two orders. Idempotency is therefore a correctness requirement, not an optimization.

- **Target module**: `apps/api/src/common`
- **Symbol reference**: `IdempotencyInterceptor` and `IdempotencyService` in `apps/api/src/common`
- **Extracted from**: the pre-split ADR (0002) §2 during the 2026-11-18 ADR split.

## Decision

- Provide an `@Idempotent()` decorator and an `IdempotencyInterceptor` backed by `IdempotencyService`.
- Require an `Idempotency-Key` header containing a UUID; a missing or malformed key on a required route returns `400`.
- Execute in two phases:
  - Acquire: hash the canonical JSON body with SHA-256 and atomically take the key in Redis with a 60-second `PROCESSING` lock.
  - Complete: on a successful response, store the status code and body for 24 hours under `COMPLETED`.
- Enforce five invariants:
  - `INV-IDEMP-1`: an identical replay within 24 hours returns the cached response without re-executing the handler.
  - `INV-IDEMP-2`: the same key with a different payload returns `422`.
  - `INV-IDEMP-3`: a concurrent request while the key is `PROCESSING` returns `409`.
  - `INV-IDEMP-4`: a Redis failure during acquisition returns `503` (fail closed).
  - `INV-IDEMP-5`: a downstream error deletes the key so the client can retry immediately.

## Positive Consequences

- Duplicate money mutations become harmless replays.
- Payload tampering under a reused key is detectable.
- Failed requests release the key instead of blocking retries for 24 hours.

## Negative Consequences / Risks

- Local development without Redis returns `503` on idempotent routes until `bun run docker:up`.
- Cached responses must not contain data that changes between replays, or the cache becomes misleading.
- The 24-hour window is a product decision, not a technical limit.

## Explicit Tradeoffs

- **Fail-closed over fail-open**: financial correctness wins over availability.
- **Redis over a database table**: TTL eviction is free and latency is lower, at the cost of accepting a hard dependency for these routes.
