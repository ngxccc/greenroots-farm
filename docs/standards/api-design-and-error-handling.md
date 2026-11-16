# API Design & Error Handling Standards

## 1. RESTful URL & Route Naming Conventions

- **Resource-oriented, plural nouns, lowercase kebab-case**: `/api/v1/products`, `/api/v1/products/:productId/batches`, `/api/v1/orders`, `/api/v1/subscriptions`, `/api/v1/deliveries`.
- **API version in the path**: `/api/v1`.
- **IDs are UUID strings**: never expose sequential integer IDs.
- **Command vs query distinction**:
  - State retrieval (safe, idempotent): `GET /api/v1/orders/:id`
  - Resource creation: `POST /api/v1/orders`
  - High-intent business actions (commands): use sub-action nouns.
    - `POST /api/v1/orders/checkout`
    - `POST /api/v1/subscriptions/:id/pause`
    - `POST /api/v1/payments/payos/webhook`

## 2. Standard Response Envelope

All successful JSON responses MUST use the generic `ApiResponseDto` envelope:

```json
{
  "success": true,
  "data": {
    "id": "019fa8bc-8f4d-7000-b366-e691f45cfb91",
    "name": "Xà lách thủy canh",
    "basePriceVnd": 35000,
    "status": "active"
  },
  "meta": { "page": 1, "limit": 20, "total": 150 }
}
```

- `meta` is required for paginated lists and omitted otherwise.
- Never return a bare array or a bare scalar at the top level.
- Money fields use integer VND and a `Vnd` suffix (`basePriceVnd`, `shippingFeeVnd`, `totalVnd`).

## 3. Pagination, Filtering, and Sorting

- List endpoints accept `page` (1-based), `limit` (default 20, max 100), and `sort`.
- Filter names mirror resource fields: `status`, `categoryId`, `deliveryDay`, `from`, `to`.
- Unknown query parameters are rejected with `400 Bad Request`.

## 4. RFC 9457 Problem Details for Error Responses

All error responses MUST follow **RFC 9457**:

- **Content-Type**: `application/problem+json`
- **Structure**: `{ type, title, status, detail, instance, invalidParams? }`

```json
{
  "type": "/errors/insufficient-stock",
  "title": "Insufficient stock",
  "status": 409,
  "detail": "Batch 019fa8bc only has 3 units left, but 5 were requested.",
  "instance": "/api/v1/orders/checkout",
  "invalidParams": [
    { "name": "items[0].quantity", "reason": "Requested 5, available 3" }
  ]
}
```

- `type` is a stable URN of the form `/errors/<slug>`; slugs are centralized in `apps/api/src/common/constants/messages.constant.ts`.
- `detail` MUST be safe to show to the client: no SQL, stack traces, secrets, or internal IDs.
- Log the full internal error privately and return the sanitized problem document.

## 5. HTTP Status Code Decision Matrix

| Status Code             | Meaning                  | When to Use                                                         |
| :---------------------- | :----------------------- | :------------------------------------------------------------------ |
| `200 OK`                | Success with payload     | Successful `GET`, `PUT`, `PATCH`, or idempotent state update.       |
| `201 Created`           | Resource created         | Successful `POST` creating an entity.                               |
| `204 No Content`        | Success without payload  | Successful `DELETE` or command with no body.                        |
| `400 Bad Request`       | Client syntax error      | DTO validation failure, malformed JSON, unknown query parameter.    |
| `401 Unauthorized`      | Missing / invalid auth   | Bearer token missing, expired, revoked, or signature invalid.       |
| `403 Forbidden`         | Insufficient permissions | Role check failed, account suspended, resource not owned.           |
| `404 Not Found`         | Entity missing           | Non-existent UUID or route.                                         |
| `409 Conflict`          | State conflict           | Insufficient stock, duplicate active subscription, flash-sale race. |
| `422 Unprocessable`     | Business rule violation  | Valid syntax but impossible domain action.                          |
| `429 Too Many Requests` | Rate limit exceeded      | Throttler triggered limit.                                          |
| `500 Internal Error`    | Server crash             | Sanitized error response; details logged privately.                 |

## 6. Idempotency Key Handling

- **Header**: `Idempotency-Key: <UUID>` (or UUIDv7). Missing or non-UUID headers on required routes return `400 Bad Request`.
- **Required** for: `POST /api/v1/orders/checkout`, payment initiation, refunds, and mutating commands.
- **Lifecycle & Cache**:
  - Stores key in Redis under `idempotency:<UUID>` with `PROCESSING` status during execution (60s lock TTL).
  - Caches completed response in Redis for 24 hours (`86400s`) under `COMPLETED` status.
  - Replay with identical payload within 24h returns original cached status and body without re-executing business logic (`INV-IDEMP-1`).
  - Replaying a key with a different payload returns `422 Unprocessable Entity` (`INV-IDEMP-2`).
  - Concurrent requests while key is `PROCESSING` return `409 Conflict` (`INV-IDEMP-3`).
  - When Redis connection fails during acquisition, the interceptor strictly **fails closed** returning `503 Service Unavailable` (`INV-IDEMP-4`).
  - Downstream exception or database transaction rollback releases the key (`DEL idempotency:<key>`), allowing immediate client retry (`INV-IDEMP-5`).
- Payment webhooks are idempotent by provider transaction ID, independent of the request header.

## 7. DTO Validation & Boundary Rules

- Validate at the HTTP boundary with a DTO; never pass raw request bodies into domain services.
- Use shared enums from `@greenroots/shared`; never redeclare statuses or roles in DTOs.
- Reject unknown fields (`whitelist: true`, `forbidNonWhitelisted: true`).
- DTOs never expose persistence entities, ORM relations, password hashes, or internal flags.

## 8. Signed Media Upload API

- **Endpoint**: `POST /api/v1/media/upload-signature`
- **Payload**: `{ folder: "farming_logs" | "complaints" | "products", resourceType: "image" | "video", fileSizeBytes: number }`
- **Strict Constraints**:
  - Images $\le 5\text{MB}$ (`image/jpeg`, `image/png`, `image/webp`).
  - Videos $\le 15\text{MB}$ (`video/mp4`, `video/quicktime`, `video/webm`).
  - Oversized payloads rejected at HTTP boundary with `422 Unprocessable Entity` (`INV-MEDIA-1`).
  - Invalid folder or MIME type rejected with `400 Bad Request`.
- **Direct Client Upload**: Backend generates timestamp and HMAC SHA-256 signature using `CLOUDINARY_API_SECRET`. Client uploads directly to Cloudinary CDN via multipart form-data.
- **Local Mock Fallback**: If `CLOUDINARY_API_SECRET` is unset, returns mock credentials for local development and offline testing.

## 9. Controller Route Constants & OpenAPI Decorator Standards

To guarantee strict SSOT, eliminate typos, and keep OpenAPI documentation in sync across the monorepo, all NestJS controllers MUST adhere to the following standards:

### 9.1 Centralized Route Constants (`<module>.routes.ts`)

- **PROHIBITION**: Never hardcode route paths or Swagger tags as raw string literals in controllers (e.g. `@Controller("media")` or `@Post("upload-signature")`).
- **MANDATORY**: Every domain module MUST declare a `<module>.routes.ts` file exporting frozen route constants:
  ```typescript
  export const MEDIA_ROUTES = {
    TAG: "media",
    BASE: "media",
    UPLOAD_SIGNATURE: "upload-signature",
  } as const;
  ```
- Use `ROUTES.TAG` in `@ApiTags(...)`, `ROUTES.BASE` in `@Controller(...)`, and action constants in `@Get`, `@Post`, `@Put`, `@Patch`, `@Delete`.

### 9.2 Request & Response DTOs (`createZodDto`)

- **PROHIBITION**: Never type `@Body()` or `@Query()` using raw TypeScript `interface` or `type`. TypeScript interfaces vanish at compile time, causing `@nestjs/swagger` to produce empty request bodies and breaking downstream type sync in `@greenroots/storefront` and `@greenroots/backoffice`.
- **MANDATORY**:
  - Define input validation schemas with Zod and export concrete DTO classes using `createZodDto(schema)`.
  - Define response payload schemas with Zod and export concrete response DTO classes using `createZodDto(responseSchema)`.
  - Store module-specific DTOs in `src/modules/<module>/dto/`.

### 9.3 Mandatory Decorator Suite

Every controller endpoint MUST declare its OpenAPI contracts and error specifications using the standard decorator library (`@/common/decorators`):

1. **Authentication & Authorization**:
   - Public endpoints: `@Public()`
   - Authenticated/Role-guarded endpoints: `@ApiAuth(...roles: UserRole[])` (automatically attaches `@ApiBearerAuth()`, `@ApiUnauthorizedResponseRfc9457()`, and `@ApiForbiddenResponseRfc9457()`).
2. **Endpoint Description**:
   - `@ApiOperation({ summary: "Short imperative summary", description: "Detailed behavioral description" })`
3. **Successful Response Envelope**:
   - Single resource (200 OK): `@ApiOkResponseGeneric(ResponseDto)`
   - Created resource (201 Created): `@ApiCreatedResponseGeneric(ResponseDto)`
   - Paginated resource (200 OK): `@ApiOkResponsePaginated(ItemDto)`
   - Empty/Command response: `@ApiOkResponseGeneric()` or `@ApiCreatedResponseGeneric()`
4. **RFC 9457 Error Responses & OpenAPI Language Rule**:
   - **OpenAPI / Swagger Documentation (100% English)**: All `@ApiOperation`, `@Api*Response`, descriptions, and schema examples must be written in English for API consumers and tooling.
   - **Runtime User Responses (Vietnamese)**: Runtime error messages returned in RFC 9457 `detail` or success payloads use Vietnamese from `MESSAGES` / shared error dictionary.
   - Declare expected error statuses explicitly: `@ApiBadRequestResponseRfc9457()`, `@ApiNotFoundResponseRfc9457()`, `@ApiConflictResponseRfc9457()`, `@ApiUnprocessableEntityResponseRfc9457()`, `@ApiInternalServerErrorResponseRfc9457()`.

### 9.4 Controller Implementation Pattern

```typescript
@ApiTags(MEDIA_ROUTES.TAG)
@Controller({ path: MEDIA_ROUTES.BASE, version: "1" })
export class MediaController {
  constructor(private readonly cloudinaryService: CloudinaryService) {}

  @ApiAuth()
  @Post(MEDIA_ROUTES.UPLOAD_SIGNATURE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Generate Cloudinary signed upload signature (<=5MB image, <=15MB video)",
    description:
      "Generates an HMAC SHA-256 signature and upload parameters for client-side direct uploads without streaming files through API memory.",
  })
  @ApiOkResponseGeneric(SignedUploadResponseDto)
  @ApiBadRequestResponseRfc9457()
  @ApiForbiddenResponseRfc9457()
  @ApiUnprocessableEntityResponseRfc9457()
  @ApiInternalServerErrorResponseRfc9457()
  getUploadSignature(
    @Body() dto: SignedUploadDto,
    @CurrentUser() user: JwtPayload,
  ): ApiResponse<CloudinarySignatureResult> {
    const signatureData = this.cloudinaryService.createUploadSignature(
      dto,
      user.role,
    );
    return apiSuccess(signatureData);
  }
}
```
