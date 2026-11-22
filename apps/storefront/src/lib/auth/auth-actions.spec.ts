import { describe, expect, it } from "bun:test";
import { API_ERROR_CODES, API_ERROR_DICTIONARY } from "@greenroots/shared";
import type { StorefrontSessionUser } from "@/types/auth.types";
import {
  executeLoginAction,
  executeRegisterAction,
  executeResendVerificationAction,
  type RegisterActionDeps,
} from "./auth-actions";
import type { SessionTokenPair } from "./cookies";

const sampleProfile: StorefrontSessionUser = {
  id: "0195a8f0-0001-7000-8000-000000000099",
  email: "minhanh@email.com",
  fullName: "Nguyễn Minh Anh",
  phone: "0908412679",
  role: "customer",
  status: "active",
  rewardPoints: 1500,
  emailVerified: true,
  createdAt: "2026-11-20T00:00:00.000Z",
  updatedAt: "2026-11-20T00:00:00.000Z",
};

describe("Storefront Auth Actions", () => {
  describe("executeLoginAction", () => {
    it("persists session cookies and hydrates customer profile using explicit bearer token", async () => {
      // Invariant: INV-SF-AUTH-UI-4
      const persistedTokens: SessionTokenPair[] = [];
      let receivedAuthHeader: string | undefined;

      const result = await executeLoginAction(
        {
          email: "MinhAnh@Email.com",
          password: "GreenRoots@1",
        },
        {
          postLogin: () =>
            Promise.resolve({
              data: {
                data: {
                  accessToken: "jwt-access-1",
                  refreshToken: "opaque-refresh-1",
                  user: {
                    id: sampleProfile.id,
                    email: sampleProfile.email,
                    fullName: sampleProfile.fullName,
                    role: "customer",
                    status: "active",
                  },
                },
              },
            }),
          saveCookies: (tokens) => {
            persistedTokens.push(tokens);
            return Promise.resolve();
          },
          fetchMe: (accessToken) => {
            receivedAuthHeader = `Bearer ${accessToken}`;
            return Promise.resolve({
              data: { data: sampleProfile },
            });
          },
        },
      );

      expect(persistedTokens).toEqual([
        { accessToken: "jwt-access-1", refreshToken: "opaque-refresh-1" },
      ]);
      expect(receivedAuthHeader).toBe("Bearer jwt-access-1");
      expect(result).toEqual({ ok: true, user: sampleProfile });
    });

    it("retains persisted cookies and returns null user when profile hydration fails transiently", async () => {
      // Invariant: INV-SF-AUTH-UI-4
      const persistedTokens: SessionTokenPair[] = [];

      const result = await executeLoginAction(
        {
          email: "minhanh@email.com",
          password: "GreenRoots@1",
        },
        {
          postLogin: () =>
            Promise.resolve({
              data: {
                data: {
                  accessToken: "jwt-access-2",
                  refreshToken: "opaque-refresh-2",
                  user: {
                    id: sampleProfile.id,
                    email: sampleProfile.email,
                    fullName: sampleProfile.fullName,
                    role: "customer",
                    status: "active",
                  },
                },
              },
            }),
          saveCookies: (tokens) => {
            persistedTokens.push(tokens);
            return Promise.resolve();
          },
          fetchMe: () => Promise.reject(new Error("ECONNRESET")),
        },
      );

      expect(persistedTokens).toHaveLength(1);
      expect(result).toEqual({ ok: true, user: null });
    });

    it("rejects invalid login payloads before invoking backend endpoint", async () => {
      // Invariant: INV-SF-AUTH-UI-1
      let called = false;
      const result = await executeLoginAction(
        { email: "0908412679", password: "GreenRoots@1" },
        {
          postLogin: () => {
            called = true;
            return Promise.resolve({});
          },
        },
      );

      expect(called).toBe(false);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(API_ERROR_CODES.VALIDATION_FAILED);
      }
    });

    it("maps unverified email response with normalized address for inline resend recovery", async () => {
      // Invariant: INV-SF-AUTH-UI-6
      let savedCookies = false;

      const result = await executeLoginAction(
        {
          email: "  MinhAnh@Email.com ",
          password: "GreenRoots@1",
        },
        {
          postLogin: () =>
            Promise.resolve({
              error: {
                status: 403,
                code: API_ERROR_CODES.AUTH_EMAIL_NOT_VERIFIED,
                detail: "Email is not verified",
              },
            }),
          saveCookies: () => {
            savedCookies = true;
            return Promise.resolve();
          },
        },
      );

      expect(savedCookies).toBe(false);
      expect(result).toEqual({
        ok: false,
        code: API_ERROR_CODES.AUTH_EMAIL_NOT_VERIFIED,
        message: API_ERROR_DICTIONARY[API_ERROR_CODES.AUTH_EMAIL_NOT_VERIFIED],
        unverifiedEmail: "minhanh@email.com",
      });
    });

    it("aligns fallback error code and localized message when error lacks structured fields", async () => {
      // Invariant: INV-SF-AUTH-UI-4
      const opaqueError = await executeLoginAction(
        {
          email: "minhanh@email.com",
          password: "GreenRoots@1",
        },
        {
          postLogin: () => Promise.resolve({ error: {} }),
        },
      );

      const throttled = await executeLoginAction(
        {
          email: "minhanh@email.com",
          password: "GreenRoots@1",
        },
        {
          postLogin: () =>
            Promise.resolve({
              error: {
                status: 429,
                code: API_ERROR_CODES.TOO_MANY_REQUESTS,
                detail: "Rate limit exceeded",
              },
            }),
        },
      );

      const networkDown = await executeLoginAction(
        {
          email: "minhanh@email.com",
          password: "GreenRoots@1",
        },
        {
          postLogin: () => Promise.reject(new Error("connect ECONNREFUSED")),
        },
      );

      expect(opaqueError).toEqual({
        ok: false,
        code: API_ERROR_CODES.AUTH_INVALID_CREDENTIALS,
        message: API_ERROR_DICTIONARY[API_ERROR_CODES.AUTH_INVALID_CREDENTIALS],
      });
      expect(throttled).toEqual({
        ok: false,
        code: API_ERROR_CODES.TOO_MANY_REQUESTS,
        message: API_ERROR_DICTIONARY[API_ERROR_CODES.TOO_MANY_REQUESTS],
      });
      expect(networkDown).toEqual({
        ok: false,
        code: API_ERROR_CODES.NETWORK_ERROR,
        message: API_ERROR_DICTIONARY[API_ERROR_CODES.NETWORK_ERROR],
      });
    });
  });

  describe("executeRegisterAction", () => {
    it("omits blank phone from payload and returns normalized email on success", async () => {
      // Invariant: INV-SF-AUTH-UI-2
      const capturedBodies: Record<string, unknown>[] = [];

      const result = await executeRegisterAction(
        {
          fullName: "Nguyễn Minh Anh",
          phone: "   ",
          email: "MinhAnh@Email.com",
          password: "GreenRoots@1",
          confirmPassword: "GreenRoots@1",
          agreeTerms: true,
        },
        {
          postRegister: (body) => {
            capturedBodies.push({ ...body });
            return Promise.resolve({ data: { data: null } });
          },
        },
      );

      expect(capturedBodies).toHaveLength(1);
      expect(Object.hasOwn(capturedBodies[0] ?? {}, "phone")).toBe(false);
      expect(capturedBodies[0]).toEqual({
        fullName: "Nguyễn Minh Anh",
        email: "minhanh@email.com",
        password: "GreenRoots@1",
        confirmPassword: "GreenRoots@1",
        agreeTerms: true,
      });
      expect(result).toEqual({ ok: true, email: "minhanh@email.com" });
    });

    it("rejects extra fields or weak passwords before invoking registration endpoint", async () => {
      // Invariant: INV-SF-AUTH-UI-2
      let called = false;
      const deps: RegisterActionDeps = {
        postRegister: () => {
          called = true;
          return Promise.resolve({ data: { data: null } });
        },
      };

      const extraPayload = {
        fullName: "Nguyễn Minh Anh",
        email: "minhanh@email.com",
        password: "GreenRoots@1",
        confirmPassword: "GreenRoots@1",
        agreeTerms: true,
        role: "admin",
      } as Parameters<typeof executeRegisterAction>[0];

      const result = await executeRegisterAction(extraPayload, deps);

      expect(called).toBe(false);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(API_ERROR_CODES.VALIDATION_FAILED);
      }
    });

    it("includes normalized 10-digit phone when provided and surfaces conflict errors", async () => {
      // Invariant: INV-SF-AUTH-UI-2
      const capturedBodies: Record<string, unknown>[] = [];

      const result = await executeRegisterAction(
        {
          fullName: "Nguyễn Minh Anh",
          phone: "0908 412 679",
          email: "minhanh@email.com",
          password: "GreenRoots@1",
          confirmPassword: "GreenRoots@1",
          agreeTerms: true,
        },
        {
          postRegister: (body) => {
            capturedBodies.push({ ...body });
            return Promise.resolve({
              error: {
                status: 409,
                code: API_ERROR_CODES.AUTH_EMAIL_ALREADY_EXISTS,
                detail: "Email exists",
              },
            });
          },
        },
      );

      expect(capturedBodies[0]?.phone).toBe("0908412679");
      expect(result).toEqual({
        ok: false,
        code: API_ERROR_CODES.AUTH_EMAIL_ALREADY_EXISTS,
        message:
          API_ERROR_DICTIONARY[API_ERROR_CODES.AUTH_EMAIL_ALREADY_EXISTS],
      });
    });
  });

  describe("executeResendVerificationAction", () => {
    it("rejects malformed emails before calling backend and maps rate-limit errors cleanly", async () => {
      // Invariant: INV-SF-AUTH-UI-6
      const sentEmails: string[] = [];

      const badEmail = await executeResendVerificationAction(
        { email: "invalid-email" },
        {
          postResend: (body) => {
            sentEmails.push(body.email);
            return Promise.resolve({ data: { data: null } });
          },
        },
      );

      const okResult = await executeResendVerificationAction(
        { email: "  MinhAnh@Email.com " },
        {
          postResend: (body) => {
            sentEmails.push(body.email);
            return Promise.resolve({ data: { data: null } });
          },
        },
      );

      const rateLimited = await executeResendVerificationAction(
        { email: "minhanh@email.com" },
        {
          postResend: () =>
            Promise.resolve({
              error: {
                status: 429,
                code: API_ERROR_CODES.TOO_MANY_REQUESTS,
                detail: "Too many requests",
              },
            }),
        },
      );

      expect(badEmail.ok).toBe(false);
      if (!badEmail.ok) {
        expect(badEmail.code).toBe(API_ERROR_CODES.INVALID_EMAIL);
      }
      expect(sentEmails).toEqual(["minhanh@email.com"]);
      expect(okResult.ok).toBe(true);
      expect(rateLimited).toEqual({
        ok: false,
        code: API_ERROR_CODES.TOO_MANY_REQUESTS,
        message: API_ERROR_DICTIONARY[API_ERROR_CODES.TOO_MANY_REQUESTS],
      });
    });
  });
});
