# Security & Cryptography Standards

## 1. Passwords

- scrypt with `N=16384`, `r=8`, `p=5`, 64-byte key, 16-byte salt.
- Stored as `s1$<salt>$<hash>`: lowercase hex salt and derived key, `s1` the scheme version.
- Passwords, derived keys, salts, and reset tokens stay out of logs.

## 2. Constant-Time Comparison

Compare hashes, HMACs, and tokens with `crypto.timingSafeEqual` behind a length guard; `===` leaks timing:

```ts
if (derivedKey.length !== keyBuffer.length) return false;
return timingSafeEqual(derivedKey, keyBuffer);
```

## 3. Tokens

- Access token: 15 minutes, stateless, held in client memory.
- Refresh token: 7 days, stored in the database as a SHA-256 hash.
- Each refresh rotates: the previous token is invalidated and a new pair is issued.
- A password change or `/auth/logout-all` deletes every active refresh token.
- Verification pins the algorithm, checks issuer and audience, and rejects missing or malformed claims.

## 4. Authorization

Roles come from `UserRole` in `@greenroots/shared`: `guest`, `customer`, `farm_staff`, `sales`, `admin`, `super_admin`. A route with no explicit allow rule is forbidden.

Enforce ownership in the service layer, not only in guards:

- A customer reads and cancels only their own orders and subscriptions.
- `farm_staff` updates batches and farming actions.
- `sales` manages catalog pricing and promotions.
- `admin` manages users and approves waste logs.
- `super_admin` is required for destructive administration.

Derive role and user ID from the verified token, never from the client.

## 5. Input and Output

- The global validation pipe uses `whitelist: true` and `forbidNonWhitelisted: true`.
- Sanitize with DOMPurify or sanitize-html before persistence: strip `<script>`, event handlers, and `javascript:` URIs.
- `dangerouslySetInnerHTML` requires a sanitizer and a documented reason.
- Use parameterized ORM queries; never concatenate user input into SQL.

## 6. Webhooks and Enumeration

- Verify the PayOS HMAC over the raw body with the provider checksum key.
- Reject webhook timestamps older than 5 minutes.
- Deduplicate by provider transaction ID so a replay never double-applies a payment or refund.
- `/auth/forgot-password` returns a generic `200` whether or not the email exists.
- Login failures return one generic invalid-credentials message.
- Rate-limit login, registration, password reset, and OTP endpoints more strictly than the default tier.

## 7. Secrets, PII, and Logging

- Secrets live in environment variables, sourced from Doppler. `.env.example` documents names, never values.
- Run local commands through `doppler run -- <command>`.
- CI passes the `DOPPLER_TOKEN` secret to `.github/actions/setup-environment` with `doppler: "true"`, which masks it before exporting to later steps. Jobs without secrets leave `doppler` at its default.
- Redact access tokens, refresh tokens, passwords, and authorization headers from logs. Mask phone numbers, full addresses, and payment identifiers.
- Production traffic uses TLS; internal calls never disable certificate verification.
