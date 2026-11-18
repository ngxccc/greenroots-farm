---
status: Accepted
date: 2026-11-16
deciders: ngxccc
---

# 13. RFC 9457 Machine-Readable Error Codes and Client-Side Localization

## Context

The backend previously formatted Vietnamese sentences inside validation pipes and filters. That coupled presentation to the server, could not adapt to inline errors versus toasts, and forced webhooks, tests, and APM tooling to parse natural language. Product copy changes also required an API redeploy.

- **Target modules**: `packages/shared`, `apps/api`, `apps/storefront`, `apps/backoffice`
- **Symbol reference**: `packages/shared/src/error-dictionary.ts`
- **Extracted from**: the pre-split ADR (0004) during the 2026-11-18 ADR split. Absorbs the auth error-code registration formerly in ADR (0005) §5.

## Decision

- Keep the developer domain in English: routes, DTOs, OpenAPI descriptions, logs, and RFC 9457 `detail` and `reason` values.
- Return `application/problem+json` with `type` as `/errors/<slug>`, a stable top-level `code`, and `invalidParams[]` entries carrying their own `code`, `reason`, and constraint `params`.
- Freeze every machine code in `API_ERROR_CODES` in `packages/shared/src/error-dictionary.ts`.
- Export `API_ERROR_DICTIONARY` with default Vietnamese copy and `resolveSharedApiErrorMessage(code, params, fallbackDetail)` for clients.
- Register each module's codes in the shared dictionary as part of that module's implementation. The auth module registers `AUTH_EMAIL_NOT_VERIFIED`, `AUTH_EMAIL_ALREADY_EXISTS`, `AUTH_VERIFICATION_TOKEN_INVALID`, and `AUTH_RESET_TOKEN_INVALID`.
- Let clients choose the presentation surface; the server never emits localized sentences.

## Positive Consequences

- OpenAPI examples and cURL output stay readable for international tooling.
- Clients control inline errors, tooltips, toasts, and dialogs without an API release.
- APM and webhook consumers branch on codes instead of strings.

## Negative Consequences / Risks

- Every new code must be added to the shared dictionary, or clients fall back to `detail`.
- Clients must implement resolution logic, which the shared helper mitigates.

## Explicit Tradeoffs

- **Client-side resolution over `nestjs-i18n`**: presentation flexibility wins over server-rendered copy.
- **Stable codes over descriptive messages**: machine stability wins over human-readable defaults.
