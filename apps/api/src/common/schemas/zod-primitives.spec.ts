import { describe, expect, it } from "bun:test";
import { API_ERROR_CODES } from "@greenroots/shared";
import { env } from "@/common/config/env.config";
import { MESSAGES } from "@/common/constants/messages.constant";
import { formatZodIssue } from "@/common/pipes/zod-validation.pipe";
import {
  zBooleanString,
  zCloudinaryImageUrl,
  zCoerceDate,
  zEmail,
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
    it("should strip malicious HTML tags and collapse whitespace", () => {
      const schema = zSanitizedString();
      const input = "  <script>alert('xss')</script> Hello   <b>World</b>!  ";
      const result = schema.parse(input);
      expect(result).toBe("Hello World!");
    });

    it("should enforce min and max length boundaries", () => {
      const schema = zSanitizedString({ min: 3, max: 10 });
      expect(schema.safeParse("abc").success).toBe(true);
      expect(schema.safeParse("ab").success).toBe(false);
      expect(schema.safeParse("12345678901").success).toBe(false);
    });
  });

  describe("zEmail & zOptionalEmail", () => {
    it("should lowercase and trim valid email addresses", () => {
      const schema = zEmail();
      expect(schema.parse("  USER@GreenRoots.Farm  ")).toBe(
        "user@greenroots.farm",
      );
      expect(schema.safeParse("invalid-email").success).toBe(false);
    });

    it("should preprocess empty strings into null for optional email", () => {
      const schema = zOptionalEmail();
      expect(schema.parse("   ")).toBe(null);
      expect(schema.parse(undefined)).toBe(undefined);
      expect(schema.parse("test@greenroots.farm")).toBe("test@greenroots.farm");
    });
  });

  describe("zPassword", () => {
    const schema = zPassword();

    it("should accept strong passwords meeting OWASP criteria", () => {
      expect(schema.safeParse("GreenRoots@2026").success).toBe(true);
    });

    it("should reject passwords that are too short", () => {
      expect(schema.safeParse("Gr@2026").success).toBe(false);
    });

    it("should reject passwords missing uppercase letters", () => {
      expect(schema.safeParse("greenroots@2026").success).toBe(false);
    });

    it("should reject passwords missing numbers", () => {
      expect(schema.safeParse("GreenRoots@Farm").success).toBe(false);
    });

    it("should reject passwords missing special characters", () => {
      expect(schema.safeParse("GreenRoots2026").success).toBe(false);
    });
  });

  describe("zPhoneNumber", () => {
    const schema = zPhoneNumber();

    it("should accept valid 10-digit Vietnamese mobile phone numbers", () => {
      expect(schema.safeParse("0912345678").success).toBe(true);
      expect(schema.safeParse("0389876543").success).toBe(true);
      expect(schema.safeParse("0701122334").success).toBe(true);
      expect(schema.safeParse("0561234567").success).toBe(true);
    });

    it("should reject numbers with invalid prefixes or lengths", () => {
      expect(schema.safeParse("0281234567").success).toBe(false); // Landline prefix
      expect(schema.safeParse("091234567").success).toBe(false); // 9 digits
      expect(schema.safeParse("09123456789").success).toBe(false); // 11 digits
      expect(schema.safeParse("abc0912345").success).toBe(false);
    });
  });

  describe("zTaxId & zOptionalTaxId", () => {
    const schema = zTaxId();

    it("should accept 10-digit and 13-digit enterprise tax codes", () => {
      expect(schema.safeParse("0312345678").success).toBe(true);
      expect(schema.safeParse("0312345678-001").success).toBe(true);
    });

    it("should reject invalid tax code formats", () => {
      expect(schema.safeParse("12345").success).toBe(false);
      expect(schema.safeParse("0312345678-01").success).toBe(false);
    });

    it("should normalize empty string to null in optional tax id", () => {
      const optSchema = zOptionalTaxId();
      expect(optSchema.parse("")).toBe(null);
      expect(optSchema.parse("0312345678")).toBe("0312345678");
    });
  });

  describe("zUuidV7", () => {
    const schema = zUuidV7();

    it("should accept RFC 9562 UUIDv7 strings", () => {
      expect(
        schema.safeParse("019315bc-3e9a-7a1b-8f3e-2b1d0a5c4e9f").success,
      ).toBe(true);
    });

    it("should reject UUIDv4 and malformed UUID strings", () => {
      // UUIDv4 (has '4' as version digit)
      expect(
        schema.safeParse("c9bf9e57-1685-4c89-bafb-ff5af830be8a").success,
      ).toBe(false);
      expect(schema.safeParse("not-a-uuid").success).toBe(false);
    });
  });

  describe("zBooleanString", () => {
    const schema = zBooleanString();

    it("should coerce boolean strings and preserve booleans", () => {
      expect(schema.parse("true")).toBe(true);
      expect(schema.parse("false")).toBe(false);
      expect(schema.parse(true)).toBe(true);
      expect(schema.parse(false)).toBe(false);
    });
  });

  describe("zNumericString", () => {
    it("should parse string numbers and enforce integer/min/max", () => {
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

    it("should parse ISO 8601 string into a Date instance", () => {
      const iso = "2026-11-16T00:00:00.000Z";
      const result = schema.parse(iso);
      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString()).toBe(iso);
    });
  });

  describe("zCloudinaryImageUrl", () => {
    const schema = zCloudinaryImageUrl();
    const activeCloudName = env.CLOUDINARY_CLOUD_NAME;

    it("accepts HTTPS Cloudinary image delivery URLs for the configured cloud name", () => {
      const validUrl = `  https://res.cloudinary.com/${activeCloudName}/image/upload/v1/plots/soil-a1.png  `;
      expect(schema.parse(validUrl)).toBe(
        `https://res.cloudinary.com/${activeCloudName}/image/upload/v1/plots/soil-a1.png`,
      );
    });

    it("rejects non-HTTPS, external hosts, raw uploads, queries, fragments, and path traversal with INVALID_URL", () => {
      const invalidUrls = [
        `http://res.cloudinary.com/${activeCloudName}/image/upload/v1/plots/a.png`,
        `https://evil.example.com/${activeCloudName}/image.png`,
        `https://res.cloudinary.com/${activeCloudName}/raw/upload/v1/plots/a.pdf`,
        "https://res.cloudinary.com/other-cloud/image/upload/v1/plots/a.png",
        `https://res.cloudinary.com/${activeCloudName}/image/upload/../raw/a.png`,
        `https://res.cloudinary.com/${activeCloudName}/image/upload/v1/plots/a.png?foo=bar`,
        `https://res.cloudinary.com/${activeCloudName}/image/upload/v1/plots/a.png#frag`,
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
