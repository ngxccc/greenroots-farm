import { z } from "zod";
import { UserRole } from "@greenroots/shared";

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

/**
 * Role-to-Folder authorization mapping:
 * - farming_logs / waste_logs: Farm staff and admins
 * - products: Sales and admins
 * - complaints: Customers (for defect/damage proof) and admins
 */
export const FOLDER_PERMISSIONS: Record<MediaFolder, readonly UserRole[]> = {
  farming_logs: [UserRole.FARM_STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN],
  waste_logs: [UserRole.FARM_STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN],
  products: [UserRole.ADMIN, UserRole.SALES, UserRole.SUPER_ADMIN],
  complaints: [UserRole.CUSTOMER, UserRole.ADMIN, UserRole.SUPER_ADMIN],
};

export const MEDIA_RESOURCE_TYPES = ["image", "video"] as const;
export type MediaResourceType = (typeof MEDIA_RESOURCE_TYPES)[number];

export const signedUploadSchema = z.object({
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
