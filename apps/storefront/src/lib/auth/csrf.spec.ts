import { describe, expect, it } from "bun:test";
import { isSameOriginMutationRequest } from "./csrf";

describe("CSRF Origin Guard", () => {
  describe("isSameOriginMutationRequest", () => {
    it("accepts requests whose Origin matches the configured storefront URL", () => {
      // Invariant: INV-SF-AUTH-7
      const req = new Request("http://localhost:3001/api/auth/logout", {
        method: "POST",
        headers: {
          origin: "http://localhost:3001",
          host: "localhost:3001",
        },
      });
      expect(isSameOriginMutationRequest(req, "http://localhost:3001")).toBe(
        true,
      );
    });

    it("accepts localhost and 127.0.0.1 loopback parity on matching port", () => {
      const req = new Request("http://127.0.0.1:3001/api/auth/logout", {
        method: "POST",
        headers: {
          origin: "http://127.0.0.1:3001",
          host: "127.0.0.1:3001",
        },
      });
      expect(isSameOriginMutationRequest(req, "http://localhost:3001")).toBe(
        true,
      );
    });

    it("falls back to Referer origin when Origin header is absent", () => {
      const req = new Request("http://localhost:3001/api/auth/logout", {
        method: "POST",
        headers: {
          referer: "http://localhost:3001/products/xa-lach-romaine",
          host: "localhost:3001",
        },
      });
      expect(isSameOriginMutationRequest(req, "http://localhost:3001")).toBe(
        true,
      );
    });

    it("rejects cross-site origins and requests missing both Origin and Referer", () => {
      // Invariant: INV-SF-AUTH-7
      const crossSite = new Request("http://localhost:3001/api/auth/logout", {
        method: "POST",
        headers: {
          origin: "https://evil.example",
          host: "localhost:3001",
        },
      });
      const missingBoth = new Request("http://localhost:3001/api/auth/logout", {
        method: "POST",
        headers: {
          host: "localhost:3001",
        },
      });
      expect(
        isSameOriginMutationRequest(crossSite, "http://localhost:3001"),
      ).toBe(false);
      expect(
        isSameOriginMutationRequest(missingBoth, "http://localhost:3001"),
      ).toBe(false);
    });
  });
});
