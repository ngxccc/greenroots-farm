# API Design & Error Handling Standards

## 1. Routes

- Plural, lowercase kebab-case resources: `/api/v1/products`, `/api/v1/orders/:orderId`, `/api/v1/products/:productId/batches`.
- Version in the path (`/api/v1`). IDs are UUID strings; never expose sequential integers.
- Retrieval is `GET`, creation is `POST`, and high-intent actions use sub-action nouns: `POST /api/v1/orders/checkout`, `POST /api/v1/subscriptions/:id/pause`, `POST /api/v1/payments/payos/webhook`.

## 2. Response Envelope

Every successful JSON response returns `ApiResponseDto`:

```json
{
  "success": true,
  "data": { "id": "019fa8bc-8f4d-7000-b366-e691f45cfb91", "status": "active" },
  "meta": { "page": 1, "limit": 20, "total": 150 }
}
```

- The top level is always an object: no bare arrays, no bare scalars.
- `meta` appears on paginated lists only.
- Money is integer VND with a `Vnd` suffix: `basePriceVnd`, `shippingFeeVnd`, `totalVnd`.

## 3. Lists

- `page` (1-based), `limit` (default 20, max 100), `sort`.
- Filters mirror resource fields: `status`, `categoryId`, `deliveryDay`, `from`, `to`.
- Unknown query parameters return `400`.

## 4. RFC 9457 Errors

Errors return `application/problem+json` with `{ type, title, status, code, detail, instance, invalidParams?, timestamp }`.

```json
{
  "type": "/errors/insufficient-stock",
  "title": "Insufficient Stock",
  "status": 409,
  "code": "INSUFFICIENT_STOCK",
  "detail": "Batch 019fa8bc has 3 units left, but 5 were requested.",
  "instance": "/api/v1/orders/checkout",
  "invalidParams": [
    {
      "name": "items[0].quantity",
      "code": "TOO_BIG",
      "reason": "Requested quantity exceeds available stock.",
      "params": { "requested": 5, "available": 3 }
    }
  ],
  "timestamp": "2026-11-16T15:10:00.000Z"
}
```

- `type` is the stable slug `/errors/<slug>` from `ERROR_SLUGS` in `apps/api/src/common/constants/messages.constant.ts`.
- `code` comes from `API_ERROR_CODES` in `@greenroots/shared`.
- `detail` and `reason` are English, developer-facing, and safe: no SQL fragments, secrets, or PII.
- `invalidParams[].params` carries the values a client needs to localize the message.
- Vietnamese copy lives in the clients through `API_ERROR_DICTIONARY` and `resolveSharedApiErrorMessage`.

## 5. Status Codes

| Code | Meaning                 | When                                                         |
| :--- | :---------------------- | :----------------------------------------------------------- |
| 200  | Success with payload    | `GET`, `PUT`, `PATCH`, idempotent update.                    |
| 201  | Resource created        | `POST` that creates an entity.                               |
| 204  | Success without payload | `DELETE` or command with no body.                            |
| 400  | Client syntax error     | DTO validation, malformed JSON, unknown query parameter.     |
| 401  | Missing / invalid auth  | Bearer token missing, expired, revoked, or badly signed.     |
| 403  | Insufficient permission | Role check failed, account suspended, resource not owned.    |
| 404  | Entity missing          | Unknown UUID or route.                                       |
| 409  | State conflict          | Insufficient stock, duplicate subscription, flash-sale race. |
| 422  | Business rule violation | Valid syntax, impossible domain action.                      |
| 429  | Rate limit exceeded     | Throttler triggered.                                         |
| 500  | Server crash            | Sanitized response; details logged privately.                |

## 6. Idempotency

- Header `Idempotency-Key: <UUID>`. Missing or non-UUID on a required route returns `400`.
- Required on `POST /api/v1/orders/checkout`, payment initiation, refunds, and every mutating command.
- Redis key `idempotency:<UUID>` holds `PROCESSING` with a 60s lock, then `COMPLETED` for 24h.
- Identical replay inside 24h returns the cached status and body without re-running the handler (`INV-IDEMP-1`).
- Same key with a different payload returns `422` (`INV-IDEMP-2`).
- A concurrent request while the key is `PROCESSING` returns `409` (`INV-IDEMP-3`).
- A Redis failure during acquisition returns `503`; the store fails closed (`INV-IDEMP-4`).
- An exception or rollback deletes the key so the client can retry immediately (`INV-IDEMP-5`).
- Payment webhooks deduplicate by provider transaction ID instead of the header.

## 7. DTOs

- Validate at the HTTP boundary; services receive typed inputs, never raw request bodies.
- Take roles and statuses from `@greenroots/shared`; never redeclare them in a DTO.
- `whitelist: true` plus `forbidNonWhitelisted: true` reject unknown fields.
- A DTO exposes no persistence entity, relation, password hash, or internal flag.

## 8. Schemas, Routes, and Controllers

- Every module declares `<module>.routes.ts` with frozen `TAG`, `BASE`, and action constants. Controllers reference them (`@ApiTags(ROUTES.TAG)`, `@Controller({ path: ROUTES.BASE, version: "1" })`, `@Post(ROUTES.UPLOAD_SIGNATURE)`) instead of string literals. Use `@HttpCode(HttpStatus.OK)` on `POST` commands that return `200`.
- Zod schemas and their `createZodDto()` classes live together in `dto/<action>.dto.ts`; export `z.infer` types from the same file so services never import transport classes.
- `<module>.interface.ts` holds compile-time `interface` and `type` declarations only (zero runtime JS exports; omit the file if no module types remain).
- `<module>.constant.ts` holds module runtime constants, frozen maps, DI `Symbol` tokens, whitelisted const tuples, and their directly derived union types (`typeof ...[number]`); cross-module API constants belong in `apps/api/src/common/constants/`. Runtime Zod schemas belong in `dto/`.
- `@Body()` and `@Query()` are typed with DTO classes, because interfaces vanish at compile time and leave OpenAPI bodies empty.
- Response envelopes are plain classes in `common/dto/api-response.dto.ts` with `@ApiProperty()` and `allOf`. Runtime-generated generic envelopes collide and mangle `components/schemas` names.
- Every endpoint declares its contract from `@/common/decorators`:
  - `@Public()` for open routes, `@ApiAuth(...roles)` otherwise. `ApiAuth` adds `@ApiBearerAuth()` and the 401 response; passing roles also adds `@Roles()` and the 403 response.
  - `@ApiForbiddenResponseRfc9457()` on any handler with an authorization branch the role guard cannot see (ownership, folder scope, account status, feature gate).
  - `@ApiOperation({ summary, description })` and schema descriptions in technical English.
  - `@ApiOkResponseGeneric(Dto)`, `@ApiCreatedResponseGeneric(Dto)`, or `@ApiOkResponsePaginated(ItemDto)` for success.
  - `@ApiBadRequestResponseRfc9457()`, `@ApiNotFoundResponseRfc9457()`, `@ApiConflictResponseRfc9457()`, `@ApiUnprocessableEntityResponseRfc9457()`, `@ApiInternalServerErrorResponseRfc9457()` for the statuses the handler can actually return.
- `400` and `500` are declared once on the controller class: every handler inherits the validation pipe rejection and the global filter. Route decorators cover only what that handler adds.

## 9. Signed Media Upload

- `POST /api/v1/media/upload-signature` with `{ folder: "farming_logs" | "complaints" | "products", resourceType: "image" | "video", fileSizeBytes }`.
- Images ≤ 5MB (`image/jpeg`, `image/png`, `image/webp`); videos ≤ 15MB (`video/mp4`, `video/quicktime`, `video/webm`).
- Oversized payloads return `422` (`INV-MEDIA-1`); an unknown folder or MIME type returns `400`.
- The backend signs with HMAC SHA-256 over a timestamp using `CLOUDINARY_API_SECRET`; the client uploads directly to Cloudinary, so bytes never pass through API memory.
- With `CLOUDINARY_API_SECRET` unset, return mock credentials for local and offline runs.

## 10. Rate Limiting

`CustomThrottlerGuard` runs first in the `APP_GUARD` pipeline, before `JwtAuthGuard` and `RolesGuard`, so volumetric traffic is dropped before JWT verification and database work. It is backed by `@nest-lab/throttler-storage-redis`.

| Tier      | Limit                              | Scope                                       |
| :-------- | :--------------------------------- | :------------------------------------------ |
| `default` | 100 requests / 60s                 | Standard CRUD.                              |
| `public`  | 300 requests / 60s                 | Catalog browsing, health checks.            |
| `auth`    | 5 requests / 60s (100 in dev/test) | `/login`, `/register`, `/upload-signature`. |

- The guard fails open: a Redis stall or a check exceeding 2 seconds logs a warning and allows the request.
- Exceeding a tier throws 429, which `GlobalExceptionFilter` renders as `type: "/errors/too-many-requests"` with `MESSAGES.COMMON.TOO_MANY_REQUESTS`.
