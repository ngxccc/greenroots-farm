# Concurrency & Locking Standards

## 1. Pick the weakest tier that works

| Tier             | Mechanism                                           | Use for                                                                                      | Failure                       |
| :--------------- | :-------------------------------------------------- | :------------------------------------------------------------------------------------------- | :---------------------------- |
| DB constraint    | `EXCLUDE USING gist`, partial unique index, `CHECK` | Subscription uniqueness, delivery windows, non-negative stock                                | `23P01` / `23505`             |
| Pessimistic lock | `SELECT ... FOR UPDATE`                             | Batch stock decrement inside checkout                                                        | Waits, then statement timeout |
| Distributed lock | Redlock over Redis                                  | Cross-instance critical sections: flash-sale admission, per-user checkout, payment callbacks | `409` when not acquired       |

The database constraint is the final authority. A distributed lock is an optimization, never the only correctness guarantee.

## 2. Lock Ordering

Sort resource IDs ascending before acquiring locks, and take them in one statement:

```sql
SELECT id, stock_quantity FROM batches
WHERE id = ANY($1)
ORDER BY id
FOR UPDATE;
```

- Different code paths never reverse the order (`user` then `batch` in one place, `batch` then `user` in another).
- A lock that misses the statement timeout returns `409`; do not retry blindly inside the transaction.

## 3. Redlock

- Keys: `lock:<domain>:<resourceId>` — `lock:checkout:<userId>`, `lock:flash_sale:<batchId>`, `lock:payment_callback:<providerTransactionId>`.
- `TTL = max expected execution time + 500ms clock-drift buffer`.
- Always release in `finally`, and only when the stored token matches the current holder.
- Acquisition timeout is shorter than the request timeout; fail fast with `409`.

## 4. Fail-Open vs Fail-Closed

| Component                         | Policy      | Behavior                                         |
| :-------------------------------- | :---------- | :----------------------------------------------- |
| Rate limiter, metrics             | Fail-open   | A Redis blip lets the request through.           |
| Cache reads                       | Fail-open   | Fall back to the database and log the miss.      |
| Stock reservation, payments       | Fail-closed | Reject with `409` or `500`; never oversell.      |
| Idempotency store during checkout | Fail-closed | Reject the mutation with `503`.                  |
| Subscription pause or cancel      | Fail-closed | Reject when the transition cannot be serialized. |

## 5. Idempotency and Flash Sales

- The lifecycle, Redis keys, and `INV-IDEMP-1..5` live in `api-design-and-error-handling.md` §6. Acquire the record before the domain transaction and finalize it after commit.
- Webhooks key on the provider transaction ID, so a replay never double-applies a payment or refund.
- Flash sales admit through a Redis counter or Redlock keyed by batch ID; the authoritative decrement still happens under `SELECT ... FOR UPDATE`.
- When the Redis admission counter is unavailable, fall back to the database lock path instead of overselling.
- Reject expired or `sold_out` batches before taking any lock.
