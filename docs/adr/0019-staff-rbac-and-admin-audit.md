---
status: Accepted
date: 2026-11-19
deciders: ngxccc
---

# 19. Staff RBAC, Last-Super-Admin Invariant, and Admin Audit

## Context

UC-05 covers the staff lifecycle: invite or create an account, assign a role, edit contact profile fields, suspend or reactivate, and trigger credential resets. The system has no record of who granted `super_admin`, no guard against removing the last active super admin, no audit trail, and no transactional session revocation when a staff member is suspended or demoted.

`UserRole` already contains `farm_staff`, `sales`, `admin`, `super_admin`, `customer`, and `guest`; `UserStatus` contains `active`, `inactive`, and `suspended`. `createAuthenticatedAdmin()` in `apps/api/test/helpers/auth.helper.ts` defaults to `super_admin`, so RBAC tests must support an explicit role parameter without breaking existing callers.

- **Target modules**: `apps/api/src/modules/users`, `apps/api/src/modules/auth`, `apps/api/src/modules/mail`, `apps/api/src/database/schemas`, `packages/shared`
- **Issue**: #77 (split from #18); backoffice consumer: #41
- **Spec**: `docs/design/staff-rbac-and-session-revocation-formal-spec.md`
- **Related**: ADR-0014, ADR-0015, ADR-0016, ADR-0017, ADR-0020

## Decision

- Split staff authority into two roles:
  - `admin` may read the staff directory (`GET /api/v1/admin/users`) and edit `fullName` and `phone` (`PATCH /api/v1/admin/users/:id`).
  - `super_admin` may additionally create staff accounts (`POST /api/v1/admin/users`), change `role` and `status` (`PATCH /api/v1/admin/users/:id`), and trigger credential resets (`POST /api/v1/admin/users/:id/reset-credentials`).
- Enforce a strict staff-only boundary on `/api/v1/admin/users`:
  - `GET /api/v1/admin/users` scopes results strictly to `{farm_staff, sales, admin, super_admin}` and rejects `customer`/`guest` role filters with `422 STAFF_ROLE_INVALID`.
  - `POST` and `PATCH` reject `customer`/`guest` role assignments with `422 STAFF_ROLE_INVALID`.
  - `PATCH` and `POST .../reset-credentials` treat missing, soft-deleted, or non-staff (`customer`/`guest`) target IDs as `404 STAFF_NOT_FOUND`.
- Provision invited staff and credential resets through tx-scoped `AuthService` helpers (`createStaffIdentity`, `issueStaffResetToken`) per ADR-0020, generating a 32-byte random reset token stored only as a SHA-256 digest with a 24-hour TTL. `POST /admin/users` writes a random unusable scrypt password hash and `emailVerified = false`. Never accept, log, or email a plaintext password, and never return the raw token.
- Send staff invitation and credential-reset emails via dedicated `MailService` templates pointing to `BACKOFFICE_URL` (`#41`) with 24-hour expiry copy, rather than the customer `STOREFRONT_URL` 15-minute template. On `POST /admin/users`, mail enqueue is best-effort after transaction commit (logged on failure) so a broker outage does not return `500` after persisting the user and causing `409` on retry; `POST .../reset-credentials` propagates enqueue failures.
- Update `AuthService.resetPassword` (`POST /api/v1/auth/reset-password`) to set `emailVerified = true` when a valid reset token is consumed, and reject `suspended` or `inactive` accounts with `403 AUTH_ACCOUNT_SUSPENDED` (with `AuthService.forgotPassword` likewise skipping `inactive` accounts).
- Forbid self-modification (`INV-STAFF-2`): no actor may change their own `role` or `status`, or call `reset-credentials` on themselves, returning `422 SELF_MODIFICATION_FORBIDDEN`.
- Enforce `INV-STAFF-1`: demoting or suspending/deactivating the last active `super_admin` returns `422 LAST_SUPER_ADMIN`. The guard locks active `super_admin` rows (`SELECT ... FOR UPDATE`) inside the mutation transaction before locking/updating the target so two concurrent requests cannot both succeed.
- Enforce immediate session revocation (`INV-STAFF-3`): when a mutation transitions `status` to `suspended` or `inactive`, changes `role`, or resets credentials, delete all `refresh_tokens` rows for the target inside the same transaction and call `revokeUser(userId, 900)` after commit. Because `JwtAuthGuard` and `RolesGuard` read claims from stateless 15-minute access tokens and `revokeUser` is fail-open (ADR-0016), revoking on role change closes the stale-role privilege window while bounding the Redis-outage residual window to at most 15 minutes.
- Add `staff_audit_logs` with `id`, `actorId` (`ON DELETE RESTRICT`), `targetUserId` (`ON DELETE RESTRICT`), `action` (`staff_audit_action` enum), `before` JSONB, `after` JSONB (`StaffAuditSnapshot` in `@greenroots/shared`, excluding credentials/tokens), and `createdAt`. A forward-only trigger (`trg_immutable_staff_audit_logs`) rejects `UPDATE` and `DELETE`, following the `farming_logs` precedent. Every effective create, profile edit, role change, status change, combined update (`staff.update`), and credential reset writes exactly one row in the mutation transaction; no-op `PATCH` payloads skip both row update and audit noise.
- Keep per-permission granularity and audit-log read endpoints out of scope for #77.

## Positive Consequences

- `INV-STAFF-1` makes locking the farm out of administration impossible through the API.
- Every privilege, profile, status, and credential change is tamper-evidently attributable after the fact.
- Suspension, deactivation, credential reset, and role demotion invalidate refresh sessions atomically and expire active JWTs within one Redis guard check (or at most 15 minutes during a Redis outage).
- Invited staff never receive a reusable plaintext credential and land directly on Backoffice.

## Negative Consequences / Risks

- Locking active `super_admin` rows serializes concurrent role/status mutations on super admins.
- `staff_audit_logs` grows without bound until a retention/archival policy is introduced.
- A fail-open Redis outage extends the residual access-token window up to 15 minutes for suspended or demoted staff.
- Revoking sessions on any role change forces re-login even on promotions.

## Explicit Tradeoffs

- **Reuse of reset tokens over a `must_change_password` column**: one credential flow wins over a second schema flag and forced-change login gate.
- **Revoke sessions on role change over status-only revocation**: closing the 15-minute stale-JWT privilege escalation window after demotion wins over keeping promoted users logged in.
- **Strict staff-only boundary over customer promotion**: upholding the Non-goal of not managing customers via admin routes and preventing customer PII exposure wins over one-click promotion of existing customer accounts.
- **Single `staff.update` row per multi-field `PATCH` over multiple rows**: keeping 1:1 operation-to-audit-row parity and clean `before`/`after` snapshots wins over splitting a single HTTP mutation into synthetic sub-events.
- **Best-effort invite enqueue after commit over post-commit HTTP 500**: preventing unretryable `500` -> `409` UX loops during transient queue blips wins over synchronous delivery confirmation.
