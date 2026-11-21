import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import {
  ALLOWED_MEDIA_FOLDERS,
  IMAGE_ONLY_MEDIA_FOLDERS,
  MEDIA_RESOURCE_TYPES,
} from "../media.constant";

export const signedUploadSchema = z
  .object({
    resourceType: z
      .enum(MEDIA_RESOURCE_TYPES)
      .default("image")
      .describe("Asset media type: image or video"),
    fileSizeBytes: z
      .number()
      .int()
      .positive()
      .describe("File size in bytes (image <= 5MB, video <= 15MB)"),
    folder: z
      .enum(ALLOWED_MEDIA_FOLDERS)
      .describe("Target asset storage folder with role authorization"),
  })
  .strict()
  .refine(
    (data) =>
      !(
        IMAGE_ONLY_MEDIA_FOLDERS.includes(data.folder) &&
        data.resourceType !== "image"
      ),
    {
      path: ["resourceType"],
      message:
        "Only image uploads are permitted for plots, farms, products, and waste_logs folders.",
    },
  );

export type SignedUploadInput = z.infer<typeof signedUploadSchema>;

export class SignedUploadDto extends createZodDto(signedUploadSchema) {}
