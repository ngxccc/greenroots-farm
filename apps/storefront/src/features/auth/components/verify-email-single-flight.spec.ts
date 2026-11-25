import { describe, expect, it } from "bun:test";
import type { VerifyEmailActionResult } from "@/features/auth/actions/auth-actions";
import { verifyEmailOnce } from "./verify-email-panel";

describe("VerifyEmailPanel Single-Flight", () => {
  describe("verifyEmailOnce", () => {
    it("deduplicates concurrent invocations for the same verification token", async () => {
      // Invariant: INV-SF-REC-UI-1
      const cache = new Map<string, Promise<VerifyEmailActionResult>>();
      let calls = 0;

      const executor = (input: { readonly token: string }) => {
        calls++;
        return Promise.resolve({
          ok: true as const,
          message: `Verified ${input.token}`,
        });
      };

      const [first, second] = await Promise.all([
        verifyEmailOnce("token-alpha", executor, cache),
        verifyEmailOnce("token-alpha", executor, cache),
      ]);

      expect(calls).toBe(1);
      expect(first).toEqual({ ok: true, message: "Verified token-alpha" });
      expect(second).toEqual({ ok: true, message: "Verified token-alpha" });
    });

    it("executes separately for distinct verification tokens", async () => {
      // Invariant: INV-SF-REC-UI-1
      const cache = new Map<string, Promise<VerifyEmailActionResult>>();
      const invokedTokens: string[] = [];

      const executor = (input: { readonly token: string }) => {
        invokedTokens.push(input.token);
        return Promise.resolve({ ok: true as const, message: input.token });
      };

      await Promise.all([
        verifyEmailOnce("token-one", executor, cache),
        verifyEmailOnce("token-two", executor, cache),
      ]);

      expect(invokedTokens).toEqual(["token-one", "token-two"]);
    });

    it("evicts rejected promises from the flight cache so retries can proceed", async () => {
      // Invariant: INV-SF-REC-UI-1
      const cache = new Map<string, Promise<VerifyEmailActionResult>>();
      let attempts = 0;

      const executor = (input: { readonly token: string }) => {
        attempts++;
        if (attempts === 1) {
          return Promise.reject(new Error("Transient network failure"));
        }
        return Promise.resolve({ ok: true as const, message: input.token });
      };

      let caughtMessage: string | null = null;
      try {
        await verifyEmailOnce("token-retry", executor, cache);
      } catch (error) {
        caughtMessage = error instanceof Error ? error.message : String(error);
      }

      const retryResult = await verifyEmailOnce("token-retry", executor, cache);
      expect(caughtMessage).toBe("Transient network failure");
      expect(attempts).toBe(2);
      expect(retryResult).toEqual({ ok: true, message: "token-retry" });
    });
  });
});
