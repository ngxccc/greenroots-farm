# Concurrency & Locking Standards

## 1. Locking Tier Decision Matrix

| Tier                          | Mechanism                                           | When to Apply                                                                                         | Failure Mode                                                      |
| :---------------------------- | :-------------------------------------------------- | :---------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------- |
| **Tier 1 (DB constraint)**    | `EXCLUDE USING gist`, unique partial index, `CHECK` | Subscription uniqueness, delivery-window allocation, non-negative stock.                              | PostgreSQL `23P01` (exclusion) or `23505` (unique).               |
| **Tier 2 (Pessimistic lock)** | `SELECT ... FOR UPDATE`                             | Batch stock decrement inside a checkout transaction.                                                  | Blocks until the lock is acquired or the statement timeout fires. |
| **Tier 3 (Distributed lock)** | Redlock via Redis                                   | Cross-instance critical sections: flash-sale admission, per-user checkout, payment callback handling. | `409 Conflict` when the lock cannot be acquired.                  |

- The database constraint is the final authority. A distributed lock is an optimization, never the only correctness guarantee.

## 2. Deadlock Prevention: Mandatory Lock Ordering

When locking multiple resources at once (for example five batches in one order):

- **RULE**: sort resource IDs in **ascending lexicographical order** before acquiring locks.
- Acquire all row locks in one statement where possible:

```sql
SELECT id, stock_quantity
FROM batches
WHERE id = ANY($1)
ORDER BY id
FOR UPDATE;
```

- Never lock `user` then `batch` in one code path and `batch` then `user` in another.
- If a lock cannot be acquired within the statement timeout, return `409 Conflict`; do not retry blindly inside the transaction.

## 3. Redlock Configuration & Safety Protocols

- **Key pattern**: `lock:<domain>:<resourceId>`.
  - `lock:checkout:<userId>`
  - `lock:flash_sale:<batchId>`
  - `lock:payment_callback:<providerTransactionId>`
- **TTL formula**: `TTL = max expected execution time + clock drift buffer (500ms)`.
- **Release invariant**: always release in a `finally` block.
- **Ownership check**: release only if the stored lock token matches the current holder.
- **Timeout**: acquisition timeout MUST be shorter than the request timeout; fail fast with `409`.

## 4. Resilience: Fail-Open vs Fail-Closed Policies

| Component                         | Policy          | Behavior                                                                             |
| :-------------------------------- | :-------------- | :----------------------------------------------------------------------------------- |
| Rate limiter / metrics            | **Fail-open**   | If Redis blips, allow the request through. Availability wins.                        |
| Cache reads                       | **Fail-open**   | Fall back to the database and log the cache miss/failure.                            |
| Stock reservation / payments      | **Fail-closed** | If the lock or DB transaction fails, reject with `409` or `500`. Never oversell.     |
| Idempotency store during checkout | **Fail-closed** | If the idempotency record cannot be read or written, reject the mutation with `503`. |
| Subscription pause/cancel         | **Fail-closed** | Reject when the state transition cannot be serialized.                               |

## 5. Idempotency Coordination

- Acquire the idempotency record before the domain transaction; release or finalize it after commit.
- A completed key returns the cached response for 24 hours.
- A key that is in progress returns `409 Conflict` with a retry hint.
- The same key with a different payload returns `422 Unprocessable`.
- Webhooks use the provider transaction ID as the idempotency key; replaying a webhook must not double-apply a payment or refund.

## 6. Flash Sale Guardrails

- Flash sales are admitted through a Redis counter or Redlock keyed by batch ID.
- The authoritative stock decrement still happens under `SELECT ... FOR UPDATE`.
- When the Redis admission counter is unavailable, fall back to the database lock path rather than overselling.
- Expired or `sold_out` batches are rejected before any lock is taken.
