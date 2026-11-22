---
status: Accepted
date: 2026-11-22
deciders: ngxccc
---

# 36. Storefront BFF httpOnly Session and Single-Flight Refresh

## Context

Storefront (`apps/storefront`) runs Next.js 16 with `cacheComponents: true` (`partialPrefetching: true`) and enforces server-only API calls via `serverCookieBridgeMiddleware` (`Q28`) in `apps/storefront/src/lib/api-client.ts`, which rejects browser invocations with `500` and forwards `httpOnly` cookies on server calls.

Meanwhile, the NestJS authentication subsystem (`ADR-0015`, `ADR-0016`, `docs/design/auth-and-session-management.md`) issues JSON `{ accessToken, refreshToken }` pairs without setting browser cookies and enforces atomic single-use refresh token rotation via `DELETE ... RETURNING`. Because Next.js App Router Server Components (RSC) cannot mutate response cookies (`Set-Cookie`), attempting reactive refresh inside RSCs would delete the active single-use refresh token in PostgreSQL while failing to persist the replacement pair in the browser. Furthermore, `docs/standards/security-and-cryptography.md` specifies in-memory access tokens for SPA clients (`apps/backoffice`), which conflicts with Storefront SSR hydration and `Q28` unless scoped per surface.

- **Target module**: `apps/storefront` (`proxy.ts`, `src/lib/`, `src/components/common/header.tsx`, `app/api/auth/`)
- **Spec reference**: `docs/design/storefront-auth-session-formal-spec.md`
- **Issue reference**: `#122` (Epic `#7`, split from `#42`)

## Decision

- Keep `apps/storefront/src/lib/api-client.ts` strictly server-side (`Q28`) and store both `accessToken` (`maxAge = 900s`, matching the 15-minute JWT TTL) and `refreshToken` (`maxAge = 604800s`, 7 days) exclusively in `httpOnly`, `SameSite=Lax`, `path=/`, `Secure` (production) cookies managed by the Next.js BFF. Scope the in-memory access-token guidance in `docs/standards/security-and-cryptography.md` to browser-direct SPA surfaces (`apps/backoffice`).
- Perform proactive token refresh in Next.js `proxy.ts` before RSC execution whenever `refreshToken` is present and `accessToken` is missing or within 60 seconds of expiry (`exp - now < 60s`), forwarding the refreshed `accessToken` into the downstream request cookies for the current SSR render and setting `Set-Cookie` on the HTTP response. Skip proactive refresh on `Next-Router-Prefetch` / static requests to preserve the `10/min` API rate-limit budget.
- Serialize concurrent refresh attempts inside the BFF using an in-process single-flight `Map` keyed by `sha256(refreshToken)`, paired with a 5-second grace marker recording recently rotated token digests. When a delayed request arrives with a recently rotated digest, the BFF rejects/retries without emitting cookie-clearing `Set-Cookie` headers so stale tabs or prefetches never overwrite newly rotated cookies.
- Keep `StorefrontHeader` static shell compatible with `cacheComponents: true` by isolating customer identity hydration inside a `<Suspense>` boundary backed by per-request memoized `GET /api/v1/users/me` (`ProfileController`), while synchronizing logout and session expiration across tabs via `BroadcastChannel` (`greenroots-auth`).
- Accept any valid active `UserRole` returned by `POST /api/v1/auth/login` during `#122` (transitional compatibility with `#17`), and track surface-level `customer` vs `staff` role separation in a dedicated follow-up issue.

## Positive Consequences

- Zero token exposure (`accessToken` and `refreshToken`) to browser JavaScript or `localStorage`, hardening Storefront against XSS credential theft.
- RSCs never invoke `/api/v1/auth/refresh`, eliminating the cookie-immutability trap under `ADR-0015` atomic deletion.
- Concurrent SSR/Server Action requests sharing an expired session coalesce into one `POST /api/v1/auth/refresh` call, and stale cross-tab requests cannot wipe freshly issued `refreshToken` cookies.
- PPR static shells in `RootLayout` remain intact under `cacheComponents: true`.

## Negative Consequences / Risks

- The in-process single-flight `Map` and 5-second grace marker assume a single Next.js server process (or sticky sessions); multi-replica horizontal scaling without sticky routing would require moving the single-flight lock to Redis.
- Proactive refresh in `proxy.ts` adds one internal BFF-to-API hop at most once every ~14 minutes per active session.
- Until the follow-up role-separation issue lands, staff credentials can establish a Storefront customer session (restricted to customer endpoints).

## Explicit Tradeoffs

- **Strict BFF `httpOnly` Cookies over Hybrid In-Memory Browser Tokens**: Eliminates browser token exposure and preserves `Q28` single-client architecture at the cost of routing authenticated client actions through Next.js Server Actions / BFF Route Handlers.
- **Next.js `proxy.ts` Proactive Refresh over RSC Reactive Refresh**: Solves Next.js RSC `Set-Cookie` immutability without extra client round-trips or guest-to-user flicker, while requiring prefetch exclusion and stale-cookie protection.
- **Grace Marker without Token Caching over Returning Cached Token Pairs**: Prevents stale tab requests from deleting valid cookies while preserving `ADR-0015` single-use replay protection (expired/rotated tokens never re-issue credentials from BFF memory).
