---
status: Accepted
date: 2026-11-16
deciders: ngxccc
---

# 5. Authentication Session Lifecycle, Refresh Token Rotation, and Two-Level Redis Revocation

## Context

Following the offline OpenAPI and infrastructure foundation established in ADR-0002, Issue #17 addresses core identity and access management for GreenRoots Farm (UC-01 through UC-04):

1. **User Identity & State Integrity**: In OpenGenset, registration set `status = "PENDING_VERIFICATION"` and transitioned to `ACTIVE` upon email confirmation. In GreenRoots Farm, `UserStatus` is frozen in `@greenroots/shared` as `active`, `inactive`, `suspended`. In addition, PostgreSQL table `users` features a dedicated boolean column `emailVerified`. Attempting to insert an undeclared enum status violates database constraints and monorepo domain boundaries.
2. **Refresh Token Single-Use Rotation & Concurrency**: Security standards require refresh tokens to be single-use. We need atomic rotation in PostgreSQL without introducing race condition vulnerabilities or table bloating from abandoned sessions.
3. **Session Revocation Granularity**: While password changes, password resets, and admin suspensions require instant invalidation of all sessions across all devices, single-device logout (`POST /auth/logout`) must terminate only the active device session without disrupting the user's other active sessions (e.g. tablet or workstation).
4. **Offline Type & DTO Architecture**: Conforming to ADR-0003 and ADR-0004, authentication request/response schemas must be co-located in `src/modules/auth/dto/`, domain interfaces in `auth.interface.ts` must maintain 0 bytes runtime overhead, and errors must emit machine-readable RFC 9457 codes with English developer fallbacks.

## Decision

### 1. Account Lifecycle & Email Verification Gate

- Registration (`POST /auth/register`) inserts a user record with `status: "active"`, `emailVerified: false`, and an Scrypt-hashed password (`s1$<salt>$<hash>`).
- Authentication (`POST /auth/login`) strictly checks `user.emailVerified === true`. Unverified users are rejected with HTTP 403 Forbidden and machine-readable code `AUTH_EMAIL_NOT_VERIFIED`.
- Account verification (`POST /auth/verify-email`) validates the 32-byte hex token against its SHA-256 hash in `users.verificationToken` and ensures `verificationExpiresAt > NOW()`, updating `emailVerified = true`.
- Re-registration with an unverified existing email is rejected with HTTP 409 Conflict (`AUTH_EMAIL_ALREADY_EXISTS`) to defend against account takeover race conditions. Re-sending activation links is handled exclusively via `POST /auth/resend-verification` with 60-second cooldown and rate limiting.

### 2. Atomic Refresh Token Rotation via `DELETE ... RETURNING`

- Refresh tokens are opaque 256-bit random hex strings generated via `generateRefreshToken()`. Only their SHA-256 digests are persisted in `refresh_tokens.token`.
- Rotation (`POST /auth/refresh`) executes an atomic PostgreSQL query:
  ```sql
  DELETE FROM refresh_tokens WHERE token = $hashedIncoming RETURNING id, user_id, expires_at;
  ```
- If 0 rows are returned or the token has expired (`expires_at < NOW()`), the request is immediately rejected with HTTP 401 Unauthorized (`AUTH_TOKEN_INVALID_OR_EXPIRED`).
- On successful deletion, a new token pair (`accessToken` with 15m TTL and `refreshToken` with 7d TTL) is generated and stored in a single transaction.
- Client applications (Storefront / Backoffice) are responsible for queuing or deduplicating concurrent in-flight refresh requests via standard interceptor mutexes.

### 3. Hybrid Two-Level Access Token Revocation

We establish a two-level token revocation architecture in Redis:

- **Level 1 (Token-Level, Single Logout)**:
  - `POST /auth/logout` deletes the specific refresh token from PostgreSQL.
  - If a valid `Authorization: Bearer <accessToken>` header is present, extracts the token's unique `jti` (UUIDv7) claim and records `auth:revoked:token:<jti>` in Redis with TTL equal to the remaining access token lifetime (max 15 minutes).
  - Best-effort execution: if the access token has already expired before logout is invoked, Redis write is skipped without returning 401.
  - Other active device sessions of the same user remain completely unaffected.
- **Level 2 (User-Level, Account-Wide Events)**:
  - Invoked during `POST /auth/logout-all`, `POST /auth/reset-password`, `POST /auth/change-password`, or SuperAdmin account suspension.
  - Deletes all refresh tokens for `userId` in PostgreSQL (`DELETE FROM refresh_tokens WHERE user_id = $userId`).
  - Sets Redis key `auth:revoked:user:<userId>` with TTL of 15 minutes (`AUTH_REVOCATION_TTL_SECONDS = 900`).
- **Unified Guard Enforcement (`JwtAuthGuard`)**:
  - Validates JWT signature and expiration.
  - Executes a single pipelined Redis operation:
    ```typescript
    const [userRevoked, tokenRevoked] = await redis.mget(
      `auth:revoked:user:${payload.sub}`,
      `auth:revoked:token:${payload.jti}`,
    );
    ```
  - If either key exists, rejects the request with HTTP 401 Unauthorized (`MESSAGES.AUTH.TOKEN_REVOKED`).
  - Redis connectivity failures fail open to preserve platform availability.

### 4. Background Token Cleanup Service

- Implemented `TokenCleanupService` running in `AuthModule` on bootstrap and every 24 hours via `setInterval`.
- Executes `DELETE FROM refresh_tokens WHERE expires_at < NOW()` to purge abandoned expired sessions and maintain minimal B-tree index size on `refresh_tokens.token`.

### 5. RFC 9457 Machine-Readable Error Registration

- Registered new error codes in `@greenroots/shared` (`API_ERROR_CODES` & `API_ERROR_DICTIONARY`):
  - `AUTH_EMAIL_NOT_VERIFIED`
  - `AUTH_EMAIL_ALREADY_EXISTS`
  - `AUTH_VERIFICATION_TOKEN_INVALID`
  - `AUTH_RESET_TOKEN_INVALID`
- All auth controllers emit standard `ApiResponseDto<T>` envelopes for successes and RFC 9457 `application/problem+json` for errors.

## Positive Consequences

- Clean separation between business account state (`UserStatus.ACTIVE`) and verification state (`emailVerified: boolean`).
- Granular session management: users can log out of public/shared devices without terminating their home/mobile sessions.
- Single network round-trip (<0.5ms) in `JwtAuthGuard` checks both user-wide and token-specific revocation.
- Zero table bloating: expired refresh tokens are pruned automatically every 24 hours.
- Strict anti-enumeration on public credential recovery endpoints.

## Negative Consequences / Risks

- In rare cases where Redis is partitioned or failing open, a revoked access token could remain valid for up to 15 minutes until natural JWT expiration.
- Web SPAs must properly mutex their HTTP interceptors to avoid race conditions during concurrent 401 token refreshes.

## Explicit Tradeoffs

- **Two-level Redis Keys vs Single User-level Key**: Added complexity in `JwtAuthGuard` (`mget` instead of `get`) is traded for preventing disruptive multi-device session drops during single logout.
- **Atomic Delete vs Soft Revocation Tombstones**: Eliminates database writes, migration overhead, and tombstone tables in favor of client-side refresh mutexing.
- **Fail-open Redis vs Fail-closed Availability**: Critical for read operations and active browsing; authentication failures fail open for token revocation checks when Redis is degraded, prioritizing platform uptime.
