import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { MEDIA_RESOURCE_TYPES } from "../media.interface";

export const signedUploadResponseSchema = z.object({
  signature: z.string().describe("Cloudinary SHA-256 HMAC signature").meta({
    example: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  }),
  timestamp: z
    .number()
    .int()
    .positive()
    .describe("Unix timestamp in seconds used for signature computation")
    .meta({ example: 1731744000 }),
  apiKey: z
    .string()
    .describe("Cloudinary public API key")
    .meta({ example: "123456789012345" }),
  cloudName: z
    .string()
    .describe("Cloudinary cloud name")
    .meta({ example: "greenroots-farm" }),
  folder: z
    .string()
    .describe("Target Cloudinary folder")
    .meta({ example: "farming_logs" }),
  resourceType: z
    .enum(MEDIA_RESOURCE_TYPES)
    .describe("Resource type: image or video")
    .meta({ example: "image" }),
  maxBytes: z
    .number()
    .int()
    .positive()
    .describe("Maximum allowed file size in bytes")
    .meta({ example: 5242880 }),
});

export type SignedUploadResponse = z.infer<typeof signedUploadResponseSchema>;

export class SignedUploadResponseDto extends createZodDto(
  signedUploadResponseSchema,
) {}
