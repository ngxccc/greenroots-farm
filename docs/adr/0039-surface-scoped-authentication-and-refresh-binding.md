---
status: Accepted
date: 2026-11-25
deciders: ngxccc
---

# 39. Surface-Scoped Authentication Endpoints and Refresh Token Binding

## Context

Under `#17` and `ADR-0036`, `POST /api/v1/auth/login` and `POST /api/v1/auth/refresh` authenticate any active, email-verified user regardless of `UserRole`. As a result, `STAFF_ROLES` accounts (`farm_staff`, `sales`, `admin`, `super_admin`) can establish a Storefront customer session, and `UserRole.CUSTOMER` accounts could authenticate against Backoffice once `#120` is wired.

Separating authentication surfaces introduces four architectural trade-offs:

1. **Endpoint topology**: Splitting `POST /api/v1/auth/login` into distinct surface routes (`customer/login`, `staff/login`) vs. keeping a single `/auth/login` route with a `surface` field/header.
2. **Refresh token & session trust boundary**: Relying solely on Storefront BFF / Backoffice SPA role guards while keeping a shared `/auth/refresh` endpoint vs. binding `refresh_tokens` in PostgreSQL to an `auth_surface` enum (`customer` | `staff`) and splitting `/auth/customer/refresh` and `/auth/staff/refresh`.
3. **Error semantics & anti-enumeration**: Returning `403` after password verification vs. `401` generic credentials error, and whether to expose one shared error code or two surface-specific codes.
4. **Profile endpoint & Backoffice sequencing**: Keeping `GET/PATCH /api/v1/users/me` shared (`@ApiAuth()`) while enforcing `UserRole.CUSTOMER` in Storefront BFF, and scoping `#145` to API + `@greenroots/shared` + Storefront while keeping Backoffice SPA login wiring in `#120`.

- **Target modules**: `packages/shared`, `apps/api/src/database/schemas`, `apps/api/src/modules/auth`, `apps/storefront/src/features/auth`
- **Issue reference**: `#145` (Epic `#7`, follow-up to `#122` and `#17`; unblocks `#120`)
- **Supersedes**: Transitional role policy in `ADR-0036` (Storefront accepting any active `UserRole`)

## Decision

- **Split login and refresh endpoints by authentication surface (`customer` vs. `staff`)**:
  - Replace `POST /api/v1/auth/login` and `POST /api/v1/auth/refresh` with:
    - `POST /api/v1/auth/customer/login` and `POST /api/v1/auth/customer/refresh` (allows `UserRole.CUSTOMER` only)
    - `POST /api/v1/auth/staff/login` and `POST /api/v1/auth/staff/refresh` (allows `STAFF_ROLES` only)
  - Keep `register`, `verify-email`, `resend-verification` customer-only as designed, and keep `logout`, `logout-all`, `forgot-password`, `reset-password` shared (already token- or email-scoped).

- **Bind `refresh_tokens` to `auth_surface` in PostgreSQL (`ADR-0002`)**:
  - Add an `auth_surface` PostgreSQL native enum (`customer`, `staff`) and a non-null `surface` column on `refresh_tokens`.
  - On `refreshToken(surface, dto)`, retain `ADR-0015` atomic `DELETE ... RETURNING` (fail-closed revocation on misuse), then verify **both** `deletedToken.surface === expectedSurface` **and** live `user.role` compatibility with `expectedSurface` (preventing role-drift bypass if an account's role changes mid-session). Reject mismatches with `403 AUTH_SURFACE_FORBIDDEN`.

- **Fail-closed check ordering and single RFC 9457 error code (`ADR-0013`)**:
  - In `AuthService.login`, evaluate checks in order: `verifyPassword` (`401 AUTH_INVALID_CREDENTIALS`) → **surface role check** (`403 AUTH_SURFACE_FORBIDDEN`) → `emailVerified` (`403 AUTH_EMAIL_NOT_VERIFIED`) → `status` (`403 AUTH_ACCOUNT_SUSPENDED`). Checking surface role before `emailVerified`/`status` prevents leaking internal account status or triggering wrong-surface verification flows.
  - Define one shared error code `API_ERROR_CODES.AUTH_SURFACE_FORBIDDEN` (`403`) in `@greenroots/shared` and localize per surface in clients.

- **Defense-in-depth on Storefront BFF and shared `/api/v1/users/me`**:
  - Keep `GET/PATCH /api/v1/users/me` (`ProfileController`) open to all authenticated users (`@ApiAuth()`) so Backoffice (`#120`) can reuse self-service profile endpoints.
  - Enforce `user.role === UserRole.CUSTOMER` inside Storefront `resolveServerSession()` and `executeLoginAction()`, treating any non-customer session (including pre-`#145` cookies) as invalid.
  - Defer Backoffice SPA login wiring to `#120` using the regenerated OpenAPI types (`bun run types:sync`).

## Positive Consequences

- Enforces surface isolation at the API and database trust boundary rather than relying solely on BFF/SPA guards.
- Prevents cross-surface refresh token replay and mid-session role-drift bypasses, while revoking misused tokens immediately on cross-surface attempts.
- Enables independent `@Throttle` rate limits, OpenAPI schemas, and monitoring per surface.

## Negative Consequences / Risks

- Removing `/api/v1/auth/login` and `/api/v1/auth/refresh` is a breaking OpenAPI change requiring `bun run types:sync` and Storefront updates in the same PR.
- Returning `403 AUTH_SURFACE_FORBIDDEN` after password verification allows a caller who already possesses valid staff credentials to confirm the account is a staff account on Storefront (accepted trade-off over `401` UX confusion for internal staff).

## Explicit Tradeoffs

- **Surface-bound `refresh_tokens` + Split Refresh Routes over BFF-Only Guards**: Adds a schema migration on `refresh_tokens` and updates Storefront's `single-flight-refresh.ts`, but closes API-direct and cross-surface token replay gaps.
- **Role Check Before `emailVerified`/`status` over After**: Prevents Storefront from surfacing `resend-verification` UI to unverified staff accounts at the cost of prioritizing surface rejection over account-state messaging.
- **Single `AUTH_SURFACE_FORBIDDEN` Code over Per-Surface Error Codes**: Keeps `@greenroots/shared` error dictionary minimal (`ADR-0013`), delegating surface-specific Vietnamese copy to each app's error mapper.
