# Glossary — Shared Contracts

Cross-app vocabulary for GreenRoots Farm. Terms here are authoritative for `packages/shared` and MUST be reused by every app.

## Domain Purpose

GreenRoots Farm sells farm-grown produce through a storefront and operates production, packing, delivery, and subscriptions through a backoffice.

## Terms

| Term                 | Definition                                                                                                                                                                        | Source of truth                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Season               | A planned production cycle for one or more crops, from planning through harvest and archive.                                                                                      | `SeasonStatus`                      |
| Batch                | A harvested lot of a product with stock, expiry, and sale status.                                                                                                                 | `BatchStatus`                       |
| Farming Action       | A recorded field operation (seeding, watering, fertilizing, weeding, pest control, soil testing, harvesting, correction).                                                         | `FarmingActionType`                 |
| Product              | A sellable catalog item sourced from one or more batches.                                                                                                                         | Catalog domain                      |
| Order                | A customer purchase progressing from payment through delivery.                                                                                                                    | `OrderStatus`                       |
| Subscription         | A recurring delivery plan with a fixed delivery day.                                                                                                                              | `SubscriptionStatus`, `DeliveryDay` |
| Delivery Day         | A scheduled delivery window: Tuesday, Friday, or both.                                                                                                                            | `DeliveryDay`                       |
| Flash Sale           | A 50% discount applied to batches within 48 hours of expiry.                                                                                                                      | `BUSINESS_RULES`                    |
| Loyalty Points       | Points earned at 1% of the value of a delivered order.                                                                                                                            | `BUSINESS_RULES`                    |
| Waste Log            | A recorded loss of stock that requires approval.                                                                                                                                  | `WasteLogStatus`                    |
| Complaint            | A customer-reported issue resolved within the 24-hour complaint window.                                                                                                           | `ComplaintStatus`                   |
| Payment Transaction  | A payment or refund recorded against an order.                                                                                                                                    | `PaymentTransactionType`            |
| Idempotency Key      | A UUID header (`Idempotency-Key`) caching mutation responses for 24 hours to prevent double-execution.                                                                            | `ADR-0008`, API standards           |
| Signed Media Upload  | A backend HMAC SHA-256 signature granting direct client uploads to Cloudinary with strict size constraints.                                                                       | `ADR-0009`, `MEDIA_CONSTRAINTS`     |
| Mail Queue           | An asynchronous BullMQ queue dispatching customer emails via Resend or an in-memory test driver.                                                                                  | `ADR-0010`, `MAIL_QUEUE_NAME`       |
| Token Rotation       | A single-use authentication session renewal protocol where each use atomics-deletes the active token via `DELETE ... RETURNING` and mints an opaque 256-bit token.                | `ADR-0015`, `refreshTokens`         |
| Two-Level Revocation | An access-token invalidation strategy in Redis distinguishing single-device logout (`auth:revoked:token:<jti>`) from account-wide security events (`auth:revoked:user:<userId>`). | `ADR-0016`, Redis standards         |
| District Code        | The canonical Ho Chi Minh City district identifier from `HCMC_DISTRICTS`; the only geographic input accepted for an address.                                                      | `ADR-0018`, `HCMC_DISTRICTS`        |
| Staff Audit Log      | An append-only record of every staff create, role change, status change, profile edit, and credential reset.                                                                      | `ADR-0019`, `staff_audit_logs`      |
| Account Profile      | The self-service view of an account's own row: identity, contact fields, role, status, loyalty points, verification flag, and timestamps, excluding credentials and tokens.       | `GET /users/me`, ADR-0020           |
| Identity Summary     | The minimal account shape returned with authentication responses: id, email, full name, role, and status. It is not a profile.                                                    | `userInfoSchema`                    |
| Account Phone        | The contact phone stored on the account itself and editable through the profile surface.                                                                                          | `users.phone`                       |
| Receiver Phone       | The delivery-contact phone stored per saved address, independent of the Account Phone.                                                                                            | `user_addresses.phoneNumber`        |
| Default Address      | The single primary delivery address for an account; automatically assigned to the first saved address and promoted to the most recently created remaining address upon deletion.  | `ADR-0018`, `user_addresses`        |

## Invariants

- Money is stored and calculated as integer VND. Never use floating point for money.
- A batch is sellable only while its status is `in_stock` or `near_expiry` and its expiry timestamp is in the future.
- An order can transition only along the transitions defined by `OrderStatus`; cancelled and delivered are terminal.
- A subscription has exactly one active delivery-day selection at a time.
- Shared enums and constants are defined once in `packages/shared` and imported by apps. Apps MUST NOT redeclare them.
- Mutating commands (checkout, payments, refunds) must be guarded with an `Idempotency-Key`; replays with matching payloads return cached responses, while mismatched payloads are rejected with `422`.
- Media uploads are restricted to $\le 5\text{MB}$ for images and $\le 15\text{MB}$ for videos; oversized uploads are rejected at the signature boundary.
- Access tokens have a 15-minute TTL; refresh tokens have a 7-day TTL and are hashed with SHA-256 before database persistence.
- Single logout invalidates only the calling device's session, whereas password changes, password resets, and `logout-all` trigger instant account-wide revocation in Redis for 15 minutes.
