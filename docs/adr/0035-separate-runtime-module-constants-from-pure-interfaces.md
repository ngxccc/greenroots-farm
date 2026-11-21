---
status: Accepted
date: 2026-11-21
deciders: ngxccc
---

# 35. Separate Runtime Module Constants from Pure TypeScript Interfaces

## Context

`ADR-0011` (`docs/adr/0011-dto-schema-co-location-and-pure-domain-interfaces.md`) intended `.interface.ts` files to stay compile-time-only with zero runtime bundle cost, yet explicitly assigned `business constants` to `<module>.interface.ts` (mirrored in `docs/standards/api-design-and-error-handling.md` §8). That internal contradiction caused seven API modules (`catalog`, `farms`, `inventory`, `mail`, `media`, `orders`, and `orders/shipping`) to emit runtime JavaScript (`export const`, frozen transition maps, whitelisted sort tuples, and DI `Symbol` tokens) from `*.interface.ts` files, forced runtime `dto/` schemas to import from `.interface.ts`, duplicated shared primitives (`CROCKFORD_BASE32_ALPHABET` and `VIETNAM_TIMEZONE`) across `inventory` and `orders`, and left `DatabaseErrorDetails` inside `apps/api/src/common/constants/error.constant.ts`.

- **Target modules**: `apps/api/src/common/constants`, `apps/api/src/common/utils`, `apps/api/src/modules/*`
- **Issue**: `#110`
- **Related**: `ADR-0011` (partially superseded on module constants placement), `docs/standards/api-design-and-error-handling.md` §8

## Decision

- **Keep `*.interface.ts` strictly compile-time-only (`ADR-0011` partially superseded)**:
  - `<module>.interface.ts` may contain only `export interface`, `export type`, and `import type` declarations, emitting zero runtime JavaScript statements when transpiled.
  - Modules that retain no standalone domain types or interfaces after extracting runtime constants (`farms`, `inventory`) omit `<module>.interface.ts` altogether rather than keeping empty or pass-through files.
- **Move module runtime values and derived tuple unions to `<module>.constant.ts`**:
  - Move all module-scoped `export const` values, regexes, frozen transition maps, DI `Symbol` tokens (`MAIL_DRIVER_TOKEN`, `SHIPPING_DRIVER_TOKEN`), and whitelisted const tuples (including `STAFF_SORT_OPTIONS` from `users/dto/list-staff-query.dto.ts`) into `apps/api/src/modules/<module>/<module>.constant.ts` (and `shipping.constant.ts` for the shipping sub-module).
  - Keep derived union types (`(typeof CONST)[number]`) co-located with their source tuple inside `<module>.constant.ts` (consistent with `IdempotencyStatus` in `apps/api/src/common/constants/idempotency.constant.ts` and `StaffRole` in `packages/shared/src/business.constants.ts`) so `*.constant.ts` stays self-contained for typed maps such as `FOLDER_PERMISSIONS` without circular imports back to `*.interface.ts`.
  - Keep `*.constant.ts` free of standalone `export interface` declarations; move `DatabaseErrorDetails` from `apps/api/src/common/constants/error.constant.ts` to `apps/api/src/common/utils/error.util.ts`.
- **Consolidate cross-module technical constants in `apps/api/src/common/constants/`**:
  - Move `VIETNAM_TIMEZONE` to `apps/api/src/common/constants/time.constant.ts` and `CROCKFORD_BASE32_ALPHABET` to `apps/api/src/common/constants/encoding.constant.ts`, deduplicating `inventory` and `orders`.
  - Keep `BATCH_CODE_REGEX` in `apps/api/src/modules/farms/farms.constant.ts` rather than `common/constants/` or `inventory.constant.ts` so `common/constants/` holds only domain-agnostic technical primitives and `InventoryModule -> FarmsModule` remains unidirectional.
- **Enforce the compile-time boundary automatically**:
  - Add an architectural unit test in `apps/api/src/common/interface-purity.spec.ts` using TypeScript's `transpileModule` and recursive AST inspection to verify every `apps/api/src/**/*.interface.ts` and `apps/api/src/**/*.type.ts` emits zero runtime JavaScript and every `apps/api/src/**/*.constant.ts` contains no `interface` declarations.

## Positive Consequences

- `*.interface.ts` files are provably zero-cost at runtime and cannot create runtime circular dependencies with DTO schemas or NestJS modules.
- Module layout mirrors the existing `apps/api/src/common/constants/*.constant.ts` convention across the whole API.
- Automated compiler-level verification in `bun run test:api` prevents future PRs from reintroducing `export const` into `*.interface.ts`.

## Negative Consequences / Risks

- Modules that have both runtime constants and domain contracts (`catalog`, `mail`, `media`, `orders`, `orders/shipping`) split imports across `.constant` and `.interface`.
- Contributors must follow the boundary check when adding new constants or interfaces; failures surface in unit test runs rather than `tsc` alone.

## Explicit Tradeoffs

- **Co-locating derived `(typeof CONST)[number]` types in `*.constant.ts` over re-exporting from `*.interface.ts`**: Keeps source tuples and their narrow union types in one file and eliminates empty `farms.interface.ts` / `inventory.interface.ts` stubs, at the minor cost that `*.constant.ts` exports derived `type` aliases alongside values.
- **Compiler-backed unit test over manual review or regex linting**: Uses TypeScript's own transpiler (`ts.transpileModule`) so comments, `import type`, and `export type` never trigger false positives, while catching `const`, `enum`, `class`, `function`, and side-effect imports that regex checks miss.
- **Superseding `ADR-0011` via `ADR-0035` over editing `ADR-0011` in place**: Preserves the historical record explaining why seven existing modules placed constants in `.interface.ts`, consistent with `ADR-0026` and `ADR-0034`.
