---
status: Accepted
date: 2026-11-19
deciders: ngxccc
---

# 23. Append-Only Farming Logs, Correction Linkage, and Media Boundary

## Context

Issue #20 (parent epic #8; downstream consumer #21 `GET /api/v1/trace/:batchCode`; Backoffice consumer `BO-02`) exposes the append-only cultivation log API under `apps/api/src/modules/farms`: `POST /api/v1/seasons/:id/logs` and `GET /api/v1/seasons/:id/logs`. While migration `20261113020004_immutable_farming_logs` (`apps/api/docs/adr/0001-append-only-farming-logs.md`) already enforces row immutability via `trg_immutable_farming_logs`, reconciling #20 against the codebase surfaced five architectural tensions that require durable commitments:

1. **Missing correction-linkage schema & same-season enforcement**: `farming_logs` in `apps/api/src/database/schemas/farm.schema.ts` lacks a `corrects_log_id` column, self-referential FK, and DB-level same-season constraint. Because `trg_immutable_farming_logs` rejects all `UPDATE` and `DELETE` statements, any column/constraint mistake or correction-graph dead-end is costly to repair.
2. **Correction graph semantics**: If a `correction` log itself contains an error, or if multiple follow-up observations amend a single field entry, locking a target log to a single 1-to-1 correction creates an unrecoverable dead-end on an append-only table.
3. **Season lifecycle gating & concurrency**: ADR-0022 allows `planning` seasons to hold pre-activation logs (guarding `DELETE /api/v1/seasons/:id` with `409 SEASON_NOT_DELETABLE`), marks `completed` seasons terminal for metadata edits, and relies on `plots -> seasons` `FOR UPDATE` locking. Concurrent `POST /seasons/:id/logs` vs `PATCH`/`DELETE /seasons/:id` requests can race on `seasons.status` unless serialized in a compatible lock hierarchy.
4. **Media URL validator mismatch**: `isCloudinaryImageUrl` in `apps/api/src/common/schemas/zod-primitives.ts` accepts only `/image/upload/` without folder scoping, whereas `POST /api/v1/media/upload-signature` (`apps/api/src/modules/media/media.interface.ts`) permits both `image` and `video` uploads under the `farming_logs` folder.
5. **Action timestamp integrity**: `farming_logs` has only `logged_at` (`timestamptz`) and no separate `created_at` server audit column, so accepting client-supplied `loggedAt` values would allow untraceable backdating in VietGAP logs.

- **Target modules**: `apps/api/src/modules/farms`, `apps/api/src/database/schemas`, `apps/api/src/common/schemas`, `packages/shared`
- **Issue**: #20 (parent epic #8; downstream consumer #21)
- **Spec**: `docs/design/farming-logs-formal-spec.md`
- **Related**: ADR-0005, ADR-0008, ADR-0009, ADR-0011, ADR-0012, ADR-0013, ADR-0022, `apps/api/docs/adr/0001-append-only-farming-logs.md`

## Decision

- **Composite same-season FK & `CHECK` constraints for `corrects_log_id`**:
  - Add nullable `corrects_log_id uuid` to `farming_logs` via a forward-only schema migration (pure DDL without row backfill so `trg_immutable_farming_logs` is not tripped), paired with `UNIQUE (id, season_id)` (`farming_logs_id_season_id_uidx`), composite self-FK `(corrects_log_id, season_id) REFERENCES farming_logs(id, season_id) ON DELETE RESTRICT`, `CHECK (corrects_log_id IS NULL OR action_type = 'correction')`, `CHECK (corrects_log_id IS NULL OR corrects_log_id <> id)`, and partial index `farming_logs_corrects_log_id_idx` (`WHERE corrects_log_id IS NOT NULL`).
  - Keep `correctsLogId` optional when `actionType = 'correction'` (per #20 acceptance criteria) and forbid it for all other action types. Pre-validate target existence and same-season ownership in `FarmingLogsService` to return `422 FARMING_LOG_CORRECTION_TARGET_INVALID` rather than leaking raw `23503`/`23514` errors.
- **Append-only DAG correction model & bidirectional read linkage**:
  - Allow any `correction` entry to reference any existing log in the same season (including another `correction`) and allow multiple `correction` entries to reference the same target log. Cycles are impossible because FK targets must already exist and self-references are forbidden.
  - Project bidirectional correction linkage on `GET /api/v1/seasons/:id/logs`: include forward `correctsLog` summary (`id`, `actionType`, `description`, `loggedAt`) and reverse `correctedBy` list (`id`, `loggedAt`, `staff: { id, fullName }`) fetched via a single batched `WHERE corrects_log_id IN (...)` query per page, defaulting to `loggedAt:desc` with `id:desc` tie-breaker.
- **Phase-scoped action gate & `FOR SHARE` lock ordering**:
  - Gate `actionType` by persisted `SeasonStatus`: `planning` allows `soil_testing` and `correction`; `active` and `harvested` allow all `FarmingActionType` values; `completed` allows only `correction` (preserving post-close VietGAP audit/recall corrections while blocking new cultivation operations).
  - Lock the parent `seasons` row with `SELECT ... FROM seasons WHERE id = :seasonId FOR SHARE` inside the `POST /api/v1/seasons/:id/logs` transaction before validating status, checking `correctsLogId`, and inserting into `farming_logs`. This respects `seasons -> farming_logs` lock order, permits concurrent log writes by multiple staff on the same season, and serializes cleanly against `PATCH`/`DELETE /seasons/:id` (`FOR UPDATE`).
- **Folder- and resource-scoped Cloudinary media boundary & server-clock `loggedAt`**:
  - Introduce `isCloudinaryMediaUrl` / `zCloudinaryMediaUrl` in `apps/api/src/common/schemas/zod-primitives.ts` parameterized by `folder` and `resourceTypes`, requiring `https://res.cloudinary.com/<CLOUDINARY_CLOUD_NAME>/(image|video)/upload/(v<digits>/)?farming_logs/<asset>` with no query string, fragment, port, userinfo, `..` traversal, or intermediate transformation segments, capped at 3 unique URLs per log.
  - Keep `logged_at` strictly server-assigned (`NOW()` / DB default) and forbid client-supplied timestamps until a future offline-sync ADR introduces a separate server-owned `created_at` column.
- **Optional `Idempotency-Key` & service-direct Drizzle pattern**:
  - Apply `@Idempotent()` (`required: false`) on `POST /api/v1/seasons/:id/logs` so mobile/backoffice clients sending `Idempotency-Key` get 24h replay protection without breaking callers that omit the header.
  - Retain the `FarmsModule` service-direct `DrizzleDB` pattern (`FarmingLogsService`) and verify `403 FARMING_LOG_IMMUTABLE` across Drizzle mutations (`db.update`/`db.delete`) and `GlobalExceptionFilter` mapping.

## Positive Consequences

- Same-season integrity and `correction`-only linkage hold unconditionally at the database level per ADR-0005, even for out-of-band SQL or seed writers.
- Staff can amend mistaken `correction` entries without dead-ends, and paginated UIs display "corrected" indicators accurately even when the original log and correction sit on different pages.
- Concurrent `POST /seasons/:id/logs` writes execute in parallel (`FOR SHARE`) while never racing past `DELETE /seasons/:id` or `-> completed` transitions (`FOR UPDATE`).
- Both images and videos uploaded via `/api/v1/media/upload-signature` (`farming_logs`) validate cleanly while arbitrary hosts, transformation abuse, and cross-folder URLs (`complaints`, `products`) are blocked at the DTO boundary.

## Negative Consequences / Risks

- Adding `UNIQUE (id, season_id)` adds a second unique index on `farming_logs` alongside the primary key to satisfy PostgreSQL composite foreign-key rules.
- Because `planning` rejects `seeding` and `watering` with `422`, staff must transition a season to `active` before logging field cultivation beyond `soil_testing`.
- Disallowing intermediate Cloudinary transformation segments in stored URLs requires frontend consumers to construct resized delivery URLs at render time from the canonical asset path.
- Field logs entered after an offline delay carry the server synchronization time (`logged_at`) rather than a client-asserted field timestamp.

## Explicit Tradeoffs

- **Composite FK `(corrects_log_id, season_id)` over service-only check or `BEFORE INSERT` trigger**: database-enforced same-season referential integrity wins over omitting a composite unique index and avoids hiding linkage rules inside trigger code.
- **Append-only DAG over 1-to-1 linear supersede**: recoverability when a `correction` itself contains a typo wins over enforcing `UNIQUE (corrects_log_id)`.
- **`planning` restricted to `soil_testing`/`correction` and `completed` allowing `correction` over binary all-or-nothing gating**: balances ADR-0022 pre-activation soil tests and post-close VietGAP audit corrections against preventing out-of-phase cultivation entries.
- **`FOR SHARE` on `seasons` over `FOR UPDATE` or unlocked reads**: allows concurrent staff logging on the same active season while still preventing TOCTOU races against `DELETE`/`PATCH` on `seasons`.
- **Server-only `loggedAt` over client-supplied action dates**: tamper-evidence for VietGAP traceability wins over offline backdating while `farming_logs` has a single timestamp column.
