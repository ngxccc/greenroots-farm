import { describe, expect, it } from "bun:test";
import { API_ERROR_CODES } from "@greenroots/shared";
import { env } from "@/common/config/env.config";
import { MESSAGES } from "@/common/constants/messages.constant";
import { formatZodIssue } from "@/common/pipes/zod-validation.pipe";
import {
  zBooleanString,
  zCloudinaryMediaUrl,
  zCoerceDate,
  zEmail,
  zIsoDate,
  zNumericString,
  zOptionalEmail,
  zOptionalTaxId,
  zPassword,
  zPhoneNumber,
  zSanitizedString,
  zTaxId,
  zUuidV7,
} from "./zod-primitives";

describe("Zod Primitives", () => {
  describe("zSanitizedString", () => {
    it("strips malicious HTML tags and collapses whitespace", () => {
      const schema = zSanitizedString();
      const input = "  <script>alert('xss')</script> Hello   <b>World</b>!  ";
      const result = schema.parse(input);
      expect(result).toBe("Hello World!");
    });

    it("enforces min and max length boundaries", () => {
      const schema = zSanitizedString({ min: 3, max: 10 });
      expect(schema.safeParse("abc").success).toBe(true);
      expect(schema.safeParse("ab").success).toBe(false);
      expect(schema.safeParse("12345678901").success).toBe(false);
    });
  });

  describe("zEmail & zOptionalEmail", () => {
    it("lowercases and trims valid email addresses", () => {
      const schema = zEmail();
      expect(schema.parse("  USER@GreenRoots.Farm  ")).toBe(
        "user@greenroots.farm",
      );
      expect(schema.safeParse("invalid-email").success).toBe(false);
    });

    it("preprocesses empty strings into null for optional email", () => {
      const schema = zOptionalEmail();
      expect(schema.parse("   ")).toBe(null);
      expect(schema.parse(undefined)).toBe(undefined);
      expect(schema.parse("test@greenroots.farm")).toBe("test@greenroots.farm");
    });
  });

  describe("zPassword", () => {
    const schema = zPassword();

    it("accepts strong passwords meeting OWASP criteria", () => {
      expect(schema.safeParse("GreenRoots@2026").success).toBe(true);
    });

    it("rejects passwords that are too short", () => {
      expect(schema.safeParse("Gr@2026").success).toBe(false);
    });

    it("rejects passwords missing uppercase letters", () => {
      expect(schema.safeParse("greenroots@2026").success).toBe(false);
    });

    it("rejects passwords missing numbers", () => {
      expect(schema.safeParse("GreenRoots@Farm").success).toBe(false);
    });

    it("rejects passwords missing special characters", () => {
      expect(schema.safeParse("GreenRoots2026").success).toBe(false);
    });
  });

  describe("zPhoneNumber", () => {
    const schema = zPhoneNumber();

    it("accepts valid 10-digit Vietnamese mobile phone numbers", () => {
      expect(schema.safeParse("0912345678").success).toBe(true);
      expect(schema.safeParse("0389876543").success).toBe(true);
      expect(schema.safeParse("0701122334").success).toBe(true);
      expect(schema.safeParse("0561234567").success).toBe(true);
    });

    it("rejects numbers with invalid prefixes or lengths", () => {
      expect(schema.safeParse("0281234567").success).toBe(false); // Landline prefix
      expect(schema.safeParse("091234567").success).toBe(false); // 9 digits
      expect(schema.safeParse("09123456789").success).toBe(false); // 11 digits
      expect(schema.safeParse("abc0912345").success).toBe(false);
    });
  });

  describe("zTaxId & zOptionalTaxId", () => {
    const schema = zTaxId();

    it("accepts 10-digit and 13-digit enterprise tax codes", () => {
      expect(schema.safeParse("0312345678").success).toBe(true);
      expect(schema.safeParse("0312345678-001").success).toBe(true);
    });

    it("rejects invalid tax code formats", () => {
      expect(schema.safeParse("12345").success).toBe(false);
      expect(schema.safeParse("0312345678-01").success).toBe(false);
    });

    it("normalizes empty string to null in optional tax id", () => {
      const optSchema = zOptionalTaxId();
      expect(optSchema.parse("")).toBe(null);
      expect(optSchema.parse("0312345678")).toBe("0312345678");
    });
  });

  describe("zUuidV7", () => {
    const schema = zUuidV7();

    it("accepts RFC 9562 UUIDv7 strings", () => {
      expect(
        schema.safeParse("019315bc-3e9a-7a1b-8f3e-2b1d0a5c4e9f").success,
      ).toBe(true);
    });

    it("rejects UUIDv4 and malformed UUID strings", () => {
      // UUIDv4 (has '4' as version digit)
      expect(
        schema.safeParse("c9bf9e57-1685-4c89-bafb-ff5af830be8a").success,
      ).toBe(false);
      expect(schema.safeParse("not-a-uuid").success).toBe(false);
    });
  });

  describe("zBooleanString", () => {
    const schema = zBooleanString();

    it("coerces boolean strings and preserves booleans", () => {
      expect(schema.parse("true")).toBe(true);
      expect(schema.parse("false")).toBe(false);
      expect(schema.parse(true)).toBe(true);
      expect(schema.parse(false)).toBe(false);
    });
  });

  describe("zNumericString", () => {
    it("parses string numbers and enforces integer/min/max", () => {
      const schema = zNumericString({ integer: true, min: 1, max: 100 });
      expect(schema.parse("42")).toBe(42);
      expect(schema.parse(42)).toBe(42);
      expect(schema.safeParse("0").success).toBe(false); // below min
      expect(schema.safeParse("101").success).toBe(false); // above max
      expect(schema.safeParse("42.5").success).toBe(false); // not integer
      expect(schema.safeParse("not_a_number").success).toBe(false);
    });
  });

  describe("zCoerceDate", () => {
    const schema = zCoerceDate();

    it("parses ISO 8601 string into a Date instance", () => {
      const iso = "2026-11-16T00:00:00.000Z";
      const result = schema.parse(iso);
      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString()).toBe(iso);
    });
  });

  describe("zIsoDate", () => {
    const schema = zIsoDate();

    it("accepts valid Gregorian calendar dates in YYYY-MM-DD format", () => {
      expect(schema.parse(" 2026-09-01 ")).toBe("2026-09-01");
      expect(schema.parse("2024-02-29")).toBe("2024-02-29");
    });

    it("rejects impossible calendar dates and ISO datetime timestamps", () => {
      const invalidDates = [
        "2026-02-30",
        "2025-02-29",
        "2026-13-01",
        "2026-00-10",
        "2026-9-1",
        "2026-09-01T00:00:00.000Z",
      ];

      for (const candidate of invalidDates) {
        const parsed = schema.safeParse(candidate);
        expect(parsed.success).toBe(false);
        if (!parsed.success && parsed.error.issues[0]) {
          expect(formatZodIssue(parsed.error.issues[0])).toEqual({
            code: API_ERROR_CODES.INVALID_FORMAT,
            reason: "Invalid format: date.",
            params: { format: "date" },
          });
        }
      }
    });
  });

  describe("zCloudinaryMediaUrl", () => {
    const schema = zCloudinaryMediaUrl({
      folder: "farming_logs",
      resourceTypes: ["image", "video"],
    });
    const imageOnlySchema = zCloudinaryMediaUrl({ resourceTypes: ["image"] });
    const activeCloudName = env.CLOUDINARY_CLOUD_NAME;

    it("accepts HTTPS Cloudinary image delivery URLs when restricted to image resource type", () => {
      const validUrl = `  https://res.cloudinary.com/${activeCloudName}/image/upload/v1/plots/soil-a1.png  `;
      expect(imageOnlySchema.parse(validUrl)).toBe(
        `https://res.cloudinary.com/${activeCloudName}/image/upload/v1/plots/soil-a1.png`,
      );
      expect(
        imageOnlySchema.safeParse(
          `https://res.cloudinary.com/${activeCloudName}/video/upload/v1/plots/clip.mp4`,
        ).success,
      ).toBe(false);
    });

    it("accepts HTTPS Cloudinary image and video URLs inside the farming_logs folder", () => {
      const imageUrl = `  https://res.cloudinary.com/${activeCloudName}/image/upload/v1700000000/farming_logs/bed-a1.webp  `;
      const videoUrl = `https://res.cloudinary.com/${activeCloudName}/video/upload/farming_logs/2026/irrigation.mp4`;

      expect(schema.parse(imageUrl)).toBe(
        `https://res.cloudinary.com/${activeCloudName}/image/upload/v1700000000/farming_logs/bed-a1.webp`,
      );
      expect(schema.parse(videoUrl)).toBe(videoUrl);
    });

    it("rejects wrong folders, transformation segments, raw uploads, external hosts, and traversal", () => {
      const invalidUrls = [
        `https://res.cloudinary.com/${activeCloudName}/image/upload/v1/products/tomato.png`,
        `https://res.cloudinary.com/${activeCloudName}/image/upload/farming_logs/`,
        `https://res.cloudinary.com/${activeCloudName}/image/upload/w_500,f_auto/v1/farming_logs/a.png`,
        `https://res.cloudinary.com/${activeCloudName}/raw/upload/v1/farming_logs/a.pdf`,
        `https://res.cloudinary.com/${activeCloudName}/image/upload/v1/farming_logs/../products/a.png`,
        `https://res.cloudinary.com/${activeCloudName}/image/upload/v1/farming_logs/%2e%2e/products/a.png`,
        `https://res.cloudinary.com/${activeCloudName}/image/upload/v1/farming_logs/%2E%2E/products/a.png`,
        `https://res.cloudinary.com/${activeCloudName}/image/upload/v1/farming_logs/%252e%252e/products/a.png`,
        `https://res.cloudinary.com/${activeCloudName}/image/upload/v1/farming_logs/a%2fb.png`,
        `https://res.cloudinary.com/${activeCloudName}/image/upload/v1/farming_logs/bad%ZZ.png`,
        `http://res.cloudinary.com/${activeCloudName}/video/upload/v1/farming_logs/a.mp4`,
        `https://evil.example.com/${activeCloudName}/image/upload/farming_logs/a.png`,
        `https://res.cloudinary.com/${activeCloudName}/image/upload/farming_logs/a.png?v=1`,
        `https://res.cloudinary.com/${activeCloudName}/image/upload/farming_logs/a.png#hash`,
      ];

      for (const candidate of invalidUrls) {
        const parsed = schema.safeParse(candidate);
        expect(parsed.success).toBe(false);
        if (!parsed.success && parsed.error.issues[0]) {
          expect(formatZodIssue(parsed.error.issues[0])).toEqual({
            code: API_ERROR_CODES.INVALID_URL,
            reason: MESSAGES.VALIDATION.INVALID_URL,
          });
        }
      }
    });
  });
});
