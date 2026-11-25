import { describe, expect, it } from "bun:test";
import type { Request } from "express";
import {
  extractClientMetadata,
  resolveTrustedClientIp,
} from "./client-info.util";

const TEST_SECRET = "test-bff-shared-secret-32-chars!!";

describe("client-info.util", () => {
  describe("resolveTrustedClientIp", () => {
    it("returns undefined when request is undefined", () => {
      expect(resolveTrustedClientIp(undefined, TEST_SECRET)).toBeUndefined();
    });

    // Invariant: INV-SF-AUTH-9
    it("trusts X-BFF-Client-IP when X-Internal-Proxy-Secret matches in constant time", () => {
      const req = {
        headers: {
          "x-internal-proxy-secret": TEST_SECRET,
          "x-bff-client-ip": " 203.0.113.195 ",
        },
        ip: "10.0.0.5",
      } as unknown as Request;

      expect(resolveTrustedClientIp(req, TEST_SECRET)).toBe("203.0.113.195");
    });

    // Invariant: INV-SF-AUTH-9
    it("ignores X-BFF-Client-IP when secret is missing or mismatched", () => {
      const wrongSecretReq = {
        headers: {
          "x-internal-proxy-secret": "wrong-secret-with-same-length-32!!",
          "x-bff-client-ip": "203.0.113.195",
        },
        ip: "10.0.0.5",
      } as unknown as Request;

      const differentLengthSecretReq = {
        headers: {
          "x-internal-proxy-secret": "short",
          "x-bff-client-ip": "203.0.113.195",
        },
        ip: "10.0.0.6",
      } as unknown as Request;

      const missingSecretConfigReq = {
        headers: {
          "x-internal-proxy-secret": TEST_SECRET,
          "x-bff-client-ip": "203.0.113.195",
        },
        ip: "10.0.0.7",
      } as unknown as Request;

      expect(resolveTrustedClientIp(wrongSecretReq, TEST_SECRET)).toBe(
        "10.0.0.5",
      );
      expect(
        resolveTrustedClientIp(differentLengthSecretReq, TEST_SECRET),
      ).toBe("10.0.0.6");
      expect(resolveTrustedClientIp(missingSecretConfigReq, undefined)).toBe(
        "10.0.0.7",
      );
    });

    // Invariant: INV-SF-AUTH-9
    it("falls back to req.ip when X-BFF-Client-IP is not a valid IP address", () => {
      const req = {
        headers: {
          "x-internal-proxy-secret": TEST_SECRET,
          "x-bff-client-ip": "not-an-ip, 203.0.113.195",
        },
        ip: "10.0.0.8",
      } as unknown as Request;

      expect(resolveTrustedClientIp(req, TEST_SECRET)).toBe("10.0.0.8");
    });

    // Invariant: INV-SF-AUTH-9
    it("ignores unauthenticated x-forwarded-for and x-real-ip headers", () => {
      const req = {
        headers: {
          "x-forwarded-for": "203.0.113.195, 70.41.3.18",
          "x-real-ip": "192.0.2.1",
        },
        ip: "127.0.0.1",
      } as unknown as Request;

      expect(resolveTrustedClientIp(req, TEST_SECRET)).toBe("127.0.0.1");
    });

    it("falls back to req.socket.remoteAddress when req.ip is absent", () => {
      const req = {
        headers: {},
        socket: {
          remoteAddress: "::1",
        },
      } as unknown as Request;

      expect(resolveTrustedClientIp(req, undefined)).toBe("::1");
    });

    it("clamps ipAddress to 45 characters max", () => {
      const longIp =
        "2001:0db8:85a3:0000:0000:8a2e:0370:7334:extra:padding:data";
      const req = {
        headers: {},
        ip: longIp,
      } as unknown as Request;

      const result = resolveTrustedClientIp(req, undefined);
      expect(result).toBe(longIp.substring(0, 45));
      expect(result?.length).toBe(45);
    });
  });

  describe("extractClientMetadata", () => {
    it("returns an empty object when request is undefined", () => {
      expect(extractClientMetadata(undefined)).toEqual({});
    });

    it("returns undefined fields when request has empty headers and socket", () => {
      const req = {
        headers: {},
      } as unknown as Request;

      expect(extractClientMetadata(req, undefined)).toEqual({
        deviceName: undefined,
        ipAddress: undefined,
        userAgent: undefined,
      });
    });

    it("normalizes empty or whitespace User-Agent to undefined", () => {
      const emptyReq = {
        headers: {
          "user-agent": "",
        },
      } as unknown as Request;
      const whitespaceReq = {
        headers: {
          "user-agent": "   \t\n  ",
        },
      } as unknown as Request;

      expect(
        extractClientMetadata(emptyReq, undefined).userAgent,
      ).toBeUndefined();
      expect(
        extractClientMetadata(whitespaceReq, undefined).deviceName,
      ).toBeUndefined();
    });

    it("strips control characters and clamps User-Agent to 255 characters", () => {
      const req = {
        headers: {
          "user-agent": ` Mozilla/5.0\r\n\x00 ${"A".repeat(300)} `,
        },
      } as unknown as Request;

      const result = extractClientMetadata(req, undefined);
      expect(result.deviceName?.startsWith("Mozilla/5.0 ")).toBe(true);
      expect(result.deviceName?.includes("\r")).toBe(false);
      expect(result.deviceName?.includes("\n")).toBe(false);
      expect(result.deviceName?.includes("\x00")).toBe(false);
      expect(result.deviceName?.length).toBe(255);
      expect(result.userAgent).toBe(result.deviceName);
    });

    it("extracts trusted BFF IP and User-Agent together", () => {
      const req = {
        headers: {
          "x-internal-proxy-secret": TEST_SECRET,
          "x-bff-client-ip": "203.0.113.195",
          "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)",
        },
        ip: "10.0.0.1",
      } as unknown as Request;

      expect(extractClientMetadata(req, TEST_SECRET)).toEqual({
        deviceName: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)",
        ipAddress: "203.0.113.195",
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)",
      });
    });
  });
});
