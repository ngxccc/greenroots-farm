# Testing & Fixture Standards

## 1. 3-Tier Integration Test Hierarchy

- **Level 1**: `describe("<Domain> Module Integration")`
- **Level 2**: `describe("<HTTP_METHOD> <route> [(<Scope>)]")` or `describe("Database Invariants: <Topic>")`
- **Level 3**: `it("should <expected outcome> when <condition>")`

```ts
describe("Orders Module Integration", () => {
  describe("POST /api/v1/orders/checkout (customer)", () => {
    it("should reserve batch stock when all line items are available", async () => {
      // ...
    });

    it("should reject with 409 when requested quantity exceeds available stock", async () => {
      // ...
    });
  });
});
```

- Tag invariant assertions with `(INV-N)` when the test verifies a documented domain invariant.

## 2. Test Data Factory & Object Mother Patterns

- **Factory pattern**: `create<Entity>(db, overrides)` accepting `Partial<TNewEntity>` and resolving the foreign-key DAG automatically.
  - `createProduct(db, overrides)`
  - `createBatch(db, overrides)`
  - `createOrder(db, overrides)`
- **Object Mother pattern**: domain presets that read clearly at the call site.
  - `ProductMother.standard()`
  - `BatchMother.nearExpiry()`
  - `OrderMother.paid()`
  - `SubscriptionMother.tuesdayDelivery()`
  - `UserMother.admin()`
- **Auth helper**: `createAuthenticatedUser(db, jwtService)` returns `{ user, token, authHeader }`.

## 3. SUT Boundary & Cross-Module Test Isolation

- **Auth module**: call HTTP endpoints directly (`/auth/register`, `/auth/login`) because the auth API is the system under test.
- **Other modules**: DO NOT call `/auth/register` over HTTP. Seed users via `UserMother` / `createAuthenticatedUser` to eliminate coupling.
- Seed the minimum data each test needs. Do not build a full farm, catalog, and order graph when a product and batch suffice.
- Assert observable behavior (HTTP response, persisted state, emitted event), not internal call order.

## 4. OpenAPI Contract-First Type Assertions

- **PROHIBITION**: Never declare local inline response interfaces in tests.
- **MANDATORY**: Import types from the generated schema (`test/generated/api-schema.d.ts`, `components["schemas"]`).
- Regenerate types with `bun run types:sync` after API contract changes.

```ts
import type { components } from "../generated/api-schema";

type OrderResponse = components["schemas"]["OrderResponseDto"];
```

## 5. Database & State Isolation (Schema-per-Worker Pattern)

- **Dynamic schema virtualization**: each parallel worker binds to a dynamically provisioned schema (`test_<timestamp>_<uuid>`) via connection-level search path routing to eliminate cross-worker deadlocks.
- **Extension & catalog resolution**: keep shared extensions, functions, and public catalogs resolvable in the search path hierarchy.
- **Isolated truncation**: reset hooks (`beforeEach` / teardown) truncate only tables in the worker's active schema, using `current_schema()` and driver-provided identifier escaping. Never wipe shared or peer schemas.
- **Cache & queue namespaces**: prefix every Redis key, mutex, and queue name with the worker ID to prevent cross-worker lock deletion or job theft.
- **Background workers**: suppress cron schedulers and asynchronous consumers during standard integration tests to prevent queries against terminating connections.
- **Deterministic teardown**: run `DROP SCHEMA IF EXISTS <worker_schema> CASCADE;` and close broker/database connections when the suite finishes.

## 6. Performance Benchmarks & Stress Testing

- **Location**: `benchmarks/` or `test/benchmarks/`.
- **Execution**: a standard command with optional domain filtering.
- **Metrics**: deterministic output with `task`, `iterations`, `minMs`, `avgMs`, `p50Ms`, `p95Ms`, `p99Ms`, `opsPerSec`.
- **Output**: structured console tables or machine-readable JSON only. No emoji, no decorative banners.

## 7. Test Commands & Placement

| Command                                       | Scope                              |
| :-------------------------------------------- | :--------------------------------- |
| `bun run test:shared`                         | `packages/shared/src/**/*.test.ts` |
| `bun run test:api`                            | `apps/api` test suite              |
| `bun run test`                                | Shared + API tests                 |
| `bun run test:storefront` / `test:backoffice` | App test suites once scaffolded    |

- Unit-test pure domain logic and calculations.
- Integration-test database constraints, transactions, HTTP contracts, and payment/idempotency flows.
- Every bug fix ships with a regression test that fails before the fix.
