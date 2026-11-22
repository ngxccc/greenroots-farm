import { afterEach, describe, expect, it } from "bun:test";
import { ApiClientError, api } from "./api-client";

describe("Storefront ApiClient", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    (globalThis as { window?: unknown }).window = originalWindow;
  });

  describe("Q28 browser isolation", () => {
    it("rejects direct browser calls with an internal client error", async () => {
      // Invariant: INV-SF-AUTH-1
      (globalThis as { window?: unknown }).window = {};

      let caught: unknown;
      try {
        await api.GET("/api/v1/users/me", {
          baseUrl: "http://localhost:3000",
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(ApiClientError);
      expect((caught as ApiClientError).status).toBe(500);
    });
  });
});
