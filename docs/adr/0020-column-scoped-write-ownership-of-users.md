---
status: Accepted
date: 2026-11-19
deciders: ngxccc
---

# 20. Column-Scoped Write Ownership of the Users Table

## Context

`users` is a single wide table read by every module and written by several unrelated features. Authentication owns credentials and the verification lifecycle, the self-service profile surface owns `fullName` and `phone`, staff management owns `role` and `status` with a last-super-admin invariant, and loyalty will own `rewardPoints`. The table also carries one-row-per-account identity used by orders, sessions, and audit.

Without a rule, two failure modes appear. Either each module writes any column it can reach, so a profile handler can silently change `status` or `rewardPoints`; or all writes are funnelled through one "user service", which then has to own password hashing, token digests, role invariants, audit logging, and profile sanitization in one module. The second option makes every user-touching feature wait on the same service and turns a single row into a god-module.

ADR-0019 requires the staff surface to enforce the last-super-admin invariant, create invited staff accounts with unusable password hashes and SHA-256 reset tokens, update `fullName`/`phone` alongside `role`/`status`, and write `staff_audit_logs` inside a single atomic transaction (`INV-STAFF-4`). Purely decoupled cross-service calls without a shared transaction would break audit and creation atomicity.

- **Target modules**: `apps/api/src/modules/auth`, `apps/api/src/modules/users`, `apps/api/src/database/schemas`
- **Issue**: #75, #77
- **Related**: ADR-0011, ADR-0014, ADR-0016, ADR-0019
- **Spec**: `docs/design/self-service-profile-formal-spec.md`, `docs/design/staff-rbac-and-session-revocation-formal-spec.md`

## Decision

Split write ownership of `users` into disjoint column groups. A module may write only its own group.

| Group                    | Columns                                                                                                                            | Owner                                                             |
| :----------------------- | :--------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------- |
| Identity and credentials | `email`, `password`, `emailVerified`, `verificationToken`, `verificationExpiresAt`, `resetPasswordToken`, `resetPasswordExpiresAt` | `AuthService`                                                     |
| Profile                  | `fullName`, `phone`                                                                                                                | `ProfileService` (`modules/users`)                                |
| Role and status          | `role`, `status`                                                                                                                   | `StaffService` (`modules/users`, #77)                             |
| Loyalty                  | `rewardPoints`                                                                                                                     | `OrdersService` (`#84` deduction; `#29`/`#86` refund/award)       |
| Lifecycle                | `deletedAt`                                                                                                                        | Unassigned; the deletion feature claims it before its first write |
| Timestamps               | `createdAt`, `updatedAt`                                                                                                           | Database defaults and `$onUpdate`                                 |

Rules that follow from the split:

- A cross-group change calls the owning service instead of issuing a direct `UPDATE`. Suspending a user and revoking sessions stays inside `StaffService`; verifying an email and hashing/issuing reset tokens stays inside `AuthService`.
- **Cross-group transaction orchestration (2026-11-19 amendment for #77)**: When a single use case MUST mutate multiple column groups atomically (specifically staff creation and admin staff updates alongside `staff_audit_logs`), the orchestrating service (`StaffService`) opens `db.transaction` and invokes explicit tx-scoped collaborator methods exposed by each owning service (for example `AuthService.createStaffIdentity(tx, ...)` / `AuthService.issueStaffResetToken(tx, ...)` and `ProfileService.updateProfileWithinTx(tx, ...)`), rather than issuing raw cross-group SQL writes directly. Direct cross-group writes outside the owning service remain forbidden.
- Every read uses an explicit projection. `select *`, row spreading, and "return the entity then delete secrets" are forbidden, because the table carries password and token columns.
- Every read and write on `users` filters `deletedAt IS NULL` unless the operation is explicitly about deleted rows.
- A new column requires the owning module to be named in this table before the first write. Extending a group is an amendment to this ADR, not an implicit right.
- Within a group, the owner enforces its own invariants inside one transaction.

## Positive Consequences

- Each feature stays atomic: #75 touches only profile columns, #77 coordinates across identity, profile, and role/status without duplicating password hashing or token-digest logic.
- Credential and token columns cannot leak through profile or staff projections, because every projection is a closed list rather than a filtered entity.
- Reviewers can check a mutation against a short column list instead of re-reading the whole module.
- Authentication keeps sole ownership of password cryptography and token lifecycles while supporting atomic staff provisioning.

## Negative Consequences / Risks

- Two modules can still write the same row concurrently on separate endpoints (for example self-service profile edit vs admin edit); updates converge per column, with no cross-group optimistic locking.
- The rule is a convention enforced by review, not by the type system or the database. A new contributor can violate it without a failing build.
- `UsersModule` imports `AuthModule` to call tx-scoped credential helpers, creating a directed dependency edge (`AuthModule` must never import `UsersModule`).
- Unassigned group (`deletedAt`) remains a known gap until account deletion lands (`rewardPoints` claimed by `OrdersService` in `ADR-0031`).

## Explicit Tradeoffs

- **Tx-scoped collaborators over direct cross-group SQL**: preserving single-transaction atomicity (`INV-STAFF-4`) without duplicating `AuthService` cryptography or `ProfileService` column ownership wins over forbidding all cross-group transactions.
- **Explicit projections over a shared row mapper**: leak prevention at the query wins over the convenience of one mapper reused everywhere.
- **Convention over enforcement**: a documented rule and a review checklist win over a repository abstraction that would reintroduce single-writer coupling.
