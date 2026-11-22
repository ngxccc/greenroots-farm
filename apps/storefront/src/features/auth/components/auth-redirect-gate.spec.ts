import { describe, expect, it } from "bun:test";
import type { StorefrontSessionUser } from "@/types/auth.types";
import {
  resolveAuthRedirectGate,
  resolveRedirectCandidate,
} from "./auth-redirect-gate";

const sampleUser: StorefrontSessionUser = {
  id: "0195a8f0-0001-7000-8000-000000000099",
  email: "minhanh@email.com",
  fullName: "Nguyễn Minh Anh",
  phone: "0908412679",
  role: "customer",
  status: "active",
  rewardPoints: 500,
  emailVerified: true,
  createdAt: "2026-11-20T00:00:00.000Z",
  updatedAt: "2026-11-20T00:00:00.000Z",
};

describe("Storefront Auth Redirect Gate", () => {
  describe("resolveRedirectCandidate", () => {
    it("selects the first value when redirect query parameter repeats", () => {
      // Invariant: INV-SF-AUTH-UI-5
      expect(resolveRedirectCandidate(["/orders", "/checkout"])).toBe(
        "/orders",
      );
      expect(resolveRedirectCandidate("/checkout")).toBe("/checkout");
      expect(resolveRedirectCandidate(undefined)).toBeUndefined();
    });
  });

  describe("resolveAuthRedirectGate", () => {
    it("redirects authenticated customers to sanitized path and blocks external targets", async () => {
      // Invariant: INV-SF-AUTH-UI-5
      class RedirectInterrupt extends Error {
        constructor(readonly target: string) {
          super(`NEXT_REDIRECT:${target}`);
        }
      }

      let validTarget = "";
      try {
        await resolveAuthRedirectGate(
          Promise.resolve({ redirect: "/orders?page=2" }),
          () => "form",
          {
            readSession: () => Promise.resolve(sampleUser),
            onRedirect: (target) => {
              validTarget = target;
              throw new RedirectInterrupt(target);
            },
          },
        );
      } catch (error) {
        expect(error).toBeInstanceOf(RedirectInterrupt);
      }
      expect(validTarget).toBe("/orders?page=2");

      let unsafeFallback = "";
      try {
        await resolveAuthRedirectGate(
          Promise.resolve({ redirect: "//evil.example/phish" }),
          () => "form",
          {
            readSession: () => Promise.resolve(sampleUser),
            onRedirect: (target) => {
              unsafeFallback = target;
              throw new RedirectInterrupt(target);
            },
          },
        );
      } catch (error) {
        expect(error).toBeInstanceOf(RedirectInterrupt);
      }
      expect(unsafeFallback).toBe("/");
    });

    it("passes sanitized redirect target to form renderer for guest visitors", async () => {
      // Invariant: INV-SF-AUTH-UI-5
      const rendered = await resolveAuthRedirectGate(
        Promise.resolve({ redirect: "https://phish.example" }),
        (redirectTo) => `form:${redirectTo}`,
        {
          readSession: () => Promise.resolve(null),
          onRedirect: () => {
            throw new Error("must not redirect guest visitors");
          },
        },
      );

      expect(rendered).toBe("form:/");
    });
  });
});
