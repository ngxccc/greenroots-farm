---
status: Accepted
date: 2026-11-27
deciders: ngxccc
---

# 45. Complaint Triage State, Audit Columns, and Staff Projection

## Context

Issue `#246` (split from `#33` alongside `#247`) introduces staff complaint listing (`GET /api/v1/complaints`) and Sales/Admin triage (`PATCH /api/v1/complaints/:id/triage`). Inspecting the existing schema (`complaints` in `apps/api/src/database/schemas/complaint.schema.ts`), shared enums (`ComplaintStatus` in `packages/shared/src/domain.enums.ts`), and `ComplaintDto` surfaced three structural gaps:

1. **Ambiguous `approved` state between triage (`#246`) and resolution (`#247`)**: `ComplaintStatus` previously contained only `pending`, `approved`, and `rejected`. Using `approved` for both Sales triage (`resolution === null`) and Admin financial/replacement resolution (`resolution = 'refund' | 'replacement'`) conflates two distinct lifecycle stages and opens race/overwrite risks if triage can touch an already-resolved complaint.
2. **Missing triage audit trail**: `complaints` only tracks `resolvedBy` (set when `#247` resolves the complaint) and has no `triagedBy`, `triagedAt`, or `triageNote` columns. `staff_audit_logs` (`ADR-0019`) requires a non-null `targetUserId` and is scoped exclusively to staff user mutations.
3. **Customer-only `ComplaintDto` lacks staff operational context**: `ComplaintDto` (`apps/api/src/modules/complaints/dto/complaint.dto.ts`) intentionally omits `resolvedBy` and carries no order or customer fields (`orderCode`, `totalVnd`, `paymentMethod`, `deliveredAt`, `customerName`, `customerPhone`), which Backoffice `BO-05` (`#59`) needs without firing N+1 queries.

- **Target modules**: `packages/shared`, `apps/api/src/database/schemas`, `apps/api/src/modules/complaints`
- **Issue reference**: `#246` (Epic `#13`; formal spec: `docs/design/complaint-triage-formal-spec.md`)
- **Extends**: `ADR-0040` (complaint submission), `ADR-0019` (staff RBAC), `ADR-0033` (`StaffOrderDto` separation pattern)

## Decision

- **Add `ComplaintStatus.TRIAGED = "triaged"` to `@greenroots/shared` and PostgreSQL `complaint_status` enum**:
  - `PATCH /api/v1/complaints/:id/triage` (`#246`) allows `SALES` to transition strictly `pending -> triaged | rejected`, and allows `ADMIN` / `SUPER_ADMIN` to transition `pending -> triaged | rejected` or override `triaged -> rejected`.
  - `triaged` represents a complaint verified by staff as eligible for Admin resolution (`#247`), while `rejected` is terminal.
  - Locks the target `complaints` row (`SELECT ... FOR UPDATE`) inside a transaction before validating the transition and actor role, returning `404 COMPLAINT_NOT_FOUND` when missing and `422 COMPLAINT_INVALID_STATUS_TRANSITION` when the current status cannot transition to the requested target status.

- **Persist triage attribution and rationale on `complaints`**:
  - Add `triagedBy` (`uuid`, nullable, `references(() => users.id, { onDelete: "set null" })`), `triagedAt` (`timestamptz`, nullable), and `triageNote` (`text`, nullable) via a forward-only Drizzle migration (`ADR-0002`).
  - Require a trimmed, HTML-stripped `triageNote` (`5..500` characters) when transitioning to `rejected`; allow optional `triageNote` (`<= 500` characters, stored as `null` when omitted) when transitioning to `triaged`.

- **Enforce `{SALES, ADMIN, SUPER_ADMIN}` RBAC and separate `StaffComplaintDto`**:
  - Guard both `GET /api/v1/complaints` and `PATCH /api/v1/complaints/:id/triage` with `@ApiAuth(UserRole.SALES, UserRole.ADMIN, UserRole.SUPER_ADMIN)` so `super_admin` is never locked out under exact-match `RolesGuard`.
  - Keep customer `ComplaintDto` unchanged and introduce `StaffComplaintDto` hydrated via `orders` and `users` joins (`orderCode`, `orderTotalVnd`, `orderPaymentMethod`, `orderDeliveredAt`, `customerName`, `customerPhone`, `triagedBy`, `triagedAt`, `triageNote`, `resolvedBy`).

## Positive Consequences

- Cleanly separates Sales triage (`pending -> triaged | rejected`) from Admin financial/replacement resolution (`triaged -> approved | rejected` in `#247`), preventing state ambiguity and post-resolution overwrites.
- Guarantees full auditability of who triaged a complaint, when, and why it was rejected.
- Enables single-query Backoffice `BO-05` list rendering and `orderCode`/`phone` search without exposing internal staff attribution to customer DTOs.

## Negative Consequences / Risks

- Requires a PostgreSQL `ALTER TYPE complaint_status ADD VALUE 'triaged'` migration (`ADR-0002`) alongside adding three nullable columns to `complaints`.
- One-shot `pending -> triaged | rejected` triage means a mistaken `rejected` decision cannot be reverted via `/triage` without an explicit Admin override policy in `#247` or a future endpoint.

## Explicit Tradeoffs

- **Dedicated `ComplaintStatus.TRIAGED` enum value over overloading `approved`**: Accepts a forward-only enum migration in exchange for unambiguous FSM boundaries between `#246` and `#247`.
- **Columns on `complaints` over a separate `complaint_audit_logs` table**: Matches `waste_logs` (`ADR-0029`) for single-review workflows while avoiding premature audit-table proliferation.
- **Dedicated `StaffComplaintDto` over extending `ComplaintDto`**: Preserves strict customer/staff boundary (`ADR-0033`) and prevents leaking internal `triagedBy`/`resolvedBy`/`triageNote` fields into customer-facing endpoints.
