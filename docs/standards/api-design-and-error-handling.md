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
  "type": "https://greenroots.farm/problems/insufficient-stock",
  "title": "Insufficient stock",
  "status": 409,
  "detail": "Batch 019fa8bc only has 3 units left, but 5 were requested.",
  "instance": "/api/v1/orders/checkout",
  "invalidParams": [
    { "name": "items[0].quantity", "reason": "Requested 5, available 3" }
  ]
}
```

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

- **Header**: `Idempotency-Key: <UUIDv7>`
- **Required** for: `POST /api/v1/orders/checkout`, payment initiation, refunds.
- Cache the response in Redis for 24 hours. A replay with the same key returns the original response.
- Reusing a key with a different payload returns `422 Unprocessable`.
- Payment webhooks are idempotent by provider transaction ID, independent of the request header.

## 7. DTO Validation & Boundary Rules

- Validate at the HTTP boundary with a DTO; never pass raw request bodies into domain services.
- Use shared enums from `@greenroots/shared`; never redeclare statuses or roles in DTOs.
- Reject unknown fields (`whitelist: true`, `forbidNonWhitelisted: true`).
- DTOs never expose persistence entities, ORM relations, password hashes, or internal flags.
