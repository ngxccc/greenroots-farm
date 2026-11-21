---
status: Accepted
date: 2026-11-20
deciders: ngxccc
---

# 28. Batch QR Label Origin, Payload Contract, and Deprecated Column Boundary

## Context

Issue #83 (split from #23; parent epic #9; Backoffice consumer #47 `BO-03`) introduces `GET /api/v1/batches/:id/qr-label` in `apps/api/src/modules/inventory` to supply a deterministic QR label payload (`{ batchCode, traceUrl, labelPayload }`) without server-side SVG/PNG rendering. Reconciling #83 against `apps/api/src/common/config/env.config.ts`, `apps/api/src/database/schemas/catalog.schema.ts`, `apps/storefront/app/trace/[batchCode]/page.tsx`, and ADR-0026 surfaced five architectural tensions:

1. **Unchecked `localhost` default for `STOREFRONT_URL` in production**: `env.config.ts` defines `STOREFRONT_URL: z.url().default("http://localhost:3001")`, which `MailService` already uses for verification and password-reset links, yet `parseApiEnvironment()` performs zero production validation on `STOREFRONT_URL`. An omitted or misconfigured variable in production would silently emit `http://localhost:3001/trace/<batchCode>` onto printed thermal packaging stickers. Furthermore, `z.url()` permits trailing slashes, non-HTTP schemes, or path prefixes unless normalized at the origin boundary.
2. **Dual `/trace` routes (JSON API vs. Storefront web page)**: `GET /api/v1/trace/:batchCode` (`TraceController`, ADR-0024) serves JSON for programmatic clients, whereas the scannable consumer experience lives at `<STOREFRONT_URL>/trace/<batchCode>` (`apps/storefront/app/trace/[batchCode]/page.tsx`). Encoding the API route or inventing a second base URL env var would either show raw JSON to shoppers or risk domain drift against `MailService`.
3. **Undefined `labelPayload` schema vs. determinism guarantee**: Backoffice `BO-03` (`apps/backoffice/src/routes/farming/batches.tsx`) is still a placeholder, leaving `labelPayload` uncodified. Including mutable operational fields (`batches.status`, `batches.availableQuantity`, or mutable `farms` settings) would cause repeated calls for the same batch to diverge over time and add unnecessary multi-table joins.
4. **Deprecated `batches.qrCodeUrl` column (`catalog.schema.ts`)**: ADR-0026 kept `batches.qrCodeUrl` as `null` during `POST /api/v1/batches`, while `tier2-catalog.seeder.ts` still populates static `https://greenroots.farm/trace/...` strings and `BatchDto` (`apps/api/src/modules/inventory/dto/batch.dto.ts`) exposes `qrCodeUrl: string | null`. Reading from `batches.qrCodeUrl` would serve stale/null URLs, writing to it on `GET` violates HTTP read safety, and dropping the column inside #83 would couple a destructive migration to a read-only endpoint task.
5. **Expired, sold-out, and soft-deleted product batches**: Blocking `GET /api/v1/batches/:id/qr-label` on `batches.status` (`expired`/`sold_out`) would violate time-invariant determinism, while filtering `products.deletedAt IS NULL` would break re-labeling for historical/recall batches already permitted by `BatchesService.getBatchById()` and ADR-0024.

- **Target modules**: `apps/api/src/modules/inventory`, `apps/api/src/common/config`, `packages/shared`
- **Issue**: #83 (split from #23; parent epic #9); consumer: #47 (`BO-03`); deferred cleanup: #102
- **Spec**: `docs/design/batch-qr-label-formal-spec.md`, `docs/design/drop-batch-qr-code-url-formal-spec.md`
- **Related**: ADR-0007, ADR-0011, ADR-0012, ADR-0013, ADR-0024, ADR-0026

## Decision

- **Reuse `STOREFRONT_URL` as the canonical public origin SSOT with production fail-fast**:
  - Normalize `STOREFRONT_URL` into a strict HTTP/HTTPS origin (rejecting non-`http:`/`https:` protocols, non-root pathnames, query strings, and hash fragments, and stripping any trailing slash via `URL.origin`).
  - Extend `parseApiEnvironment()` in `apps/api/src/common/config/env.config.ts` so `NODE_ENV === "production"` fails fast at boot if `STOREFRONT_URL` is omitted from `rawEnv`, does not use `https:`, or resolves to a loopback/unspecified host (`localhost`, `127.0.0.1`, `::1`, `[::1]`, `0.0.0.0`, or `*.localhost`). Non-production (`development`, `test`) retains the `http://localhost:3001` default.
  - Construct `traceUrl` dynamically as `new URL(\`/trace/\${encodeURIComponent(batch.batchCode)}\`, normalizedStorefrontOrigin).toString()`.
- **Deprecate `batches.qrCodeUrl` for QR generation and execute Contract cleanup in `#102`**:
  - `BatchesService.getBatchQrLabel()` MUST compute `traceUrl` dynamically from `env.STOREFRONT_URL` and MUST NOT read from or write to `batches.qrCodeUrl`.
  - Keep `batches.qrCodeUrl` and `BatchDto.qrCodeUrl` unchanged during #83 to preserve issue atomicity against #82 (`ADR-0026`), and execute the forward-only `DROP COLUMN` Contract migration in `#102` once #83 is merged.
  - _[2026-11-21 Amendment (#102)]_: Because the repository is pre-production and `#47` (`BO-03`, `apps/backoffice/src/routes/farming/batches.tsx`) has no consumer code referencing `BatchDto.qrCodeUrl` yet, `#102` proceeds ahead of `#47` so Backoffice cannot accidentally bind to the deprecated field.
- **Standardize a self-contained, stock-free `labelPayload` contract**:
  - `GET /api/v1/batches/:id/qr-label` returns `{ batchCode, traceUrl, labelPayload }` inside `ApiResponseDto<BatchQrLabelDto>`.
  - `labelPayload` contains `{ batchCode, productName, unit, harvestDate, expirationDate, qrValue }` where `qrValue === traceUrl`, `productName` and `unit` come from the joined `products` row, and `harvestDate`/`expirationDate` are ISO-8601 UTC datetime strings formatted to `Asia/Ho_Chi_Minh` display copy by Backoffice `BO-03`.
  - Exclude `status`, `availableQuantity`, `initialQuantity`, and `farms` settings from `labelPayload` so label projection requires only `batches INNER JOIN products` and remains invariant across stock deductions and expiry transitions.
- **Lifecycle-agnostic read projection and staff RBAC**:
  - Restrict `GET /api/v1/batches/:id/qr-label` to `UserRole.FARM_STAFF`, `UserRole.ADMIN`, and `UserRole.SUPER_ADMIN` (`@ApiAuth`), validate `:id` with `zUuidV7()`, and emit `Cache-Control: no-cache`.
  - Allow label retrieval for any existing `batches` row regardless of `batches.status` (`in_stock`, `near_expiry`, `sold_out`, `expired`) or `products.deletedAt`, returning `404 BATCH_NOT_FOUND` only when `:id` does not exist.

## Positive Consequences

- Misconfigured `STOREFRONT_URL` values (`localhost`, HTTP in prod, missing Doppler secret, or trailing path) fail immediately at API boot rather than printing broken QR stickers in production.
- Single `STOREFRONT_URL` source keeps authentication emails (`MailService`) and physical QR stickers aligned on one domain without adding duplicate environment variables.
- One `GET /api/v1/batches/:id/qr-label` call gives `BO-03` (#47) every field needed for a VietGAP thermal label (code, product name, unit, harvest/expiry timestamps, QR URL) without an N+1 `GET /batches/:id` request.
- Remaining purely read-only and status-agnostic preserves strict HTTP safety and repeatability across warehouse reprints, waste write-offs, and recall audits.

## Negative Consequences / Risks

- Production deployments and any test suites calling `parseApiEnvironment({ NODE_ENV: "production", ... })` (including `env.config.spec.ts`) MUST now explicitly provide a valid HTTPS non-loopback `STOREFRONT_URL`.
- Because `labelPayload` omits `status`, Backoffice `BO-03` (#47) must warn or disable routine printing in the UI when a batch is `expired` or `sold_out` using batch state from `GET /batches`.
- `batches.qr_code_url` remained temporarily in `catalog.schema.ts` and `BatchDto` as a deprecated field after `#83` until `#102` executed the Contract cleanup migration (`20261121004301_drop_batches_qr_code_url`).
- If an admin renames `products.name` or `products.unit` via `PATCH /api/v1/products/:id`, subsequent calls to `GET /qr-label` reflect the updated product metadata while `batchCode`, `harvestDate`, `expirationDate`, and `traceUrl` remain immutable.

## Explicit Tradeoffs

- **Reuse `env.STOREFRONT_URL` with production fail-fast over adding `PUBLIC_APP_URL` or checking at request time**: eliminates origin drift with `MailService` and prevents silent runtime sticker defects, at the cost of requiring `STOREFRONT_URL` in every production environment configuration.
- **Self-contained thermal `labelPayload` (`batchCode`, `productName`, `unit`, `harvestDate`, `expirationDate`, `qrValue`) over minimal `{ batchCode, productName }` or rich `farms`+`status` projection**: avoids N+1 backoffice fetches for HSD/unit and prevents `status`/stock churn from breaking determinism, at the cost of requiring `BO-03` to supply static farm branding or read `farms/settings` separately if printed on the header.
- **Compute `traceUrl` dynamically and defer `DROP COLUMN qr_code_url` to `#102` over reading/backfilling `batches.qrCodeUrl` or dropping it inside `#83`**: prevents stale domain lock-in and keeps #83 an atomic non-migrating endpoint task, while `#102` subsequently dropped `qr_code_url` via `20261121004301_drop_batches_qr_code_url`.
- **Status-agnostic `GET /qr-label` over `422` rejection on `expired`/`sold_out` batches**: guarantees repeatability over time and supports recall/waste re-labeling, at the cost of delegating routine print warnings to `BO-03`.
