---
status: Accepted
date: 2026-11-16
deciders: ngxccc
---

# 14. Account Lifecycle and Email Verification Gate

## Context

The predecessor project modeled verification as a `PENDING_VERIFICATION` status. GreenRoots Farm freezes `UserStatus` in `@greenroots/shared` as `active`, `inactive`, and `suspended`, and stores verification separately in `users.emailVerified`. Reusing the old status would violate the shared enum and the database constraint. Login must still refuse accounts that never confirmed their email.

- **Target module**: `apps/api/src/modules/auth`
- **Symbol reference**: `AuthService.register`, `AuthService.verifyEmail`, `AuthService.resendVerification`
- **Extracted from**: the pre-split ADR (0005) §1 during the 2026-11-18 ADR split.

## Decision

- Registration inserts `status: active`, `emailVerified: false`, and an Scrypt-hashed password in the `s1$<salt>$<hash>` format.
- Login requires `emailVerified === true`; an unverified account receives `403` with `AUTH_EMAIL_NOT_VERIFIED`.
- Verification validates a 32-byte hex token against its SHA-256 digest in `users.verificationToken` and requires `verificationExpiresAt > NOW()`, then sets `emailVerified = true`. _(Amended by ADR-0019: `AuthService.resetPassword` also sets `emailVerified = true` when an invited staff member consumes a valid reset token.)_
- Re-registration with an existing unverified email returns `409 AUTH_EMAIL_ALREADY_EXISTS` to prevent account-takeover races.
- Re-sending uses only `POST /auth/resend-verification`, with a 60-second per-email cooldown and rate limiting.
- Business account state and verification state stay separate columns.

## Positive Consequences

- The shared `UserStatus` enum remains unchanged.
- Unverified accounts exist but cannot authenticate.
- Resending is explicit and rate-limited instead of implicit in registration.

## Negative Consequences / Risks

- A user who loses the verification email must wait for the cooldown before retrying.
- Two columns describe account state, so queries must check both where relevant.

## Explicit Tradeoffs

- **Separate verification boolean over a status value**: compatibility with frozen shared enums wins over a single state column.
- **Reject re-registration over silent resend**: takeover resistance wins over convenience.
