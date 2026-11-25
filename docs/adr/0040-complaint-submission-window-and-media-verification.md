---
status: Accepted
date: 2026-11-25
deciders: ngxccc
---

# 40. Complaint Submission Window and Server-Side Media Metadata Verification

## Context

Issue `#32` introduces `POST /api/v1/orders/:id/complaints` so customers can submit a complaint within 24 hours of order delivery (`BUSINESS_RULES.COMPLAINT_WINDOW_HOURS`) with 1–5 proof images and an optional video (`<= 15s` / `15MB`). Inspecting the existing schema and media pipeline surfaced two foundational constraints:

1. **Missing immutable delivery timestamp**: `orders` in `apps/api/src/database/schemas/order.schema.ts` only tracks `createdAt`, `updatedAt`, and `reservationExpiresAt`. Using `orders.updatedAt` to measure the 24-hour complaint window breaks whenever a subsequent mutation updates the row (for example `DELIVERED -> COMPLETED`, payment reconciliation, or admin updates).
2. **DTO URL validation cannot enforce byte size or video duration**: `zCloudinaryMediaUrl` in `apps/api/src/common/schemas/zod-primitives.ts` validates only the HTTPS `res.cloudinary.com` path, cloud name, resource type, and folder. Likewise, `CloudinaryService.createUploadSignature` (`ADR-0009`) signs only `folder` and `timestamp` based on client-declared `fileSizeBytes`, without enforcing `duration <= 15s` or server-verified byte limits on the uploaded asset.

- **Target modules**: `packages/shared`, `apps/api/src/database/schemas`, `apps/api/src/modules/media`, `apps/api/src/modules/orders`, `apps/api/src/modules/complaints`
- **Issue reference**: `#32` (Epic `#13`; formal spec: `docs/design/complaint-submission-formal-spec.md`)
- **Extends**: `ADR-0009` (Cloudinary signed uploads), `ADR-0032` (anti-enumeration `404`), `ADR-0033` (order FSM)

## Decision

- **Persist immutable `orders.delivered_at` (`timestamptz`)**:
  - Add a nullable `deliveredAt` (`delivered_at`) column to `orders` via a forward-only Drizzle migration.
  - Set `deliveredAt = now` once when `OrdersService.updateOrderStatus` transitions an order to `OrderStatus.DELIVERED`.
  - Allow complaint submission when `orderStatus` is `OrderStatus.DELIVERED` **or** `OrderStatus.COMPLETED`, provided `deliveredAt !== null` and `now - deliveredAt <= BUSINESS_RULES.COMPLAINT_WINDOW_HOURS` (24 hours). Reject earlier/cancelled statuses with `422 ORDER_COMPLAINT_NOT_ELIGIBLE` and expired windows with `422 ORDER_COMPLAINT_WINDOW_EXPIRED`.

- **Anti-enumeration ownership & DB-enforced uniqueness (`409`)**:
  - Return `404 ORDER_NOT_FOUND` when the target order does not exist or belongs to another customer (`ADR-0032`).
  - Do not require `Idempotency-Key` on `POST /api/v1/orders/:id/complaints`; enforce one complaint per order via `complaints_order_id_uidx`, mapping PostgreSQL `23505` (and pre-check) to `409 ORDER_COMPLAINT_ALREADY_EXISTS`.

- **Out-of-transaction Cloudinary Admin API metadata verification**:
  - Keep DTO validation (`zCloudinaryMediaUrl`) for URL structure, `complaints` folder scoping, image count (`1..5`), optional video (`0..1`), and `<= 500` character URL bounds.
  - Add a server-side metadata verification step in `CloudinaryService` calling Cloudinary's Admin Resource API (`GET https://api.cloudinary.com/v1_1/<cloud_name>/resources/<resource_type>/upload/<public_id>`) with Basic Auth (`CLOUDINARY_API_KEY:CLOUDINARY_API_SECRET`) and a bounded timeout (`5s`).
  - Verify all submitted proof images (`bytes <= 5MB`) and the optional proof video (`bytes <= 15MB` and `duration <= 15s`).
  - Execute all Cloudinary HTTP calls **outside** any PostgreSQL transaction/row lock: (1) fast read pre-check (ownership, status, 24h window, duplicate complaint) → (2) Cloudinary Admin API verification → (3) short `INSERT INTO complaints` transaction catching `23505`.
  - Fail closed in production: missing Cloudinary assets (`404`) or violated size/duration constraints return `422 COMPLAINT_MEDIA_INVALID`; Cloudinary `5xx` or network timeouts return `503 Service Unavailable`. When `CLOUDINARY_API_SECRET` is absent in dev/test (`ADR-0009`), skip remote HTTP verification (with DI-mockable verification in automated tests).

## Positive Consequences

- Guarantees an immutable, tamper-proof 24-hour complaint window unaffected by `COMPLETED` transitions or later `orders.updated_at` changes.
- Enforces `<= 5MB` images and `<= 15MB` / `<= 15s` video constraints against actual stored Cloudinary asset metadata rather than trusting client-supplied parameters.
- Prevents database connection pool exhaustion and lock contention by keeping external Cloudinary HTTP calls outside PostgreSQL transactions.

## Negative Consequences / Risks

- Adds external network latency (1–6 Cloudinary Admin API lookups, parallelized) to complaint submission in production.
- Couples production complaint submission availability to Cloudinary Admin API uptime (fail-closed `503` on outage/timeout).

## Explicit Tradeoffs

- **Dedicated `orders.delivered_at` column over `orders.updated_at`**: Adds one nullable column and migration on `orders`, but eliminates window drift across post-delivery state transitions.
- **Cloudinary Admin API verification over URL-only DTO trust**: Accepts external API latency and `503` fail-closed behavior in exchange for cryptographic/server-side enforcement of `<= 15s` / `15MB` / `5MB` constraints.
- **DB unique constraint `409` over Redis `Idempotency-Key`**: Simplifies client retry semantics (consistent with `POST /orders/:id/cancel`) while preserving strict 1-complaint-per-order integrity.
