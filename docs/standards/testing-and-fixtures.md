# Testing & Fixture Standards

## 1. Names

Three levels, in this order:

```ts
describe("Orders Integration", () => {
  describe("POST /api/v1/orders/checkout", () => {
    it("reserves batch stock when every line item is available", async () => {});
    it("rejects request when requested quantity exceeds available stock", async () => {});
  });
});
```

- Level 2 is `"<METHOD> <route>"` or a feature group. Level 3 is `"<active verb> <behavior> [when <condition>]"`.
- Start `it()` with a third-person verb (`reserves`, `rejects`, `rotates`), never `should`.
- Keep test IDs, HTTP statuses, and error codes out of titles; assert them in the body.
- Cite invariants as comments (`// Invariant: INV-AUTH-1`), not in the title.

## 2. Factories and Mothers

- Factories: `create<Entity>(db, overrides: Partial<TNewEntity>)` resolve the foreign-key graph themselves (`createProduct`, `createBatch`, `createOrder`).
- Mothers: named domain presets that read at the call site (`ProductMother.standard()`, `BatchMother.nearExpiry()`, `OrderMother.paid()`, `UserMother.admin()`).
- Auth: `createAuthenticatedUser(db, jwtService)` returns `{ user, token, authHeader }`.

## 3. Isolation and SUT Boundary

- The auth module is tested through its HTTP endpoints, because the auth API is the system under test.
- Every other module seeds users through `UserMother` / `createAuthenticatedUser` instead of calling `/auth/register`.
- Seed the minimum graph a test needs: a product and a batch are enough when no order is involved.
- Assert observable behavior (response, persisted row, emitted event), not internal call order.

Each parallel worker owns a dynamically provisioned schema (`test_<timestamp>_<uuid>`) bound through the connection search path:

- Keep shared extensions, functions, and public catalogs resolvable in the hierarchy.
- Reset hooks truncate only tables in the worker's `current_schema()`, with driver-escaped identifiers.
- Prefix every Redis key, mutex, and queue name with the worker ID.
- Suppress cron schedulers and asynchronous consumers during standard integration runs.
- Teardown runs `DROP SCHEMA IF EXISTS <worker_schema> CASCADE` and closes broker and database connections.

## 4. Contracts

- Import response types from `test/generated/api-schema.d.ts` (`components["schemas"][...]`). Local inline response interfaces drift from the real contract.
- Run `bun run types:sync` after a route or DTO change; the pipeline is defined in ADR-0007.

## 5. Harness

The harness in `apps/api/test/` is part of the standard:

- `helpers/database.helper.ts` provisions the per-worker schema from `test_template`, owns isolated pools, and falls back to `createMockDb()` for unit suites.
- `helpers/app.helper.ts` exposes `createTestApp()` / `teardownTestApp()`, prefixes Redis keys with the worker schema, and registers `ZodValidationPipe` plus `GlobalExceptionFilter`.
- `helpers/auth.helper.ts` exposes `createAuthenticatedUser()` and `createAuthenticatedAdmin()`. The admin helper takes an explicit role so the RBAC matrix stays testable.
- `factories/` holds the factories and mothers from §2.

Use the harness instead of ad-hoc scripts or manual endpoint probing.

## 6. Commands

| Command            | Scope                             |
| :----------------- | :-------------------------------- |
| `bun run test`     | Monorepo unit suites (in-memory). |
| `bun run test:api` | `apps/api` unit suite.            |
| `bun run test:e2e` | `apps/api/test/` supertest suite. |
| `bun run test:all` | Unit plus E2E.                    |

- Unit-test pure domain logic and calculations.
- Integration-test database constraints, transactions, HTTP contracts, and payment or idempotency flows.
- Every bug fix ships with a regression test that fails before the fix.

## 7. Benchmarks

- Live in `benchmarks/` or `test/benchmarks/`, run through one standard command with optional domain filtering.
- Report `task`, `iterations`, `minMs`, `avgMs`, `p50Ms`, `p95Ms`, `p99Ms`, `opsPerSec` as a table or JSON, with no decoration.
