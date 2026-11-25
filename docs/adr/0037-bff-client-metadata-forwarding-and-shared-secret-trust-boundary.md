---
status: Accepted
date: 2026-11-25
deciders: ngxccc
---

# 37. BFF Client Metadata Forwarding and Shared-Secret Trust Boundary

## Context

Under `ADR-0036`, Storefront (`apps/storefront`) runs as a Next.js BFF that keeps `accessToken` and `refreshToken` in `httpOnly` cookies and proxies auth calls to NestJS (`apps/api`). Because NestJS receives TCP connections from the Next.js server rather than the customer's browser, `refresh_tokens` records persisted on `POST /api/v1/auth/login` and `POST /api/v1/auth/refresh` capture the Next.js server's IP and runtime `User-Agent` (e.g., `Bun/...` or `undici`) instead of the customer's device metadata.

Furthermore, two architectural constraints make naive `X-Forwarded-For` forwarding unsafe:

1. **Direct Public API Exposure & Header Spoofing**: `apps/api` also serves `apps/backoffice` (browser-direct SPA). `extractClientMetadata()` previously read `req.headers["x-forwarded-for"].split(",")[0]` and `req.headers["x-real-ip"]` before `req.ip`, bypassing Express `app.set("trust proxy", 1)` and allowing any direct caller to spoof `ipAddress`.
2. **Multi-Hop Public Deployment (Vercel + Render)**: When Storefront deploys on Vercel and `apps/api` deploys on Render behind Render's own reverse proxy, BFF-to-API requests traverse public HTTPS. Render appends Vercel's egress IP as the rightmost hop, causing `trust proxy: 1` (`req.ip`) to resolve to Vercel's egress IP for every Storefront customer—corrupting `refresh_tokens.ip_address` and collapsing `CustomThrottlerGuard` (`5/min` login, `10/min` refresh) into a single shared bucket for all Storefront traffic.

- **Target modules**: `apps/storefront` (`proxy.ts`, `src/features/auth/actions/auth-actions.ts`, `src/features/auth/services/single-flight-refresh.ts`, `src/features/auth/services/session.server.ts`, `src/env.ts`), `apps/api` (`src/common/utils/client-info.util.ts`, `src/common/guards/throttler.guard.ts`, `src/common/config/env.config.ts`)
- **Spec reference**: `docs/design/storefront-auth-session-formal-spec.md`
- **Issue reference**: `#183` (Epic `#7`, follow-up from `#122` and `#123`)

## Decision

- **Shared-Secret BFF Client IP Header (`INTERNAL_PROXY_SECRET`)**: Introduce an optional shared secret `INTERNAL_PROXY_SECRET` (sourced from Doppler in production) shared between `apps/storefront` and `apps/api`. When Storefront BFF calls `apps/api`, it attaches `X-BFF-Client-IP` (the validated client IP) and `X-Internal-Proxy-Secret` when `INTERNAL_PROXY_SECRET` is configured.
- **Constant-Time Verification & Fail-Safe Fallback in `apps/api`**:
  - `extractClientMetadata()` and `CustomThrottlerGuard.getTracker()` trust `X-BFF-Client-IP` (validated via `node:net` `isIP()`) **only** when `INTERNAL_PROXY_SECRET` is configured and `X-Internal-Proxy-Secret` matches using `crypto.timingSafeEqual` (behind a byte-length guard per `docs/standards/security-and-cryptography.md`).
  - When `INTERNAL_PROXY_SECRET` is unset (local/Docker dev) or the secret header is absent/invalid (e.g., direct `apps/backoffice` requests), `apps/api` ignores `X-BFF-Client-IP` and raw `X-Forwarded-For[0]`/`X-Real-IP` overrides, falling back to Express `req.ip ?? req.socket?.remoteAddress` (governed by `app.set("trust proxy", 1)`).
- **Canonical Client IP Extraction in Storefront BFF**: Derive the client IP from incoming request headers in strict precedence: `cf-connecting-ip` -> `x-real-ip` -> rightmost valid IP in `x-forwarded-for`, validated via `node:net` `isIP()`. Strip/overwrite any incoming `x-forwarded-for`, `x-real-ip`, `x-bff-client-ip`, and `x-internal-proxy-secret` headers before forwarding.
- **User-Agent Sanitization & Runtime-Default Suppression**: Strip control characters (`[\x00-\x1f\x7f]`), trim, and clamp `User-Agent` to 255 characters. When `User-Agent` is absent or empty after sanitization, Storefront BFF explicitly sends `User-Agent: ""` to suppress Bun/Node `fetch()` default runtime headers (`Bun/...`, `undici`), and `apps/api` normalizes whitespace/empty `User-Agent` to `undefined` (persisting `null` in PostgreSQL).
- **Auth Surface Coverage**: Forward sanitized client metadata headers across `refreshSingleFlight` (invoked by both `proxy.ts` and `session.server.ts` `runWithServerActionRefresh`) and all auth Server Actions in `apps/storefront/src/features/auth/actions/auth-actions.ts`, without altering `Q28` `serverCookieBridgeMiddleware` in `apps/storefront/src/lib/api-client.ts`.

## Positive Consequences

- Accurate customer device `User-Agent` and `ipAddress` in `refresh_tokens`, both in single-hop Docker/VPC setups and multi-hop split deployments (Vercel + Render).
- `CustomThrottlerGuard` rate limits (`login`, `refresh`, `register`, `forgot-password`, `reset-password`) track individual customer IPs rather than collapsing all Storefront traffic onto a single BFF egress IP.
- Eliminates direct header-spoofing in `extractClientMetadata()` by removing unverified `X-Forwarded-For[0]` / `X-Real-IP` trust and enforcing `crypto.timingSafeEqual` on the BFF trust boundary.
- Prevents runtime `User-Agent` leakage (`Bun/...`, `undici`) into `refresh_tokens` when caller headers are absent.

## Negative Consequences / Risks

- Adds one cross-app Doppler secret (`INTERNAL_PROXY_SECRET`) that must be provisioned and rotated in sync across `apps/storefront` and `apps/api` in production.
- In local/test environments where `INTERNAL_PROXY_SECRET` is unset, BFF-to-API falls back to `req.ip` (loopback `127.0.0.1`), which is acceptable for dev/tests but means production deployments across public proxies MUST set `INTERNAL_PROXY_SECRET`.
- If `INTERNAL_PROXY_SECRET` is leaked from Storefront server runtime, an attacker could spoof `X-BFF-Client-IP`; mitigated by keeping it strictly server-only (`src/env.ts` `server` schema, never `NEXT_PUBLIC_*`).

## Explicit Tradeoffs

- **Shared-Secret `X-BFF-Client-IP` over `trust proxy: 1` + `X-Forwarded-For` Alone**: `trust proxy` hop counting breaks when Storefront and API sit behind independent edge proxies (Vercel + Render) while `apps/api` also serves browser-direct `apps/backoffice` traffic. A shared secret cleanly authenticates the BFF hop without weakening public API anti-spoofing.
- **Explicit `User-Agent: ""` over Omitting Header**: Omitting `User-Agent` in Bun/Node `fetch()` causes the runtime to inject `Bun/...` or `undici`. Sending `""` and normalizing empty strings to `undefined`/`null` in `apps/api` guarantees clean `null` semantics when caller `User-Agent` is unavailable.
- **Explicit Helper Injection over Global `api-client.ts` Middleware**: Passing forwarded headers at auth action / `refreshSingleFlight` boundaries preserves `Q28` simplicity and avoids coupling `next/headers` into `api-client.ts`.
