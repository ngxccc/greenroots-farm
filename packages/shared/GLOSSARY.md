# Glossary — Shared Contracts

Cross-app vocabulary for GreenRoots Farm. Terms here are authoritative for `packages/shared` and MUST be reused by every app.

## Domain Purpose

GreenRoots Farm sells farm-grown produce through a storefront and operates production, packing, delivery, and subscriptions through a backoffice.

## Terms

| Term                | Definition                                                                                                                | Source of truth                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Season              | A planned production cycle for one or more crops, from planning through harvest and archive.                              | `SeasonStatus`                          |
| Batch               | A harvested lot of a product with stock, expiry, and sale status.                                                         | `BatchStatus`                           |
| Farming Action      | A recorded field operation (seeding, watering, fertilizing, weeding, pest control, soil testing, harvesting, correction). | `FarmingActionType`                     |
| Product             | A sellable catalog item sourced from one or more batches.                                                                 | Catalog domain                          |
| Order               | A customer purchase progressing from payment through delivery.                                                            | `OrderStatus`                           |
| Subscription        | A recurring delivery plan with a fixed delivery day.                                                                      | `SubscriptionStatus`, `EnumDeliveryDay` |
| Delivery Day        | A scheduled delivery window: Tuesday, Friday, or both.                                                                    | `EnumDeliveryDay`                       |
| Flash Sale          | A 50% discount applied to batches within 48 hours of expiry.                                                              | `BUSINESS_RULES`                        |
| Loyalty Points      | Points earned at 1% of the value of a delivered order.                                                                    | `BUSINESS_RULES`                        |
| Waste Log           | A recorded loss of stock that requires approval.                                                                          | `WasteLogStatus`                        |
| Complaint           | A customer-reported issue resolved within the 24-hour complaint window.                                                   | `ComplaintStatus`                       |
| Payment Transaction | A payment or refund recorded against an order.                                                                            | `PaymentTransactionType`                |

## Invariants

- Money is stored and calculated as integer VND. Never use floating point for money.
- A batch is sellable only while its status is `in_stock` or `near_expiry` and its expiry timestamp is in the future.
- An order can transition only along the transitions defined by `OrderStatus`; cancelled and delivered are terminal.
- A subscription has exactly one active delivery-day selection at a time.
- Shared enums and constants are defined once in `packages/shared` and imported by apps. Apps MUST NOT redeclare them.
