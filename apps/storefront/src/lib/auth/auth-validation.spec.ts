import { describe, expect, it } from "bun:test";
import {
  PASSWORD_MAX_LENGTH,
  decrementCooldownSeconds,
  evaluatePasswordRules,
  formatResendCooldownLabel,
  loginFormSchema,
  normalizeOptionalPhone,
  registerFormSchema,
  resendVerificationFormSchema,
} from "./auth-validation";

describe("Storefront Auth Validation", () => {
  describe("loginFormSchema", () => {
    it("accepts normalized email and non-empty password", () => {
      // Invariant: INV-SF-AUTH-UI-1
      const parsed = loginFormSchema.safeParse({
        email: "  MinhAnh@Email.com ",
        password: "Password@123",
      });

      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data).toEqual({
          email: "minhanh@email.com",
          password: "Password@123",
        });
      }
    });

    it("rejects phone numbers, malformed emails, and unexpected extra keys", () => {
      // Invariant: INV-SF-AUTH-UI-1
      const phoneLogin = loginFormSchema.safeParse({
        email: "0908412679",
        password: "Password@123",
      });
      const blankPassword = loginFormSchema.safeParse({
        email: "minhanh@email.com",
        password: "",
      });
      const extraKey = loginFormSchema.safeParse({
        email: "minhanh@email.com",
        password: "Password@123",
        role: "admin",
      });

      expect(phoneLogin.success).toBe(false);
      expect(blankPassword.success).toBe(false);
      expect(extraKey.success).toBe(false);
    });
  });

  describe("normalizeOptionalPhone", () => {
    it("returns undefined when input is blank or whitespace", () => {
      // Invariant: INV-SF-AUTH-UI-2
      expect(normalizeOptionalPhone(undefined)).toBeUndefined();
      expect(normalizeOptionalPhone(null)).toBeUndefined();
      expect(normalizeOptionalPhone("")).toBeUndefined();
      expect(normalizeOptionalPhone("   \t  ")).toBeUndefined();
    });

    it("strips internal spaces from entered Vietnamese phone numbers", () => {
      // Invariant: INV-SF-AUTH-UI-2
      expect(normalizeOptionalPhone(" 0908 412 679 ")).toBe("0908412679");
    });
  });

  describe("evaluatePasswordRules", () => {
    it("validates OWASP length, uppercase, digit, and special character criteria", () => {
      // Invariant: INV-SF-AUTH-UI-3
      expect(evaluatePasswordRules("weakpass")).toEqual({
        minLength: true,
        maxLength: true,
        hasUppercase: false,
        hasNumber: false,
        hasSpecial: false,
        isValid: false,
      });

      expect(evaluatePasswordRules("GreenRoots1")).toMatchObject({
        minLength: true,
        hasUppercase: true,
        hasNumber: true,
        hasSpecial: false,
        isValid: false,
      });

      expect(
        evaluatePasswordRules(`A1@${"a".repeat(PASSWORD_MAX_LENGTH)}`),
      ).toMatchObject({
        minLength: true,
        maxLength: false,
        isValid: false,
      });

      expect(evaluatePasswordRules("GreenRoots@1")).toEqual({
        minLength: true,
        maxLength: true,
        hasUppercase: true,
        hasNumber: true,
        hasSpecial: true,
        isValid: true,
      });
    });
  });

  describe("registerFormSchema", () => {
    it("omits phone when left blank while enforcing terms acceptance and password confirmation", () => {
      // Invariant: INV-SF-AUTH-UI-2
      const parsed = registerFormSchema.safeParse({
        fullName: "  Nguyễn   Minh Anh ",
        phone: "   ",
        email: "MinhAnh@Email.com",
        password: "GreenRoots@1",
        confirmPassword: "GreenRoots@1",
        agreeTerms: true,
      });

      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.phone).toBeUndefined();
        expect(parsed.data.fullName).toBe("Nguyễn Minh Anh");
        expect(parsed.data.email).toBe("minhanh@email.com");
      }
    });

    it("normalizes valid spaced phone numbers and rejects invalid formats or extra keys", () => {
      // Invariant: INV-SF-AUTH-UI-2
      const validWithSpaces = registerFormSchema.safeParse({
        fullName: "Nguyễn Minh Anh",
        phone: "0908 412 679",
        email: "minhanh@email.com",
        password: "GreenRoots@1",
        confirmPassword: "GreenRoots@1",
        agreeTerms: true,
      });
      const invalidPhone = registerFormSchema.safeParse({
        fullName: "Nguyễn Minh Anh",
        phone: "0123456789",
        email: "minhanh@email.com",
        password: "GreenRoots@1",
        confirmPassword: "GreenRoots@1",
        agreeTerms: true,
      });
      const mismatch = registerFormSchema.safeParse({
        fullName: "Nguyễn Minh Anh",
        email: "minhanh@email.com",
        password: "GreenRoots@1",
        confirmPassword: "GreenRoots@2",
        agreeTerms: true,
      });
      const uncheckedTerms = registerFormSchema.safeParse({
        fullName: "Nguyễn Minh Anh",
        email: "minhanh@email.com",
        password: "GreenRoots@1",
        confirmPassword: "GreenRoots@1",
        agreeTerms: false,
      });
      const extraField = registerFormSchema.safeParse({
        fullName: "Nguyễn Minh Anh",
        email: "minhanh@email.com",
        password: "GreenRoots@1",
        confirmPassword: "GreenRoots@1",
        agreeTerms: true,
        role: "super_admin",
      });

      expect(validWithSpaces.success).toBe(true);
      if (validWithSpaces.success) {
        expect(validWithSpaces.data.phone).toBe("0908412679");
      }
      expect(invalidPhone.success).toBe(false);
      expect(mismatch.success).toBe(false);
      expect(uncheckedTerms.success).toBe(false);
      expect(extraField.success).toBe(false);
    });
  });

  describe("resendVerificationFormSchema", () => {
    it("normalizes valid email and rejects malformed addresses or extra keys", () => {
      // Invariant: INV-SF-AUTH-UI-6
      const valid = resendVerificationFormSchema.safeParse({
        email: "  MinhAnh@Email.com ",
      });
      const invalid = resendVerificationFormSchema.safeParse({
        email: "not-an-email",
      });
      const extraKey = resendVerificationFormSchema.safeParse({
        email: "minhanh@email.com",
        token: "override",
      });

      expect(valid.success).toBe(true);
      if (valid.success) {
        expect(valid.data.email).toBe("minhanh@email.com");
      }
      expect(invalid.success).toBe(false);
      expect(extraKey.success).toBe(false);
    });
  });

  describe("resend cooldown helpers", () => {
    it("decrements positive cooldown seconds down to zero and formats active labels", () => {
      // Invariant: INV-SF-AUTH-UI-6
      expect(decrementCooldownSeconds(60)).toBe(59);
      expect(decrementCooldownSeconds(1)).toBe(0);
      expect(decrementCooldownSeconds(0)).toBe(0);
      expect(decrementCooldownSeconds(Number.NaN)).toBe(0);

      expect(formatResendCooldownLabel(0)).toBe("Gửi lại email xác thực");
      expect(formatResendCooldownLabel(12)).toBe("Gửi lại sau 12s");
    });
  });
});
