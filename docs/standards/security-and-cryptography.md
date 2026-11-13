# Security & Cryptography Standards

## 1. Password Hashing (Scrypt)

- Parameters: `N=16384`, `r=8`, `p=5`, key length `64 bytes`, salt `16 bytes`.
- Stored format: `s1$<salt>$<hash>` (hex-encoded salt and 64-byte derived key; `s1` is the scheme version tag).
- Never log passwords, derived keys, salts, or reset tokens.

## 2. Constant-Time Comparison (Timing Attack Defense)

- **RULE**: NEVER use `===` or `==` for hash, HMAC, or token comparisons.
- **MANDATORY**: use `crypto.timingSafeEqual` with a strict length guard:

```ts
if (derivedKey.length !== keyBuffer.length) return false;
return timingSafeEqual(derivedKey, keyBuffer);
```

## 3. JWT & Refresh Token Lifecycle

- **Access token**: 15-minute TTL, stateless, stored in client memory.
- **Refresh token**: 7-day TTL, stored in the database as a SHA-256 hash.
- **Single-use rotation**: each refresh invalidates the previous token and issues a new pair.
- **Global session revocation**: password change or `/auth/logout-all` deletes all active refresh tokens.
- **Verification**: pin the algorithm, verify issuer/audience, and reject tokens with missing or malformed claims.

## 4. RBAC & Ownership Checks

- Roles come from `UserRole` in `@greenroots/shared`: `guest`, `customer`, `farm_staff`, `sales`, `admin`, `super_admin`.
- **Deny by default**: a route without an explicit allow rule is forbidden.
- Enforce ownership at the service layer, not only in route guards:
  - A customer may read or cancel only their own orders and subscriptions.
  - `farm_staff` may update batches and farming actions.
  - `sales` may manage catalog pricing and promotions.
  - `admin` may manage users and approve waste logs.
  - `super_admin` is required for destructive administrative operations.
- Never trust a role or user ID supplied by the client; derive both from the verified token.

## 5. XSS & Input Sanitization

- **Global validation pipe**: `whitelist: true`, `forbidNonWhitelisted: true`.
- **DOMPurify / sanitize-html**: strip `<script>` tags, event handlers, and `javascript:` URIs before persistence.
- **Templates**: no `dangerouslySetInnerHTML` without a sanitizer and a documented reason.
- **SQL**: use parameterized ORM queries. Never concatenate user input into SQL.

## 6. Anti-Replay & Anti-Enumeration

- **PayOS webhook HMAC**: verify the raw-body signature with the provider checksum key.
- **Anti-replay window**: reject webhook timestamps older than 5 minutes.
- **Webhook idempotency**: deduplicate by provider transaction ID; never double-apply a payment or refund.
- **User enumeration protection**: public endpoints such as `/auth/forgot-password` return a generic `200 OK` regardless of whether the email exists.
- **Login errors**: return a generic invalid-credentials message; do not reveal whether the account exists.
- **Rate limiting**: apply stricter limits to login, registration, password reset, and OTP endpoints.

## 7. Secrets, PII & Logging

- Secrets live in environment variables only. Never commit `.env`, keys, or tokens.
- Doppler is the source of truth for those variables. `.env.example` documents names, never values.
- Locally, run commands through the CLI: `doppler run -- bun run dev:api`.
- In CI, pass the `DOPPLER_TOKEN` secret to `.github/actions/setup-environment` with `doppler: "true"`; it masks the value before exporting it to later steps. Jobs that need no secrets leave `doppler` at its default.
- Redact access tokens, refresh tokens, passwords, and authorization headers from logs.
- Mask phone numbers, full addresses, and payment identifiers in logs.
- Production traffic uses TLS. Internal service calls do not disable certificate verification.

## 8. Security Checklist

- [ ] Password hashes use scrypt with the specified parameters.
- [ ] Hash/token comparisons use `timingSafeEqual`.
- [ ] Refresh tokens are hashed at rest and rotated on use.
- [ ] Every route has an explicit authorization rule.
- [ ] Ownership is checked for customer-scoped resources.
- [ ] Payment webhooks verify HMAC, timestamp, and idempotency.
- [ ] Auth endpoints are rate-limited and anti-enumerating.
- [ ] No secrets or PII in logs.
