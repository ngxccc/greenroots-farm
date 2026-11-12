/**
 * GreenRoots Farm - 100% SSOT TypeScript Types for JSONB Columns
 * Matching Database_Schema.dbml and Database_ERD_and_Data_Dictionary.md
 */

// ==========================================
// 1. FARM & OPERATIONAL SETTINGS (farms JSONB)
// ==========================================

export interface FarmHotlines {
  primary: string;
  support?: string;
}

export interface FarmEmails {
  primary: string;
  support?: string;
}

export interface FarmWorkingHours {
  weekdays: string;
  weekend: string;
}

export interface FarmBankInfo {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
}

export interface FarmShippingConfig {
  baseFeeVnd: number;
  freeKmThreshold: number;
  perKmRateVnd: number;
  detourFactor: number;
}

export interface FarmFlashSaleConfig {
  hoursThreshold: number;
  discountPercent: number;
}

// ==========================================
// 2. SOIL & WATER TEST RESULTS (plots JSONB)
// ==========================================

export interface HeavyMetalsTest {
  lead_ppm: number;
  cadmium_ppm: number;
  pass: boolean;
}

export interface SoilTestResult {
  ph: number;
  nitrogen_ppm: number;
  phosphorus_ppm: number;
  potassium_ppm: number;
  heavy_metals: HeavyMetalsTest;
  tested_at: string;
  certificate_url?: string;
}

export interface WaterTestResult {
  ph: number;
  ec_ms_cm: number;
  dissolved_oxygen_ppm: number;
  e_coli_cfu_100ml: number;
  heavy_metals_pass: boolean;
  tested_at: string;
  certificate_url?: string;
}

// ==========================================
// 3. MEDIA ARRAYS & PAYLOADS
// ==========================================

/** Cloudinary image/video URLs for cultivation logs (max 3 items) */
export type FarmingLogMediaUrls = string[];

/** Cloudinary image URLs for storefront products (max 5 items) */
export type ProductImageUrls = string[];

/** Cloudinary proof URLs for waste write-offs (1-3 items) */
export type WasteLogMediaUrls = string[];

/** Cloudinary proof URLs for customer complaints (1-5 items) */
export type ComplaintProofImageUrls = string[];

/** Raw webhook payload snapshot from PayOS payment gateway */
export type PaymentRawPayload = Record<string, unknown>;
