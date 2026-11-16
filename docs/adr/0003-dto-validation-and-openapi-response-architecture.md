---
status: Accepted
date: 2026-11-16
deciders: ngxccc
---

# 3. DTO Schema Co-Location, Pure Domain Interfaces, and Generic OpenAPI Envelopes

## Context

During the implementation of media signed uploads and API infrastructure (Issue #16, PR #63), architectural inconsistencies emerged regarding the boundary between Zod validation schemas, NestJS DTO classes, domain interfaces, and response envelope serialization:

1. **Schema and Interface Bleed**: In `MediaModule`, the input validation schema (`signedUploadSchema`) was declared inside `media.interface.ts` alongside domain types, whereas the output schema (`signedUploadResponseSchema`) was placed inside `dto/signed-upload-response.dto.ts`. Declaring executable runtime Zod schemas inside `.interface.ts` files violates TypeScript naming semantics (turning a compile-time contract into an executable bundle) and increases circular dependency risks between domain services and transport DTOs.
2. **Response Envelope Serialization vs Runtime Validation**: There was ambiguity over whether standard response envelopes (`ApiResponseDto<T>` and `PaginatedApiResponseDto<T>`) should be authored as dynamic Zod schemas via `createZodDto` or as plain TypeScript classes with `@nestjs/swagger` decorators.

## Decision

### 1. Schema Co-Location in DTO Files

- **Rule**: Every HTTP request or response Zod validation schema MUST be co-located directly inside its respective DTO file (`src/modules/<module>/dto/<action>.dto.ts`).
- **Export Pattern**:
  ```typescript
  export const signedUploadSchema = z.object({ ... });
  export type SignedUploadInput = z.infer<typeof signedUploadSchema>;
  export class SignedUploadDto extends createZodDto(signedUploadSchema) {}
  ```
- **Service Decoupling**: Domain services needing typed inputs import the inferred type (`SignedUploadInput`) directly from `./dto` or `./dto/<action>.dto`, allowing domain logic to remain decoupled from NestJS class instances.

### 2. Pure Domain Interfaces (Zero Runtime Overhead)

- **Rule**: File `<module>.interface.ts` is strictly reserved for pure domain types, interfaces, and business constants (e.g. `MEDIA_CONSTRAINTS`, `FOLDER_PERMISSIONS`, `CloudinarySignatureResult`).
- **Prohibition**: Runtime executable validation schemas (`z.object({...})`) MUST NOT be defined in `<module>.interface.ts`.

### 3. Plain Class Generic Response Envelopes with OpenAPI `allOf` Polymorphism

- **Rule**: Root API response envelopes (`ApiResponseDto<T>`, `PaginatedApiResponseDto<T>`, `PaginationMetaDto`) in `src/common/dto/api-response.dto.ts` are declared as plain TypeScript classes using `@ApiProperty()`.
- **OpenAPI Schema Composition**: Decorator `createApiResponseGeneric` leverages OpenAPI `allOf` schema composition:
  ```typescript
  allOf: [
    { $ref: getSchemaPath(ApiResponseDto) },
    { properties: { data: { $ref: getSchemaPath(model) } } },
  ];
  ```
- **Prohibition**: Higher-order dynamic Zod factory envelopes (`const makeEnvelope = (schema) => class extends createZodDto(...)`) are strictly forbidden. Dynamic class generation causes anonymous schema collisions and mangled names (`ApiResponseDto_1`, `ApiResponseDto_2`) in `components/schemas`, breaking downstream type distribution in `@greenroots/storefront` and `@greenroots/backoffice`.
- **Zero Serialization Overhead**: Outbound response envelopes are serialized directly without redundant Zod parsing on the hot response path.

## Positive Consequences

- File semantic purity: `.interface.ts` files remain pure compile-time type definitions and business constants with 0 bytes of runtime JavaScript execution.
- Single Source of Truth: Devs find validation rules, DTO classes, and inferred types co-located in a single file under `dto/`.
- Clean OpenAPI Document: `ApiResponseDto` is defined once in `components/schemas` and referenced via `$ref`, keeping `openapi.json` minimal and deterministic.
- Downstream Code Generation: Clean, stable schema names ensure typed SDK generation for Next.js Storefront and Vite Backoffice without anonymous type fragmentation.

## Negative Consequences / Risks

- Response envelopes do not automatically validate outbound structure against a Zod schema at runtime. Correctness of outgoing data envelopes relies on controller return types and unit/integration tests.

## Explicit Tradeoffs

- **Co-located DTOs vs Separate `schemas/` folder**: Co-location in `dto/` reduces directory proliferation and file jumping for domain modules without sacrificing type separation.
- **Plain Class `allOf` vs Dynamic Zod Factory**: Reusability and stability in OpenAPI `$ref` generation strictly override uniform adoption of Zod for response envelopes.
