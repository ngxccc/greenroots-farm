import { z } from "zod";

export const MEDIA_CONSTRAINTS = {
  IMAGE: {
    MAX_BYTES: 5 * 1024 * 1024, // 5MB
    ALLOWED_MIMES: ["image/jpeg", "image/png", "image/webp"],
    RESOURCE_TYPE: "image",
  },
  VIDEO: {
    MAX_BYTES: 15 * 1024 * 1024, // 15MB
    ALLOWED_MIMES: ["video/mp4", "video/quicktime", "video/webm"],
    RESOURCE_TYPE: "video",
  },
} as const;

export const ALLOWED_MEDIA_FOLDERS = [
  "farming_logs",
  "complaints",
  "products",
  "waste_logs",
] as const;

export type MediaFolder = (typeof ALLOWED_MEDIA_FOLDERS)[number];
export type MediaResourceType = "image" | "video";

export const signedUploadSchema = z.object({
  resourceType: z.enum(["image", "video"]).default("image"),
  fileSizeBytes: z.number().int().positive(),
  folder: z.enum(ALLOWED_MEDIA_FOLDERS),
});

export type SignedUploadInput = z.infer<typeof signedUploadSchema>;

export interface CloudinarySignatureResult {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  resourceType: MediaResourceType;
  maxBytes: number;
}
