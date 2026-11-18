---
status: Accepted
date: 2026-11-18
deciders: ngxccc
---

# 19. Staff RBAC, Last-Super-Admin Invariant, and Admin Audit

## Context

UC-05 covers the staff lifecycle: create or invite an account, assign a role, suspend or reactivate, and reset credentials. The system has no record of who granted `super_admin`, no guard against removing the last active super admin, and no audit trail. Suspension also needs to terminate sessions immediately rather than waiting for refresh-token expiry.

`UserRole` already contains `farm_staff`, `sales`, `admin`, `super_admin`, `customer`, and `guest`; `UserStatus` contains `active`, `inactive`, and `suspended`. `createAuthenticatedAdmin()` in the test helpers hardcodes `super_admin`, so RBAC tests need an explicit role parameter.

- **Target modules**: `apps/api/src/modules/users`, `apps/api/src/database/schemas`, `packages/shared`
- **Issue**: #77 (split from #18)
- **Related**: ADR-0014, ADR-0016, ADR-0017

## Decision

- Split staff authority into two roles:
  - `admin` may read the staff directory and edit `fullName` and `phone`.
  - `super_admin` may additionally create accounts, change `role` and `status`, and trigger credential resets.
- Reject `customer` and `guest` as staff roles with `422 STAFF_ROLE_INVALID`.
- Provision invited staff through the existing reset-password token flow with a 24-hour TTL. Store a random unusable password hash, `emailVerified = false`, and a SHA-256-digest reset token. Never accept, log, or email a plaintext password, and never return the raw token.
- Make `POST /auth/reset-password` set `emailVerified = true` when a valid reset token is consumed, so an invited staff member can log in after choosing a password.
- Forbid self-modification: no actor may change their own `role` or `status`, returning `422 SELF_MODIFICATION_FORBIDDEN`.
- Enforce `INV-STAFF-1`: demoting or suspending the last active super admin returns `422 LAST_SUPER_ADMIN`. The check locks the active super-admin rows in the same transaction so two concurrent requests cannot both succeed.
- On suspend or deactivate, delete every `refresh_tokens` row for the target in the same transaction and then call `revokeUser(userId, 900)`. The residual access-token window is at most 15 minutes because `revokeUser` is fail-open.
- Add `staff_audit_logs` with actor, target, action, before/after JSONB, and timestamp. A trigger rejects UPDATE and DELETE, following the `farming_logs` precedent. Every create, role change, status change, profile edit, and credential reset writes exactly one row.
- Keep per-permission granularity out of scope; roles are the only authorization unit.

## Positive Consequences

- `INV-STAFF-1` makes locking the farm out of administration impossible through the API.
- Every privilege change is attributable after the fact.
- Suspension takes effect on refresh within one transaction and on access tokens within 15 minutes.
- Invited staff never receive a reusable plaintext credential.

## Negative Consequences / Risks

- The last-super-admin check adds a row lock on the hottest administrative path.
- The audit table grows without bound until a retention policy exists.
- A fail-open Redis outage extends the residual access-token window for suspended staff.
- Role-only authorization cannot express narrower permissions later without a new model.

## Explicit Tradeoffs

- **Reuse of reset tokens over a `must_change_password` column**: one credential flow wins over a second schema flag.
- **Append-only audit table over structured logging**: queryable, transactional audit wins over log-pipeline convenience.
- **Role-based over permission-based authorization**: shipping UC-05 now wins over a finer model with no current consumer.
