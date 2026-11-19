# Code Comment Taxonomy

Code tells you how; comments tell you why. Expressive names replace explanatory comments.

| Tier | Form                                | Scope                                                                    | Rule                                          |
| :--- | :---------------------------------- | :----------------------------------------------------------------------- | :-------------------------------------------- |
| 1    | `/** ... */` TSDoc                  | Exported APIs, utilities, shared test helpers, domain services, adapters | Document intent, params, and returns          |
| 2    | `//` prose                          | Non-obvious rationale, security, concurrency, third-party workarounds    | Only when the reason is invisible in the code |
| 3    | `// TODO(<ticket-or-context>): ...` | Tracked technical debt                                                   | Name the issue, condition, or trigger         |
| 4    | —                                   | Echoing code, dead code, changelog tags, non-English text, decoration    | Never                                         |

## Tier 1

Every exported function, class, and type carries TSDoc, including `test/helpers/`, `test/factories/`, and `test/mothers/`:

```ts
/**
 * Calculates the delivery fee for an order using the farm as the origin.
 *
 * @param distanceKm Road distance from the farm to the customer address.
 * @param subtotalVnd Order subtotal in integer VND.
 * @returns Delivery fee in integer VND; zero when the free-distance threshold is met.
 */
export function calculateShippingFee(
  distanceKm: number,
  subtotalVnd: number,
): number {}
```

## Tier 2

State the decision and the failure it prevents, in one English sentence. A `// WHY:` prefix is optional.

```ts
// Lock batch rows in ascending ID order so concurrent checkouts cannot deadlock.
const rows = await lockBatches(tx, batchIds.sort());

// Fail open when Redis is unavailable so rate limiting cannot take down checkout.
return true;
```

## Tier 3

A TODO names its ticket or a concrete condition:

```ts
// TODO(GF-142): Replace the in-memory cache once Redis cluster mode is provisioned.
```

## Tier 4

Write code and names instead. Git holds history, so no commented-out lines, changelog comments, or author tags. All source comments are English, with no ASCII art, emoji, or separator banners.
