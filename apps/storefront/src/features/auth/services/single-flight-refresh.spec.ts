import { beforeEach, describe, expect, it } from "bun:test";
import {
  refreshSingleFlight,
  resetSingleFlightStateForTests,
} from "@/features/auth/services/single-flight-refresh";

describe("SingleFlightRefresh", () => {
  beforeEach(() => {
    resetSingleFlightStateForTests();
  });

  describe("refreshSingleFlight", () => {
    it("coalesces concurrent refreshes sharing the same token into one upstream call", async () => {
      // Invariant: INV-SF-AUTH-2
      let callCount = 0;
      const fetcher = async () => {
        callCount++;
        await new Promise((resolve) => setTimeout(resolve, 15));
        return new Response(
          JSON.stringify({
            success: true,
            data: { accessToken: "access-2", refreshToken: "refresh-2" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      };

      const results = await Promise.all([
        refreshSingleFlight("refresh-1", { fetcher }),
        refreshSingleFlight("refresh-1", { fetcher }),
        refreshSingleFlight("refresh-1", { fetcher }),
        refreshSingleFlight("refresh-1", { fetcher }),
        refreshSingleFlight("refresh-1", { fetcher }),
      ]);

      expect(callCount).toBe(1);
      for (const result of results) {
        expect(result).toEqual({
          status: "rotated",
          accessToken: "access-2",
          refreshToken: "refresh-2",
        });
      }
    });

    it("executes distinct refresh tokens independently without blocking", async () => {
      const calls: string[] = [];
      const fetcher = (token: string) => {
        calls.push(token);
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              data: { accessToken: `a-${token}`, refreshToken: `r-${token}` },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      };

      const [resA, resB] = await Promise.all([
        refreshSingleFlight("token-a", { fetcher }),
        refreshSingleFlight("token-b", { fetcher }),
      ]);

      expect(calls).toHaveLength(2);
      expect(resA).toEqual({
        status: "rotated",
        accessToken: "a-token-a",
        refreshToken: "r-token-a",
      });
      expect(resB).toEqual({
        status: "rotated",
        accessToken: "a-token-b",
        refreshToken: "r-token-b",
      });
    });

    it("returns stale_concurrent without clearing cookies when a rotated token arrives within grace window", async () => {
      // Invariant: INV-SF-AUTH-3
      let nowMs = 1_000;
      let attempt = 0;
      const fetcher = () => {
        attempt++;
        if (attempt === 1) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                success: true,
                data: { accessToken: "access-2", refreshToken: "refresh-2" },
              }),
              { status: 200 },
            ),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify({ status: 401 }), { status: 401 }),
        );
      };

      const first = await refreshSingleFlight("refresh-1", {
        fetcher,
        now: () => nowMs,
      });
      expect(first.status).toBe("rotated");

      nowMs += 2_000;
      const delayed = await refreshSingleFlight("refresh-1", {
        fetcher,
        now: () => nowMs,
      });
      expect(delayed).toEqual({ status: "stale_concurrent" });

      nowMs += 4_000;
      const replayed = await refreshSingleFlight("refresh-1", {
        fetcher,
        now: () => nowMs,
      });
      expect(replayed).toEqual({ status: "invalid" });
    });

    it("rejects unauthorized tokens and preserves session on rate limits or backend outages", async () => {
      // Invariant: INV-SF-AUTH-4
      const unauthorized = await refreshSingleFlight("bad-token", {
        fetcher: () => Promise.resolve(new Response(null, { status: 401 })),
      });
      expect(unauthorized).toEqual({ status: "invalid" });

      const throttled = await refreshSingleFlight("throttled-token", {
        fetcher: () => Promise.resolve(new Response(null, { status: 429 })),
      });
      expect(throttled).toEqual({ status: "transient_error" });

      const outage = await refreshSingleFlight("outage-token", {
        fetcher: () => Promise.resolve(new Response(null, { status: 503 })),
      });
      expect(outage).toEqual({ status: "transient_error" });

      const networkError = await refreshSingleFlight("net-token", {
        fetcher: () => Promise.reject(new Error("ECONNREFUSED")),
      });
      expect(networkError).toEqual({ status: "transient_error" });
    });

    it("forwards sanitized client headers to the refresh transport", async () => {
      // Invariant: INV-SF-AUTH-10
      let receivedHeaders: Record<string, string> | undefined;
      const clientHeaders = {
        "User-Agent": "Mozilla/5.0",
        "X-BFF-Client-IP": "203.0.113.10",
      };

      const result = await refreshSingleFlight("refresh-with-headers", {
        clientHeaders,
        fetcher: (_token, headers) => {
          receivedHeaders = headers;
          return Promise.resolve(
            new Response(
              JSON.stringify({
                success: true,
                data: { accessToken: "access-h", refreshToken: "refresh-h" },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          );
        },
      });

      expect(result.status).toBe("rotated");
      expect(receivedHeaders).toEqual(clientHeaders);
    });
  });
});
