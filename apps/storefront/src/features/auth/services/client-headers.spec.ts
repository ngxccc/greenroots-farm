import { describe, expect, it } from "bun:test";
import {
  buildForwardedClientHeaders,
  extractSanitizedClientIp,
  sanitizeUserAgent,
} from "./client-headers";

describe("client-headers", () => {
  describe("extractSanitizedClientIp", () => {
    // Invariant: INV-SF-AUTH-10
    it("prioritizes cf-connecting-ip over x-real-ip and x-forwarded-for", () => {
      const headers = new Headers({
        "cf-connecting-ip": "198.51.100.10",
        "x-real-ip": "192.0.2.5",
        "x-forwarded-for": "203.0.113.1, 10.0.0.1",
      });

      expect(extractSanitizedClientIp(headers)).toBe("198.51.100.10");
    });

    // Invariant: INV-SF-AUTH-10
    it("falls back to x-real-ip when cf-connecting-ip is absent", () => {
      const headers = new Headers({
        "x-real-ip": " 192.0.2.5 ",
        "x-forwarded-for": "203.0.113.1, 10.0.0.1",
      });

      expect(extractSanitizedClientIp(headers)).toBe("192.0.2.5");
    });

    // Invariant: INV-SF-AUTH-10
    it("extracts rightmost valid IP from x-forwarded-for to prevent client-prepended spoofing", () => {
      const headers = new Headers({
        "x-forwarded-for": "127.0.0.1, invalid-ip, 203.0.113.42",
      });

      expect(extractSanitizedClientIp(headers)).toBe("203.0.113.42");
    });

    it("supports IPv6 addresses and rejects malformed IP strings", () => {
      expect(extractSanitizedClientIp({ "x-real-ip": "2001:db8::1" })).toBe(
        "2001:db8::1",
      );
      expect(
        extractSanitizedClientIp({
          "cf-connecting-ip": "spoofed.local",
          "x-forwarded-for": "not-an-ip",
        }),
      ).toBeUndefined();
    });
  });

  describe("sanitizeUserAgent", () => {
    // Invariant: INV-SF-AUTH-10
    it("strips control characters, trims whitespace, and clamps to 255 chars", () => {
      const raw = `  Mozilla/5.0\r\n\x00\x7f ${"B".repeat(300)}  `;
      const sanitized = sanitizeUserAgent(raw);

      expect(sanitized.startsWith("Mozilla/5.0 ")).toBe(true);
      expect(sanitized.includes("\r")).toBe(false);
      expect(sanitized.includes("\n")).toBe(false);
      expect(sanitized.includes("\x00")).toBe(false);
      expect(sanitized.length).toBe(255);
    });

    // Invariant: INV-SF-AUTH-10
    it("returns empty string when User-Agent is missing or empty", () => {
      expect(sanitizeUserAgent(undefined)).toBe("");
      expect(sanitizeUserAgent(null)).toBe("");
      expect(sanitizeUserAgent("  \r\n\t ")).toBe("");
    });
  });

  describe("buildForwardedClientHeaders", () => {
    // Invariant: INV-SF-AUTH-10
    it("attaches X-BFF-Client-IP and X-Internal-Proxy-Secret without forwarding raw proxy headers", () => {
      const headers = new Headers({
        "user-agent": "Mozilla/5.0 Chrome/130.0",
        "x-forwarded-for": "1.1.1.1, 203.0.113.99",
        "x-real-ip": "203.0.113.99",
      });

      const forwarded = buildForwardedClientHeaders(headers, {
        proxySecret: "shared-secret-16-chars",
      });

      expect(forwarded).toEqual({
        "User-Agent": "Mozilla/5.0 Chrome/130.0",
        "X-BFF-Client-IP": "203.0.113.99",
        "X-Internal-Proxy-Secret": "shared-secret-16-chars",
      });
      expect("x-forwarded-for" in forwarded).toBe(false);
      expect("x-real-ip" in forwarded).toBe(false);
    });

    // Invariant: INV-SF-AUTH-10
    it("sends empty User-Agent and omits IP headers when source headers are missing", () => {
      const forwarded = buildForwardedClientHeaders(undefined, {
        proxySecret: "shared-secret-16-chars",
      });

      expect(forwarded).toEqual({
        "User-Agent": "",
      });
    });

    it("omits X-Internal-Proxy-Secret when secret is not configured", () => {
      const forwarded = buildForwardedClientHeaders(
        { "x-real-ip": "127.0.0.1", "user-agent": "Safari/17" },
        { proxySecret: "" },
      );

      expect(forwarded).toEqual({
        "User-Agent": "Safari/17",
        "X-BFF-Client-IP": "127.0.0.1",
      });
    });
  });
});
