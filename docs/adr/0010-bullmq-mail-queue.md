---
status: Accepted
date: 2026-11-15
deciders: ngxccc
---

# 10. BullMQ Asynchronous Mail Queue

## Context

Verification, password-reset, and invitation emails call an external provider. Sending them inline makes HTTP latency depend on Resend availability and turns a provider outage into a failed registration. Tests also need to assert mail without sending it.

- **Target modules**: `apps/api/src/common/mail`, `apps/api/src/modules/auth`
- **Symbol reference**: the `mail` queue and `IMailDriver` in `apps/api/src`
- **Extracted from**: the pre-split ADR (0002) §4 during the 2026-11-18 ADR split.

## Decision

- Register a BullMQ queue named `mail` with exponential backoff and three retry attempts.
- Expose domain producers on `MailService`: `sendVerificationEmail()`, `sendPasswordResetEmail()`, and `sendStaffInvitationEmail()`.
- Implement `IMailDriver` with two drivers: `ResendMailDriver` for real delivery and `MockMailDriver` for local development and test assertions.
- Consume jobs asynchronously in `MailProcessor` so HTTP requests never wait on the provider.

## Positive Consequences

- Registration and password recovery stay fast when the provider is slow.
- Retries absorb transient provider failures.
- Tests assert captured mail without external side effects.

## Negative Consequences / Risks

- Delivery is eventual; a job can fail permanently after three attempts and needs operational visibility.
- Queue payloads contain recipient addresses, so Redis holds PII.
- Without Redis, mail-producing flows fail unless the driver falls back.

## Explicit Tradeoffs

- **Queue over inline send**: resilience and latency win over immediate delivery confirmation.
- **Driver interface over direct SDK calls**: testability and provider swapping win over one less abstraction.
