---
status: Accepted
date: 2026-11-16
deciders: ngxccc
---

# 15. Single-Use Refresh Token Rotation

## Context

Refresh tokens grant long-lived access. A stolen token that stays valid for its full lifetime cannot be detected, and a database full of expired sessions bloats the lookup index. Rotation plus atomic deletion makes replay detectable and keeps the table bounded.

- **Target module**: `apps/api/src/modules/auth`
- **Symbol reference**: `AuthService.refreshToken`, `refreshTokens` schema
- **Extracted from**: the pre-split ADR (0005) §2 during the 2026-11-18 ADR split. Token pruning moved to `docs/standards/database-and-migrations.md`.

## Decision

- Issue opaque 256-bit random hex refresh tokens, never JWTs.
- Persist only the SHA-256 digest in `refresh_tokens.token`.
- Rotate with a single atomic statement that deletes the incoming row and returns its metadata. Zero returned rows or an expired timestamp returns `401 AUTH_TOKEN_INVALID_OR_EXPIRED`.
- On success, generate a new access token (15-minute TTL) and a new refresh token (7-day TTL) inside one transaction.
- Require clients to serialize concurrent refreshes behind an interceptor mutex; the server does not queue them.

## Positive Consequences

- A replayed refresh token fails because the first use deleted it.
- Database contents cannot be used directly as bearer credentials.
- Session rows stay bounded because each rotation replaces the previous row.

## Negative Consequences / Risks

- A client that refreshes concurrently without a mutex can invalidate its own session.
- Losing the response after a successful rotation forces re-authentication.

## Explicit Tradeoffs

- **Atomic delete over tombstone plus grace window**: simplicity and immediate replay detection win over tolerance for lost responses.
- **Opaque tokens over JWT refresh tokens**: revocability wins over stateless verification.
