import { headers } from "next/headers";
import { api } from "@/lib/api-client";
import type { components } from "@/types/api-schema";
import { AUTH_DEGRADED_HEADER } from "@/features/auth/services/cookies";
import { readServerAccessToken } from "@/features/auth/services/server-token";
import { runWithServerActionRefresh } from "@/features/auth/services/session.server";
import type { OrderDto } from "../schemas/order.schema";
import {
  ORDER_HISTORY_PAGE_SIZE,
  type OrderHistoryTabKey,
  resolveStatusesQueryForTab,
} from "../utils/order-history.utils";

/** Pagination metadata alias from generated OpenAPI schema. */
export type PaginationMetaDto = components["schemas"]["PaginationMetaDto"];

/**
 * Discriminated SSR outcome for `/account/orders`.
 */
export type CustomerOrdersSessionResolution =
  | {
      readonly status: "authenticated";
      readonly orders: readonly OrderDto[];
      readonly meta: PaginationMetaDto;
    }
  | { readonly status: "unauthenticated" }
  | { readonly status: "forbidden" }
  | { readonly status: "degraded" };

/**
 * Discriminated SSR outcome for `/orders/[id]` (`SF-05`).
 */
export type CustomerOrderDetailSessionResolution =
  | { readonly status: "authenticated"; readonly order: OrderDto }
  | { readonly status: "unauthenticated" }
  | { readonly status: "forbidden" }
  | { readonly status: "not_found" }
  | { readonly status: "degraded" };

/**
 * Dependency overrides for isolated unit testing of order SSR resolvers.
 */
export interface OrdersServerDeps {
  readonly isDegraded?: () => Promise<boolean>;
  readonly readToken?: () => Promise<string | undefined>;
  readonly runWithRefresh?: typeof runWithServerActionRefresh;
  readonly fetchMyOrders?: (query: {
    readonly statuses?: string;
    readonly page: number;
    readonly limit: number;
  }) => Promise<{
    response: Response;
    data?: { data: OrderDto[]; meta: PaginationMetaDto };
    error?: unknown;
  }>;
  readonly fetchMyOrderById?: (id: string) => Promise<{
    response: Response;
    data?: { data: OrderDto };
    error?: unknown;
  }>;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function defaultIsAuthDegraded(): Promise<boolean> {
  const headerStore = await headers();
  return headerStore.get(AUTH_DEGRADED_HEADER) === "1";
}

async function checkOrdersSessionGate(
  deps?: Pick<OrdersServerDeps, "isDegraded" | "readToken">,
): Promise<"ready" | "degraded" | "unauthenticated"> {
  const isDegraded = deps?.isDegraded ?? defaultIsAuthDegraded;
  if (await isDegraded()) {
    return "degraded";
  }

  const readToken = deps?.readToken ?? readServerAccessToken;
  const token = await readToken();
  if (!token) {
    return "unauthenticated";
  }

  return "ready";
}

/**
 * Resolves paginated customer order history for `/account/orders` via Storefront BFF.
 *
 * @param params Active filter tab, 1-based page, and optional page size.
 * @param deps Optional dependency overrides for unit testing.
 * @returns Discriminated SSR outcome separating `401`, `403`, and `5xx` degradation.
 */
export async function resolveCustomerOrdersSession(
  params: {
    readonly tab: OrderHistoryTabKey;
    readonly page: number;
    readonly limit?: number;
  },
  deps?: OrdersServerDeps,
): Promise<CustomerOrdersSessionResolution> {
  try {
    const gate = await checkOrdersSessionGate(deps);
    if (gate !== "ready") {
      return { status: gate };
    }

    const statuses = resolveStatusesQueryForTab(params.tab);
    const limit = params.limit ?? ORDER_HISTORY_PAGE_SIZE;
    const runWithRefresh = deps?.runWithRefresh ?? runWithServerActionRefresh;
    const fetchMyOrders =
      deps?.fetchMyOrders ??
      ((query) =>
        api.GET("/api/v1/orders/me", {
          params: {
            query: {
              ...(query.statuses ? { statuses: query.statuses } : {}),
              page: query.page,
              limit: query.limit,
              sort: "createdAt:desc",
            },
          },
          cache: "no-store",
        }));

    const result = await runWithRefresh(() =>
      fetchMyOrders({ statuses, page: params.page, limit }),
    );

    if (!result.error && result.response.ok && result.data) {
      return {
        status: "authenticated",
        orders: result.data.data,
        meta: result.data.meta,
      };
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

/**
 * Resolves a single customer-owned order for `/orders/[id]` (`SF-05`).
 * Maps both non-UUID IDs (`400`) and missing/foreign orders (`404`) to `not_found`.
 *
 * @param orderId Route `[id]` parameter.
 * @param deps Optional dependency overrides for unit testing.
 * @returns Discriminated SSR outcome separating `404`, `401`, `403`, and `5xx`.
 */
export async function resolveCustomerOrderDetailSession(
  orderId: string,
  deps?: OrdersServerDeps,
): Promise<CustomerOrderDetailSessionResolution> {
  try {
    const gate = await checkOrdersSessionGate(deps);
    if (gate !== "ready") {
      return { status: gate };
    }

    if (!UUID_REGEX.test(orderId)) {
      return { status: "not_found" };
    }

    const runWithRefresh = deps?.runWithRefresh ?? runWithServerActionRefresh;
    const fetchMyOrderById =
      deps?.fetchMyOrderById ??
      ((id) =>
        api.GET("/api/v1/orders/{id}", {
          params: { path: { id } },
          cache: "no-store",
        }));

    const result = await runWithRefresh(() => fetchMyOrderById(orderId));

    if (!result.error && result.response.ok && result.data?.data) {
      return {
        status: "authenticated",
        order: result.data.data,
      };
    }

    if (result.response.status === 400 || result.response.status === 404) {
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
