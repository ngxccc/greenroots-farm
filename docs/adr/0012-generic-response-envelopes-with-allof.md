---
status: Accepted
date: 2026-11-16
deciders: ngxccc
---

# 12. Generic Response Envelopes via Plain Classes and OpenAPI `allOf`

## Context

The API needs one response envelope for single and paginated payloads. A dynamic Zod factory generated a distinct anonymous class per payload, which produced `ApiResponseDto_1`, `ApiResponseDto_2`, and similar names in `components/schemas`. Those names broke downstream type generation for the storefront and backoffice.

- **Target module**: `apps/api/src/common/dto`
- **Symbol reference**: `ApiResponseDto`, `PaginatedApiResponseDto`, `PaginationMetaDto`
- **Extracted from**: the pre-split ADR (0003) §3 during the 2026-11-18 ADR split.

## Decision

- Declare root envelopes as plain TypeScript classes decorated with `@ApiProperty()`.
- Compose payload-specific schemas in OpenAPI with `allOf`, referencing the shared envelope once and adding the `data` property.
- Forbid higher-order dynamic Zod factories that generate envelope subclasses per model.
- Serialize outbound envelopes directly without a redundant Zod parse on the response path.

## Positive Consequences

- `ApiResponseDto` appears once in `components/schemas` and is reused by `$ref`.
- Generated client types are stable and readable.
- Response handling avoids a second validation pass.

## Negative Consequences / Risks

- Outbound data is not runtime-validated against a schema; correctness relies on controller types and integration tests.
- Envelope changes require decorator edits rather than a schema-only change.

## Explicit Tradeoffs

- **Plain classes over Zod envelopes**: stable OpenAPI names and zero response overhead win over uniform Zod usage.
- **`allOf` composition over duplicated envelope schemas**: one definition wins over per-endpoint self-containment.
