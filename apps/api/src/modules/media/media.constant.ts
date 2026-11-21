import { UserRole } from "@greenroots/shared";

/**
 * Per-resource-type upload byte limits and allowed MIME types for Cloudinary signed uploads.
 */
export const MEDIA_CONSTRAINTS = Object.freeze({
  IMAGE: Object.freeze({
    MAX_BYTES: 5 * 1024 * 1024, // 5MB
    ALLOWED_MIMES: Object.freeze([
      "image/jpeg",
      "image/png",
      "image/webp",
    ] as const),
    RESOURCE_TYPE: "image",
  }),
  VIDEO: Object.freeze({
    MAX_BYTES: 15 * 1024 * 1024, // 15MB
    ALLOWED_MIMES: Object.freeze([
      "video/mp4",
      "video/quicktime",
      "video/webm",
    ] as const),
    RESOURCE_TYPE: "video",
  }),
} as const);

/**
 * Whitelisted Cloudinary destination folders accepted by `POST /api/v1/media/upload-signature`.
 */
export const ALLOWED_MEDIA_FOLDERS = [
  "farming_logs",
  "complaints",
  "products",
  "waste_logs",
  "plots",
  "farms",
] as const;

/**
 * Union of supported Cloudinary upload folder identifiers.
 */
export type MediaFolder = (typeof ALLOWED_MEDIA_FOLDERS)[number];

/**
 * Role-to-Folder authorization mapping:
 * - farming_logs / waste_logs / plots: Farm staff and admins
 * - products: Sales and admins
 * - farms: Admins and super admins
 * - complaints: Customers (for defect/damage proof) and admins
 */
export const FOLDER_PERMISSIONS: Record<MediaFolder, readonly UserRole[]> =
  Object.freeze({
    farming_logs: [UserRole.FARM_STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN],
    waste_logs: [UserRole.FARM_STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN],
    plots: [UserRole.FARM_STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN],
    products: [UserRole.ADMIN, UserRole.SALES, UserRole.SUPER_ADMIN],
    farms: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
    complaints: [UserRole.CUSTOMER, UserRole.ADMIN, UserRole.SUPER_ADMIN],
  });

/**
 * Supported Cloudinary upload resource types.
 */
export const MEDIA_RESOURCE_TYPES = ["image", "video"] as const;

/**
 * Union of supported Cloudinary upload resource types.
 */
export type MediaResourceType = (typeof MEDIA_RESOURCE_TYPES)[number];

/**
 * Folders restricted exclusively to image uploads (no video assets).
 */
export const IMAGE_ONLY_MEDIA_FOLDERS: readonly MediaFolder[] = Object.freeze([
  "plots",
  "farms",
  "products",
  "waste_logs",
]);
