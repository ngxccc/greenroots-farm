import { describe, expect, it } from "bun:test";
import type { ReactElement } from "react";
import type { StorefrontSessionUser } from "@/features/auth/types/auth.types";
import {
  resolveVerifyEmailGate,
  type VerifyEmailSearchParams,
} from "./verify-email-gate";

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

class RedirectInterrupt extends Error {
  constructor(readonly target: string) {
    super(`NEXT_REDIRECT:${target}`);
  }
}

async function expectRedirectToHome(
  params: VerifyEmailSearchParams,
): Promise<void> {
  let redirectTarget = "";

  try {
    await resolveVerifyEmailGate(Promise.resolve(params), {
      readSession: () => Promise.resolve(sampleUser),
      onRedirect: (target) => {
        redirectTarget = target;
        throw new RedirectInterrupt(target);
      },
    });
  } catch (error) {
    expect(error).toBeInstanceOf(RedirectInterrupt);
  }

  expect(redirectTarget).toBe("/");
}

describe("Storefront Verify Email Gate", () => {
  describe("resolveVerifyEmailGate", () => {
    it("redirects authenticated customers to home when no token is provided", async () => {
      // Invariant: INV-SF-REC-UI-5
      await expectRedirectToHome({});
    });

    it("redirects authenticated customers to home when token query is empty or oversized", async () => {
      // Invariant: INV-SF-REC-UI-5
      for (const malformedToken of ["", "   ", "a".repeat(65)]) {
        await expectRedirectToHome({ token: malformedToken });
      }
    });

    it("renders standalone verification panel for guest visitors without token", async () => {
      // Invariant: INV-SF-REC-UI-5
      const node = (await resolveVerifyEmailGate(
        Promise.resolve({ email: "guest@email.com" }),
        {
          readSession: () => Promise.resolve(null),
          onRedirect: () => {
            throw new Error("must not redirect guest visitors");
          },
        },
      )) as ReactElement<{
        token: string | null;
        hasTokenParam: boolean;
        prefillEmail?: string;
      }>;

      expect(node.props.token).toBeNull();
      expect(node.props.hasTokenParam).toBe(false);
      expect(node.props.prefillEmail).toBe("guest@email.com");
    });

    it("renders invalid-token verification panel for guest visitors when token query is malformed", async () => {
      // Invariant: INV-SF-REC-UI-5
      const node = (await resolveVerifyEmailGate(
        Promise.resolve({ token: "a".repeat(65) }),
        {
          readSession: () => Promise.resolve(null),
          onRedirect: () => {
            throw new Error("must not redirect guest visitors");
          },
        },
      )) as ReactElement<{
        token: string | null;
        hasTokenParam: boolean;
      }>;

      expect(node.props.token).toBeNull();
      expect(node.props.hasTokenParam).toBe(true);
    });

    it("renders verification panel without reading session when a valid candidate token is present", async () => {
      // Invariant: INV-SF-REC-UI-5
      let sessionReadCount = 0;
      const validToken = "a".repeat(64);

      const node = (await resolveVerifyEmailGate(
        Promise.resolve({ token: validToken }),
        {
          readSession: () => {
            sessionReadCount += 1;
            return Promise.resolve(sampleUser);
          },
          onRedirect: () => {
            throw new Error("must not redirect tokenized email links");
          },
        },
      )) as ReactElement<{
        token: string | null;
        hasTokenParam: boolean;
      }>;

      expect(sessionReadCount).toBe(0);
      expect(node.props.token).toBe(validToken);
      expect(node.props.hasTokenParam).toBe(true);
    });
  });
});
