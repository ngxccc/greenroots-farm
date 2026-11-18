---
status: Accepted
date: 2026-11-16
deciders: ngxccc
---

# 17. Password and Token Cryptography

## Context

Credential storage must resist offline cracking and timing attacks while staying inside Node's standard library. The system stores three secret classes: user passwords, refresh tokens, and single-use verification or reset tokens. Each has different lifetime and reversibility requirements.

- **Target modules**: `apps/api/src/common/utils`, `apps/api/src/modules/auth`
- **Symbol reference**: `hashPassword`, `verifyPassword`, `generateRefreshToken`
- **Extracted from**: the pre-split ADR (0001) §5 and ADR (0005) during the 2026-11-18 ADR split.

## Decision

- Hash passwords with `node:crypto` scrypt using `N=16384`, `r=8`, `p=5`, a 64-byte key, a 16-byte salt, and the versioned format `s1$<salt>$<hash>`.
- Verify with `timingSafeEqual` behind a strict length check.
- Generate refresh tokens as opaque 256-bit random hex strings and store only their SHA-256 digest.
- Generate verification and reset tokens as 32-byte hex strings and store only their SHA-256 digest, with an explicit expiry column.
- Never log or return a raw password or a raw single-use token.

## Positive Consequences

- Password verification is constant-time and resists offline cracking at the configured cost.
- A database leak does not yield usable refresh, reset, or verification tokens.
- The version prefix allows a future algorithm change without ambiguity.

## Negative Consequences / Risks

- Scrypt cost is per-login CPU; raising parameters later requires rehashing on next login.
- SHA-256 digests are unsalted, which is acceptable only because the inputs are high-entropy random values.
- No pepper or HSM is involved; the entire defence rests on database isolation.

## Explicit Tradeoffs

- **`node:crypto` scrypt over an external KDF library**: zero dependencies win over convenience helpers.
- **Opaque tokens over signed JWTs for single-use flows**: revocability and digest-only storage win over stateless validation.
