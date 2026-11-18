import { describe, expect, it } from "bun:test";
import type { Request } from "express";
import { extractClientMetadata } from "./client-info.util";

describe("client-info.util", () => {
  describe("extractClientMetadata", () => {
    it("returns an empty object when request is undefined", () => {
      const result = extractClientMetadata(undefined);
      expect(result).toEqual({});
    });

    it("returns an empty object when request has empty headers and socket", () => {
      const req = {
        headers: {},
      } as unknown as Request;

      const result = extractClientMetadata(req);
      expect(result).toEqual({
        deviceName: undefined,
        ipAddress: undefined,
        userAgent: undefined,
      });
    });

    it("extracts client IP from x-forwarded-for with single IP", () => {
      const req = {
        headers: {
          "x-forwarded-for": "203.0.113.195",
        },
      } as unknown as Request;

      const result = extractClientMetadata(req);
      expect(result.ipAddress).toBe("203.0.113.195");
    });

    it("extracts first client IP from comma-separated x-forwarded-for and trims whitespace", () => {
      const req = {
        headers: {
          "x-forwarded-for": "  203.0.113.195 , 70.41.3.18, 150.172.238.178",
        },
      } as unknown as Request;

      const result = extractClientMetadata(req);
      expect(result.ipAddress).toBe("203.0.113.195");
    });

    it("handles x-forwarded-for as string array", () => {
      const req = {
        headers: {
          "x-forwarded-for": [" 198.51.100.1, 10.0.0.1", "10.0.0.2"],
        },
      } as unknown as Request;

      const result = extractClientMetadata(req);
      expect(result.ipAddress).toBe("198.51.100.1");
    });

    it("falls back to x-real-ip when x-forwarded-for is missing", () => {
      const req = {
        headers: {
          "x-real-ip": " 192.0.2.1 ",
        },
      } as unknown as Request;

      const result = extractClientMetadata(req);
      expect(result.ipAddress).toBe("192.0.2.1");
    });

    it("handles x-real-ip as string array", () => {
      const req = {
        headers: {
          "x-real-ip": [" 192.0.2.5 "],
        },
      } as unknown as Request;

      const result = extractClientMetadata(req);
      expect(result.ipAddress).toBe("192.0.2.5");
    });

    it("falls back to req.ip when proxy headers are absent", () => {
      const req = {
        headers: {},
        ip: "127.0.0.1",
      } as unknown as Request;

      const result = extractClientMetadata(req);
      expect(result.ipAddress).toBe("127.0.0.1");
    });

    it("falls back to req.socket.remoteAddress when req.ip is absent", () => {
      const req = {
        headers: {},
        socket: {
          remoteAddress: "::1",
        },
      } as unknown as Request;

      const result = extractClientMetadata(req);
      expect(result.ipAddress).toBe("::1");
    });

    it("clamps ipAddress to 45 characters max (IPv6 limit)", () => {
      const longIp =
        "2001:0db8:85a3:0000:0000:8a2e:0370:7334:extra:padding:data";
      const req = {
        headers: {
          "x-forwarded-for": longIp,
        },
      } as unknown as Request;

      const result = extractClientMetadata(req);
      expect(result.ipAddress).toBe(longIp.substring(0, 45));
      expect(result.ipAddress?.length).toBe(45);
    });

    it("extracts User-Agent and populates both deviceName and userAgent", () => {
      const userAgent =
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)";
      const req = {
        headers: {
          "user-agent": userAgent,
        },
      } as unknown as Request;

      const result = extractClientMetadata(req);
      expect(result.deviceName).toBe(userAgent);
      expect(result.userAgent).toBe(userAgent);
    });

    it("handles user-agent as string array and trims whitespace", () => {
      const req = {
        headers: {
          "user-agent": [" Mozilla/5.0 Chrome/120.0 "],
        },
      } as unknown as Request;

      const result = extractClientMetadata(req);
      expect(result.deviceName).toBe("Mozilla/5.0 Chrome/120.0");
      expect(result.userAgent).toBe("Mozilla/5.0 Chrome/120.0");
    });

    it("clamps deviceName and userAgent to 255 characters max", () => {
      const longUserAgent = "A".repeat(300);
      const req = {
        headers: {
          "user-agent": longUserAgent,
        },
      } as unknown as Request;

      const result = extractClientMetadata(req);
      expect(result.deviceName).toBe("A".repeat(255));
      expect(result.userAgent).toBe("A".repeat(255));
      expect(result.deviceName?.length).toBe(255);
    });

    it("extracts combined IP and User-Agent correctly", () => {
      const req = {
        headers: {
          "x-forwarded-for": "203.0.113.195, 10.0.0.1",
          "user-agent": "GreenRootsStorefront/1.0",
        },
      } as unknown as Request;

      const result = extractClientMetadata(req);
      expect(result).toEqual({
        deviceName: "GreenRootsStorefront/1.0",
        ipAddress: "203.0.113.195",
        userAgent: "GreenRootsStorefront/1.0",
      });
    });
  });
});
