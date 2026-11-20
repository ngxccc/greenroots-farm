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
  "plots",
  "farms",
] as const;

export type MediaFolder = (typeof ALLOWED_MEDIA_FOLDERS)[number];

/**
 * Role-to-Folder authorization mapping:
 * - farming_logs / waste_logs / plots: Farm staff and admins
 * - products: Sales and admins
 * - farms: Admins and super admins
 * - complaints: Customers (for defect/damage proof) and admins
 */
export const FOLDER_PERMISSIONS: Record<MediaFolder, readonly UserRole[]> = {
  farming_logs: [UserRole.FARM_STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN],
  waste_logs: [UserRole.FARM_STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN],
  plots: [UserRole.FARM_STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN],
  products: [UserRole.ADMIN, UserRole.SALES, UserRole.SUPER_ADMIN],
  farms: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
  complaints: [UserRole.CUSTOMER, UserRole.ADMIN, UserRole.SUPER_ADMIN],
};

export const MEDIA_RESOURCE_TYPES = ["image", "video"] as const;
export type MediaResourceType = (typeof MEDIA_RESOURCE_TYPES)[number];

/**
 * Folders restricted exclusively to image uploads (no video assets).
 */
export const IMAGE_ONLY_MEDIA_FOLDERS: readonly MediaFolder[] = [
  "plots",
  "farms",
  "products",
  "waste_logs",
];

export interface CloudinarySignatureResult {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  resourceType: MediaResourceType;
  maxBytes: number;
}
