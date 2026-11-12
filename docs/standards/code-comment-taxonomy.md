# Code Comment Taxonomy & Standards

## Core Philosophy

> **"Code tells you HOW, comments tell you WHY."**
> Self-documenting code with expressive naming is always preferred over explanatory comments.

## The 4-Tier Comment Taxonomy

| Tier  | Form                                | Scope                                                                            | Rule                                                    |
| :---- | :---------------------------------- | :------------------------------------------------------------------------------- | :------------------------------------------------------ |
| **1** | `/** ... */` TSDoc/JSDoc            | Exported APIs, utilities, shared test helpers, domain services, adapters         | MUST document intent, params, returns, and invariants   |
| **2** | `//` natural prose                  | Non-obvious rationale, security safeguards, concurrency, third-party workarounds | Write only when the reason is not obvious from the code |
| **3** | `// TODO(<ticket-or-context>): ...` | Tracked technical debt                                                           | MUST name the issue, condition, or trigger              |
| **4** | Prohibited                          | Echoing code, dead code, changelog tags, non-English comments                    | NEVER                                                   |

## Tier 1: TSDoc / JSDoc — Public & Shared APIs

**Scope**: exported utilities (`utils/`), shared test helpers (`test/helpers/`, `test/factories/`, `test/mothers/`), custom decorators, pipes, guards, adapters, and complex domain service methods.

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
): number {
  // ...
}
```

## Tier 2: Technical Rationale Comments — Why, Not What

**Scope**: non-obvious architectural decisions, security safeguards, concurrency handling, resilience strategies, and third-party workarounds.

**Format**: concise, natural English prose explaining the technical reason, invariant, or failure mode prevented. A `// WHY:` prefix is optional, not required.

```ts
// Lock the batch rows in ascending ID order so concurrent checkouts cannot deadlock.
const batches = await lockBatches(tx, batchIds.sort());
```

```ts
// Fail open when Redis is unavailable so rate limiting cannot take down checkout.
return true;
```

## Tier 3: `// TODO:` — Tracked Technical Debt

**Rule**: NEVER write a bare `// TODO: fix this`. Every TODO names the context, issue, or condition.

```ts
// TODO(GF-142): Replace the in-memory cache once Redis cluster mode is provisioned.
```

## Tier 4: Banned Comments (Strictly Prohibited)

- **Echoing code**: restating what the code already expresses (`// get product by id`).
- **Excusing poor code**: using comments instead of clean variable/function names.
- **Dead code**: commented-out lines. Git tracks history.
- **Changelog / author tags**: use `git blame` and `git log`.
- **Non-English comments**: all comments in source files MUST be in English.
- **Decorative banners**: no ASCII art, emoji, or separator spam.

## Enforcement Checklist

- [ ] Every exported function, class, and type has Tier 1 TSDoc.
- [ ] Every `TODO` names a ticket or concrete context.
- [ ] No commented-out code or changelog comments.
- [ ] All comments are in English.
- [ ] Tier 2 comments explain a non-obvious reason, not a restatement of code.
