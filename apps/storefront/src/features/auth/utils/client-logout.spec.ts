import { describe, expect, it } from "bun:test";
import { performStorefrontLogout } from "./client-logout";

describe("Storefront Client Logout", () => {
  describe("performStorefrontLogout", () => {
    it("clears client store and broadcasts logout event when BFF returns success", async () => {
      let cleared = 0;
      let broadcasted = 0;

      const result = await performStorefrontLogout({
        fetcher: () => Promise.resolve(new Response(null, { status: 200 })),
        clearSession: () => {
          cleared++;
        },
        broadcastLogout: () => {
          broadcasted++;
        },
      });

      expect(result).toEqual({ ok: true });
      expect(cleared).toBe(1);
      expect(broadcasted).toBe(1);
    });

    it("preserves client session and returns localized message when logout request fails", async () => {
      let cleared = 0;
      let broadcasted = 0;

      const failedResponse = await performStorefrontLogout({
        fetcher: () => Promise.resolve(new Response(null, { status: 403 })),
        clearSession: () => {
          cleared++;
        },
        broadcastLogout: () => {
          broadcasted++;
        },
      });

      const networkError = await performStorefrontLogout({
        fetcher: () => Promise.reject(new Error("ECONNREFUSED")),
        clearSession: () => {
          cleared++;
        },
        broadcastLogout: () => {
          broadcasted++;
        },
      });

      expect(failedResponse.ok).toBe(false);
      expect(networkError.ok).toBe(false);
      expect(cleared).toBe(0);
      expect(broadcasted).toBe(0);
    });
  });
});
