import { headers } from "next/headers";
import { z } from "zod";
import { api } from "@/lib/api-client";
import { AUTH_DEGRADED_HEADER } from "@/features/auth/services/cookies";
import { readServerAccessToken } from "@/features/auth/services/server-token";
import { runWithServerActionRefresh } from "@/features/auth/services/session.server";
import type { SubscriptionDto } from "../schemas/subscription.schema";

/**
 * Discriminated SSR outcome for `/subscriptions/[id]` (`SF-04`).
 */
export type CustomerSubscriptionDetailSessionResolution =
  | {
      readonly status: "authenticated";
      readonly subscription: SubscriptionDto;
    }
  | { readonly status: "unauthenticated" }
  | { readonly status: "forbidden" }
  | { readonly status: "not_found" }
  | { readonly status: "degraded" };

/**
 * Dependency overrides for isolated unit testing of subscription SSR resolvers.
 */
export interface SubscriptionsServerDeps {
  readonly isDegraded?: () => Promise<boolean>;
  readonly readToken?: () => Promise<string | undefined>;
  readonly runWithRefresh?: typeof runWithServerActionRefresh;
  readonly fetchMySubscriptionById?: (id: string) => Promise<{
    response: Response;
    data?: { data: SubscriptionDto };
    error?: unknown;
  }>;
}

async function defaultIsAuthDegraded(): Promise<boolean> {
  const headerStore = await headers();
  return headerStore.get(AUTH_DEGRADED_HEADER) === "1";
}

/**
 * Resolves a single customer-owned subscription for `/subscriptions/[id]` (`SF-04`).
 * Maps both non-UUID IDs and missing/foreign subscriptions (`404`) to `not_found`.
 *
 * @param subscriptionId Route `[id]` parameter.
 * @param deps Optional dependency overrides for unit testing.
 * @returns Discriminated SSR outcome separating `404`, `401`, `403`, and `5xx`.
 */
export async function resolveCustomerSubscriptionDetailSession(
  subscriptionId: string,
  deps?: SubscriptionsServerDeps,
): Promise<CustomerSubscriptionDetailSessionResolution> {
  try {
    const isDegraded = deps?.isDegraded ?? defaultIsAuthDegraded;
    if (await isDegraded()) {
      return { status: "degraded" };
    }

    const readToken = deps?.readToken ?? readServerAccessToken;
    const token = await readToken();
    if (!token) {
      return { status: "unauthenticated" };
    }

    if (!z.uuid().safeParse(subscriptionId).success) {
      return { status: "not_found" };
    }

    const runWithRefresh = deps?.runWithRefresh ?? runWithServerActionRefresh;
    const fetchMySubscriptionById =
      deps?.fetchMySubscriptionById ??
      ((id) =>
        api.GET("/api/v1/subscriptions/{id}", {
          params: { path: { id } },
          cache: "no-store",
        }));

    const result = await runWithRefresh(() =>
      fetchMySubscriptionById(subscriptionId),
    );

    if (!result.error && result.response.ok && result.data) {
      return {
        status: "authenticated",
        subscription: result.data.data,
      };
    }

    if (result.response.status === 404) {
      return { status: "not_found" };
    }
    if (result.response.status === 401) {
      return { status: "unauthenticated" };
    }
    if (result.response.status === 403) {
      return { status: "forbidden" };
    }
    return { status: "degraded" };
  } catch {
    return { status: "degraded" };
  }
}
