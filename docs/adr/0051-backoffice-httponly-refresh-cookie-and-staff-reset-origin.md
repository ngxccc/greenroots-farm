---
status: Accepted
date: 2026-11-28
deciders: ngxccc
---

# 51. Backoffice HttpOnly Refresh Cookie and Staff Password-Reset Origin Routing

## Context

`docs/design/auth-and-session-management.md` initially declared NestJS cookie-setting a non-goal, leaving client runtimes to store tokens independently. For Storefront (`apps/storefront`), `ADR-0036` solved this via a Next.js BFF that wraps `/api/v1/auth/customer/*` JSON responses into `httpOnly` cookies. Backoffice (`apps/backoffice`), however, is a pure Vite React SPA with no BFF server:

1. **Refresh token storage in SPA**: Keeping `refreshToken` in `localStorage`/`sessionStorage` exposes a 7-day credential to XSS, while keeping it purely in-memory destroys the session on every page reload (`F5`).
2. **Cold-reload user hydration**: If `accessToken` remains in-memory and `refreshToken` moves to an `httpOnly` cookie, `POST /api/v1/auth/staff/refresh` must return `{ accessToken, user }` so the SPA can rehydrate role-based navigation and route guards in a single round-trip.
3. **Staff password-reset email origin**: `AuthService.forgotPassword` delegates to `MailService.sendPasswordResetEmail`, which hardcodes `${env.STOREFRONT_URL}/reset-password?token=...`, routing internal staff users to Storefront instead of `env.BACKOFFICE_URL`.

- **Target modules**: `apps/api/src/modules/auth`, `apps/api/src/modules/mail`, `apps/api/src/main.ts`, `apps/backoffice/src`
- **Issue reference**: `#120` (Epic `#7`, follow-up to `#145` / `ADR-0039`)
- **Amends**: `docs/design/auth-and-session-management.md` (cookie-setting non-goal for staff surface) and `ADR-0039` (staff login/refresh transport contract)

## Decision

- **Issue `httpOnly` refresh cookie for `/api/v1/auth/staff/*` only (Web SPA transport)**:
  - `POST /api/v1/auth/staff/login` and `POST /api/v1/auth/staff/refresh` set an `httpOnly` cookie (`gr_staff_refresh`, `HttpOnly`, `SameSite=Lax`, `Path=/api/v1/auth`, `Max-Age=7d`, `Secure` when `NODE_ENV === "production"`) and **omit `refreshToken` from their JSON response bodies** (`StaffLoginResponseDto` / `StaffRefreshResponseDto`).
  - `POST /api/v1/auth/staff/refresh` reads the refresh token from `req.cookies.gr_staff_refresh` and returns `{ accessToken, user }` (`StaffLoginResponseDto`) so Backoffice rehydrates `user.role` in a single request on reload.
  - `POST /api/v1/auth/logout` remains shared: it resolves the token from `body.refreshToken ?? req.cookies.gr_staff_refresh` and clears `gr_staff_refresh`, preserving Storefront BFF compatibility.
  - Keep `/api/v1/auth/customer/*` JSON-only so Storefront BFF (`ADR-0036`) and future customer mobile clients remain unchanged.

- **Keep `accessToken` in-memory and enforce Origin CSRF checks on cookie-authenticated auth routes**:
  - Backoffice keeps `accessToken` and `user` strictly in-memory (Zustand without persistence); `JwtAuthGuard` continues reading `Authorization: Bearer <token>`, avoiding CSRF exposure across domain endpoints.
  - Cookie-authenticated `staff/refresh` and cookie-fallback `logout` validate the `Origin` header (when present) against `CORS_ORIGINS` (`allowedOrigins`).

- **Route `forgot-password` reset links by `user.role`**:
  - `AuthService.forgotPassword` selects `user.role` and passes `isStaff: STAFF_ROLES.includes(user.role)` to `MailService.sendPasswordResetEmail`, which uses `env.BACKOFFICE_URL` for staff and `env.STOREFRONT_URL` for customers without changing the public `POST /api/v1/auth/forgot-password` contract.

- **Eliminate all Backoffice demo role bypasses**:
  - Remove `DEMO_USERS`, `loginDemoRole`, and `import.meta.env.DEV` role-switching UI from `apps/backoffice` unconditionally.

## Positive Consequences

- Protects 7-day staff refresh tokens from XSS via `httpOnly` cookies without introducing a Backoffice BFF service.
- Preserves Storefront BFF (`ADR-0036`) and `/auth/customer/*` multi-platform JSON transport untouched.
- Enables single-round-trip session rehydration on Backoffice page reloads and fixes staff password-recovery email links end-to-end.

## Negative Consequences / Risks

- `/api/v1/auth/staff/*` becomes web-cookie-only; a future native mobile app for staff will require adding a separate JSON-transport endpoint or header negotiation.
- Assumes Backoffice and API are deployed same-site (e.g., `admin.greenroots.vn` and `api.greenroots.vn`); cross-site deployments would require `SameSite=None; Secure` and explicit CSRF tokens.
- Breaking OpenAPI change on `/auth/staff/login` and `/auth/staff/refresh` requires updating `apps/api/test/integration/{auth,staff,throttling}.spec.ts` and running `bun run types:sync`.

## Explicit Tradeoffs

- **NestJS `httpOnly` Cookie for `/auth/staff/*` over `localStorage` / `sessionStorage` Refresh Token**: Adds `cookie-parser` and Origin validation in `apps/api` and binds `/auth/staff/*` to browser cookies, but eliminates XSS token exfiltration in an internal console with no BFF.
- **Returning `{ accessToken, user }` from `staff/refresh` over Calling `GET /users/me` Separately**: Couples `staff/refresh` response to `UserInfoDto`, but eliminates a cold-reload waterfall before TanStack Router `beforeLoad` guards can resolve role routing.
- **Role-Based Origin Selection in `forgotPassword` over Splitting `/auth/staff/forgot-password`**: Avoids an extra public endpoint and OpenAPI churn while keeping anti-enumeration intact.
