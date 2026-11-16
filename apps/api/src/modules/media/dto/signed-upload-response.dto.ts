import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { MEDIA_RESOURCE_TYPES } from "../media.interface";

export const signedUploadResponseSchema = z.object({
  signature: z.string().describe("Cloudinary SHA-256 HMAC signature"),
  timestamp: z
    .number()
    .int()
    .describe("Unix timestamp in seconds used for signature computation"),
  apiKey: z.string().describe("Cloudinary public API key"),
  cloudName: z.string().describe("Cloudinary cloud name"),
  folder: z.string().describe("Target Cloudinary folder"),
  resourceType: z
    .enum(MEDIA_RESOURCE_TYPES)
    .describe("Resource type: image or video"),
  maxBytes: z.number().int().describe("Maximum allowed file size in bytes"),
});

export class SignedUploadResponseDto extends createZodDto(
  signedUploadResponseSchema,
) {}
