---
status: Accepted
date: 2026-11-20
deciders: ngxccc
---

# 29. Two-Step Waste Write-Off Accounting, Review Segregation, and Schema Boundary

## Context

Issue #24 (parent epic #9; Backoffice consumer #48 `BO-03`/`BO-06`; analytics consumer #35; E2E consumer #37) introduces the two-step inventory waste write-off workflow (`UC-27`, `UC-28`) in `apps/api/src/modules/inventory`:

1. `POST /api/v1/waste-logs` to submit a waste write-off proposal (`pending_approval`) with photographic proof.
2. `POST /api/v1/waste-logs/:id/approve` and `POST /api/v1/waste-logs/:id/reject` for independent administrative review and atomic stock deduction.

Reconciling #24 against `apps/api/src/database/schemas/catalog.schema.ts`, `apps/api/src/database/schemas/relations.ts`, `apps/api/src/modules/media/media.interface.ts`, ADR-0005, ADR-0008, ADR-0009, ADR-0025, ADR-0027, and `docs/standards/security-and-cryptography.md` surfaced six architectural tensions:

1. **Issue wording (`increment discarded_quantity`) vs. persisted `batches` schema**: #24 describes approval as _"deduct `available_quantity` + increment `discarded_quantity`"_, whereas `batches` in `catalog.schema.ts` has no `discarded_quantity` column (`initial_quantity`, `available_quantity`, `status`, `qr_code_url`) and `discarded_quantity` already lives on each `waste_logs` row. Adding a cached `batches.discarded_quantity` counter creates split-truth risk against `waste_logs`.
2. **Missing read surface for `BO-06` (#48) and `UC-28` E2E (#37)**: #24 lists only `POST` mutations, yet no open API ticket defines `GET /api/v1/waste-logs` or `GET /api/v1/waste-logs/:id` for the Admin review queue (`apps/backoffice/src/routes/inventory/waste.tsx`).
3. **`waste_logs` schema & constraint gaps**: `waste_logs` currently lacks `CHECK (discarded_quantity > 0)` (ADR-0005), names the reviewer column `approved_by` (inaccurate for rejections), and lacks `rejection_reason` and `reviewed_at`. Moreover, `reviewed_by` uses `ON DELETE SET NULL`, which forbids a `CHECK (reviewed_by IS NOT NULL)` invariant if a staff user row is ever removed.
4. **Zero-stock `BatchStatus` transition & expired batch write-offs**: `BatchStatus` (`in_stock`, `near_expiry`, `sold_out`, `expired`) has no `discarded` enum value. Expired batches in cold storage must still be writable-off, while sellable batches reduced to `0.00` must leave `in_stock`/`near_expiry` listings.
5. **Over-proposal, checkout races, and 4-eyes segregation**: Because `pending_approval` logs never pre-deduct `batches.available_quantity` (ADR-0027 `EDGE-6`), concurrent proposals can exceed remaining stock, concurrent order confirmation (#86) can consume stock before approval, and an `admin`/`super_admin` who can upload to `waste_logs` could otherwise self-approve their own proposal.
6. **Media boundary mismatch**: #24 and #48 mandate image verification (`photo proof`), yet `IMAGE_ONLY_MEDIA_FOLDERS` in `media.interface.ts` omits `"waste_logs"`, allowing video upload signatures, while `tier2-catalog.seeder.ts` seeds an unversioned non-upload Cloudinary path (`/greenroots/waste/...`).

- **Target modules**: `apps/api/src/modules/inventory`, `apps/api/src/modules/media`, `apps/api/src/database/schemas`, `apps/api/src/database/seeds`, `packages/shared`
- **Issue**: #24 (parent epic #9); consumers: #48 (`BO-03`/`BO-06`), #35, #37
- **Spec**: `docs/design/waste-logs-two-step-formal-spec.md`
- **Related**: ADR-0005, ADR-0007, ADR-0008, ADR-0009, ADR-0011, ADR-0012, ADR-0013, ADR-0019, ADR-0025, ADR-0026, ADR-0027, ADR-0028

## Decision

- **Keep `waste_logs` as the Single Source of Truth for discarded quantities**:
  - Do **not** add a `discarded_quantity` column to `batches`. `POST /api/v1/waste-logs/:id/approve` deducts `batches.available_quantity` atomically and marks `waste_logs.status = 'approved'`. Downstream operational analytics (#35) computes waste ratios directly from `waste_logs WHERE status = 'approved'`.
- **Evolve `waste_logs` schema via one forward-only migration**:
  - Rename `waste_logs.approved_by` to `reviewed_by` (`ON DELETE SET NULL`) and update `relations.ts` (`wasteLogsReviewed` / `reviewer`) while the project is pre-production.
  - Add `rejection_reason` (`varchar(500)` nullable) and `reviewed_at` (`timestamp with time zone` nullable).
  - Add DB `CHECK` invariants per ADR-0005: `waste_logs_discarded_quantity_positive` (`discarded_quantity > 0`) and `waste_logs_review_state_consistent` binding `status` strictly to `reviewed_at` and `rejection_reason` nullability (`pending_approval` -> both `NULL`; `approved` -> `reviewed_at IS NOT NULL AND rejection_reason IS NULL`; `rejected` -> both `NOT NULL`). Omit `reviewed_by IS NOT NULL` from the `CHECK` because `ON DELETE SET NULL` may clear `reviewed_by` independently.
- **Include scoped read endpoints (`GET /api/v1/waste-logs`, `GET /api/v1/waste-logs/:id`) inside #24**:
  - Expose paginated list and detail endpoints returning closed `WasteLogDto` projections (nested `batch` + product summary, `reporter`, and `reviewer`).
  - `admin` and `super_admin` view all records; `farm_staff` are restricted to rows where `reportedBy === currentUser.id` (`403 FORBIDDEN` when requesting another reporter's detail row).
- **Enforce 2-step RBAC, 4-eyes segregation, and terminal review semantics**:
  - Permit `farm_staff`, `admin`, and `super_admin` to create proposals (`POST /api/v1/waste-logs`).
  - Restrict `POST /api/v1/waste-logs/:id/approve` (no request body) and `POST /api/v1/waste-logs/:id/reject` (requiring `rejectionReason`) to `admin` and `super_admin`, rejecting self-review (`wasteLog.reportedBy === currentUser.id`) with `403 WASTE_LOG_SELF_REVIEW_FORBIDDEN`.
  - Treat `approved` and `rejected` as strictly terminal; subsequent review attempts with a new `Idempotency-Key` fail with `409 WASTE_LOG_ALREADY_REVIEWED`. Rejected proposals require submitting a new `POST /api/v1/waste-logs` record.
- **Enforce pessimistic row locking, pending-quota protection, and `BatchStatus` zero-stock rules**:
  - Protect all three `POST` endpoints with `@Idempotent({ required: true })` (ADR-0008).
  - Inside `POST /api/v1/waste-logs`, lock the target `batches` row (`FOR UPDATE`), allow `in_stock`, `near_expiry`, and `expired` batches (including when `products.deletedAt IS NOT NULL`), reject `sold_out` (`422 WASTE_LOG_BATCH_NOT_ELIGIBLE`), and reject if `discardedQuantity > batch.availableQuantity - SUM(pending waste_logs for batchId)` (`422 WASTE_LOG_QUANTITY_EXCEEDS_AVAILABLE`).
  - Inside `POST /api/v1/waste-logs/:id/approve`, lock `waste_logs` (`FOR UPDATE`) **before** locking `batches` (`FOR UPDATE`). If `batch.availableQuantity < wasteLog.discardedQuantity` (e.g., due to concurrent FEFO order confirmation #86), roll back and return `409 INSUFFICIENT_STOCK`, leaving the log in `pending_approval` so an admin can explicitly reject it.
  - When approval drives `batches.availableQuantity` to `0.00`, transition `in_stock` or `near_expiry` batches to `BatchStatus.SOLD_OUT`, while preserving `BatchStatus.EXPIRED` on expired batches.
- **Enforce image-only Cloudinary proof (`waste_logs`)**:
  - Extend `IMAGE_ONLY_MEDIA_FOLDERS` in `apps/api/src/modules/media/media.interface.ts` to include `"waste_logs"` (amending ADR-0009 / ADR-0025), validate `1..3` unique HTTPS image URLs via `zCloudinaryMediaUrl({ folder: "waste_logs", resourceTypes: ["image"] })`, and update `tier2-catalog.seeder.ts` to use a valid `/image/upload/v1/waste_logs/...` fixture URL.

## Positive Consequences

- Zero split-truth between `batches` stock counters and `waste_logs` audit records; #35 analytics reads authoritative approved write-offs directly.
- `BO-06` (#48) and Playwright E2E (#37) are unblocked immediately with `GET /api/v1/waste-logs*` in one OpenAPI sync (`bun run types:sync`).
- 4-eyes segregation (`WASTE_LOG_SELF_REVIEW_FORBIDDEN`) prevents any single privileged staff account from creating and approving its own stock write-off.
- `FOR UPDATE` locking plus pending-quota validation eliminates over-proposal spam and negative-stock race conditions with concurrent checkout (#86) and double approvals.
- Enforcing image-only uploads in `waste_logs` eliminates unverified video storage abuse and aligns signature minting with DTO validation.

## Negative Consequences / Risks

- Renaming `approved_by` to `reviewed_by` and adding `rejection_reason` / `reviewed_at` + `CHECK` constraints requires a forward-only Drizzle migration and updating `relations.ts` and `tier2-catalog.seeder.ts`.
- Strict pending-quota validation prevents submitting a replacement waste log on the remaining stock if an earlier `pending_approval` log already reserves that quota until an admin approves or rejects it.
- Transitioning `in_stock`/`near_expiry` batches to `sold_out` when waste reduces `availableQuantity` to `0.00` reuses `sold_out` as "zero available stock", so Backoffice reporting must distinguish sales from write-offs via `waste_logs`.
- Expanding #24 to include `GET /waste-logs*` slightly broadens the ticket beyond write endpoints, accepted as pragmatic to avoid blocking #48 and #37.

## Explicit Tradeoffs

- **`waste_logs` as SSOT over adding `batches.discarded_quantity`**: eliminates dual-write drift and extra `batches` column churn at the cost of aggregating `waste_logs` in #35 analytics.
- **Include `GET /waste-logs*` in #24 over splitting a separate read ticket**: unblocks #48 (`BO-06`) and #37 in one contract sync, at the cost of a slightly larger review diff.
- **Rename `approved_by` -> `reviewed_by` in-place over overloading `approved_by` for rejections**: keeps audit semantics unambiguous pre-production, at the cost of one schema migration.
- **Return `409 WASTE_LOG_ALREADY_REVIEWED` and `409 INSUFFICIENT_STOCK` (preserving `pending_approval`) over `422` or auto-rejecting on stock races**: surfaces concurrent state changes clearly to `BO-06` without silently mutating audit history.
- **Strict pending-quota check on `POST /waste-logs` over checking only raw `availableQuantity`**: stops duplicate/inflated pending queues at submission time, at the cost of requiring admins to clear conflicting pending logs first.
