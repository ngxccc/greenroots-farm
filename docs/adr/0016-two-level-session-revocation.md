---
status: Accepted
date: 2026-11-16
deciders: ngxccc
---

# 16. Two-Level Session Revocation in Redis

## Context

Password resets and admin suspensions must invalidate every session immediately, but a single-device logout must not sign the user out everywhere. Access tokens are stateless and valid for 15 minutes, so revocation needs a server-side deny list that covers that window.

- **Target modules**: `apps/api/src/common/guards`, `apps/api/src/common/services`
- **Symbol reference**: `JwtAuthGuard`, `RedisService.revokeUser`
- **Extracted from**: the pre-split ADR (0005) §3 during the 2026-11-18 ADR split.

## Decision

- Token level: `POST /auth/logout` deletes the specific refresh token and, when a valid bearer token is present, writes `auth:revoked:token:<jti>` with a TTL equal to the remaining access-token lifetime.
- User level: `POST /auth/logout-all`, password reset, and staff suspension delete every refresh token for the user and write `auth:revoked:user:<userId>` with `AUTH_REVOCATION_TTL_SECONDS = 900`.
- `JwtAuthGuard` validates the JWT and then reads both keys in one pipelined `mget`. Either key rejects the request with `401`.
- Redis failures fail open with a warning and a 30-second degraded-mode circuit; a successful call closes the circuit and logs recovery.
- The database deletion is authoritative. Redis is a best-effort accelerator for the 15-minute access-token window.

## Positive Consequences

- A single logout leaves other devices untouched.
- Account-wide events take effect within one guard check.
- One Redis round trip keeps guard latency low.

## Negative Consequences / Risks

- If Redis is unavailable, a revoked access token can remain valid for up to 15 minutes.
- `revokeUser` is fail-open and swallows errors, so callers must not treat it as a guarantee.
- Redis keys are ephemeral; losing Redis loses the deny list early.

## Explicit Tradeoffs

- **Two-level keys over one user key**: multi-device isolation wins over guard simplicity.
- **Fail-open over fail-closed**: availability for read paths wins, while stock, payment, and idempotency paths stay fail-closed.
