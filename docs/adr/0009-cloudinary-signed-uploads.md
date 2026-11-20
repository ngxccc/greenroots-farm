---
status: Accepted
date: 2026-11-15
deciders: ngxccc
---

# 9. Cloudinary Signed Uploads at the API Boundary

## Context

Cultivation logs, complaints, and catalog images need media uploads. Proxying multi-megabyte payloads through the NestJS process consumes memory and worker time and pushes request bodies through a layer that adds no value. The API must still enforce type, size, and destination constraints.

- **Target module**: `apps/api/src/modules/media`
- **Symbol reference**: `POST /api/v1/media/upload-signature`
- **Extracted from**: the pre-split ADR (0002) §3 during the 2026-11-18 ADR split.

## Decision

- Expose `POST /api/v1/media/upload-signature` for clients to upload directly to Cloudinary.
- Enforce image uploads up to 5 MB (`image/jpeg`, `image/png`, `image/webp`) and video uploads up to 15 MB (`video/mp4`, `video/quicktime`, `video/webm`).
- Restrict destination folders to `farming_logs`, `complaints`, and `products` _(amended by ADR-0021 to add `plots` and `farms`, and by ADR-0025 to restrict `products` to image-only uploads)_.
- Reject violations at the HTTP boundary with `422` under `INV-MEDIA-1`.
- Compute the signature server-side with HMAC SHA-256 over sorted parameters and `CLOUDINARY_API_SECRET`.
- When `CLOUDINARY_API_SECRET` is absent in development, return a mock signature so local frontend work needs no third-party credentials.

## Positive Consequences

- Large payloads never enter API memory.
- Constraints are centralized and shared by every upload surface.
- Local development works without a Cloudinary account.

## Negative Consequences / Risks

- The mock signature path can mask a misconfigured production environment if the secret is missing there _(mitigated by `parseApiEnvironment()` in `apps/api/src/common/config/env.config.ts`, which now fails fast on startup when `NODE_ENV === "production"` lacks `CLOUDINARY_API_SECRET`)_.
- Clients must implement multipart upload handling themselves.
- Direct uploads bypass API-side virus or content scanning.

## Explicit Tradeoffs

- **Signed direct upload over API proxy**: bandwidth and memory win over a single enforcement point after signing.
- **Folder allowlist over arbitrary paths**: tenant and use-case separation wins over flexibility.
