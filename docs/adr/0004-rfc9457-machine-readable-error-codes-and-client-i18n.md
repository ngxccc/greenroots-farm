---
status: Accepted
date: 2026-11-16
deciders: ngxccc
---

# 4. RFC 9457 Machine-Readable Error Codes and Client-Side Localization Architecture

## Context

During the stabilization of OpenAPI documentation and Zod validation pipes (Issue #16, PR #63), a fundamental architectural conflict emerged regarding multi-language handling (i18n):

1. **Language Boundary Dissonance**: While developer tooling, Git, CI/CD, OpenAPI/Swagger specifications, and DTO contracts were strictly maintained in 100% English, the backend validation pipes and filters attempted to dynamically format human-readable Vietnamese sentences (e.g., _"Trường này là bắt buộc"_, _"Email không đúng định dạng"_).
2. **UI Context Blindness**: The backend cannot infer presentation constraints (inline form input, tooltip, toast notification, or full modal dialog). Hardcoding Vietnamese sentences on the server resulted in rigid copy that could not be tailored to surface-specific UX needs in Next.js Storefront or React Backoffice.
3. **Double-Translation Drift**: Attempting to manage natural language dictionaries in both NestJS (`MESSAGES.VALIDATION`) and client applications (`next-intl`, React components) introduced duplicate sources of truth, requiring API redeployment whenever marketing or product copy changed.
4. **Tooling & Telemetry Degradation**: Machine consumers, third-party webhook integrations (e.g., PayOS, Cloudinary), APM telemetry (Sentry, Datadog), and automated test suites were forced to parse natural language Vietnamese strings to determine error causes.

## Decision

We adopt the **Enterprise Hybrid Architecture** (modeled after Stripe, Google Cloud AIP-193, and Zalando RFC 9457):

### 1. Developer Domain vs. User Domain Boundary

- **Developer Domain (100% English)**: All API routes, DTOs, OpenAPI descriptions, log entries, and RFC 9457 developer fallbacks (`detail`, `reason`) MUST be written in technical English.
- **User Domain (Localized Presentation)**: User-facing text rendering is strictly owned by client applications (`apps/storefront` and `apps/backoffice`) at the UI presentation boundary.

### 2. RFC 9457 Machine-Readable Error Code Standard

All error responses adhere to RFC 9457 with top-level and parameter-level machine codes:

```json
{
  "type": "/errors/bad-request",
  "title": "Bad Request",
  "status": 400,
  "code": "VALIDATION_FAILED",
  "detail": "The request payload failed validation checks.",
  "instance": "/api/v1/media/upload-signature",
  "invalidParams": [
    {
      "name": "fileSizeBytes",
      "code": "TOO_BIG",
      "reason": "Number must be less than or equal to 5242880.",
      "params": { "origin": "number", "maximum": 5242880, "inclusive": true }
    }
  ],
  "timestamp": "2026-11-16T15:10:00.000Z"
}
```

- **`code`**: A standardized, immutable machine-readable identifier (e.g. `VALIDATION_FAILED`, `TOO_BIG`, `REQUIRED`, `INVALID_EMAIL`).
- **`detail`**: An English technical explanation intended for developers, cURL/Postman testing, and APM error logs.
- **`invalidParams[].params`**: Dynamic constraint metadata (`{ minimum, maximum, expected, received }`) allowing client i18n libraries to dynamically interpolate localized strings.

### 3. Single Source of Truth in `@greenroots/shared`

- All machine error codes are frozen in `packages/shared/src/error-dictionary.ts` under `API_ERROR_CODES`.
- The shared package exports `API_ERROR_DICTIONARY` mapping error codes to default Vietnamese copy, along with `resolveSharedApiErrorMessage(code, params, fallbackDetail)` to enable client-side error resolution.

## Positive Consequences

- **100% RFC 9457 & OpenAPI Compliance**: OpenAPI contracts and examples remain deterministic, readable by international tooling and code generators.
- **Zero UI Context Blindness**: Frontend developers have full freedom to format error messages according to UI component needs (inline error vs. toast vs. dialog) without backend redeployment.
- **Pristine Developer Experience (DX)**: Testing APIs with cURL, Postman, or Scalar immediately provides intelligible English diagnostics rather than unmapped error codes or unparsed JSON blobs.
- **Production Telemetry Ready**: Sentry and APM logs capture structured English errors, simplifying automated alerting and AI-assisted triage.

## Negative Consequences / Risks

- Client applications must implement error code resolution logic (provided out-of-the-box via `resolveSharedApiErrorMessage` in `@greenroots/shared`).
- When introducing a new validation code, developers must declare it in `API_ERROR_CODES` in `@greenroots/shared`.

## Explicit Tradeoffs

- **Server-rendered translations vs Client-side resolution**: We reject server-side natural language translation (`nestjs-i18n`) in favor of machine-readable error codes with English fallbacks. The server remains a clean, high-performance API gateway, while presentation is delegated to client runtimes.
