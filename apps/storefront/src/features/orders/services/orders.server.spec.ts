import { describe, expect, it } from "bun:test";
import { OrderStatus, PaymentMethod, PaymentStatus } from "@greenroots/shared";
import type { OrderDto } from "../schemas/order.schema";
import {
  resolveCustomerOrderComplaintSession,
  resolveCustomerOrderDetailSession,
  resolveCustomerOrdersSession,
  type PaginationMetaDto,
} from "./orders.server";

const sampleOrder: OrderDto = {
  id: "019fa8bc-8f4d-7000-b366-e691f45cfb91",
  orderCode: "ORD-20261125-0001",
  orderStatus: OrderStatus.PENDING_CONFIRMATION,
  paymentMethod: PaymentMethod.COD,
  paymentStatus: PaymentStatus.PENDING,
  receiverName: "Nguyễn Minh Anh",
  receiverPhone: "0908412679",
  shippingAddress: "142 Lê Đức Thọ, Q. Gò Vấp, TP.HCM",
  shippingDistanceKm: 10,
  shippingFeeVnd: 15_000,
  subtotalVnd: 150_000,
  discountAmountVnd: 0,
  loyaltyPointsUsed: 0,
  totalAmountVnd: 165_000,
  paymentUrl: null,
  reservationExpiresAt: null,
  deliveredAt: null,
  items: [],
  createdAt: "2026-11-25T01:00:00.000Z",
  updatedAt: "2026-11-25T01:00:00.000Z",
};

const sampleMeta: PaginationMetaDto = {
  page: 1,
  limit: 10,
  total: 1,
  totalPages: 1,
  hasNextPage: false,
  hasPrevPage: false,
};

const passthroughRefresh = async <T>(
  operation: () => Promise<T>,
): Promise<T & { refreshOutcome: "not-needed" }> => ({
  ...(await operation()),
  refreshOutcome: "not-needed",
});

describe("Orders Server Resolvers", () => {
  describe("resolveCustomerOrdersSession", () => {
    it("returns degraded when proxy auth header marks session degraded", async () => {
      const res = await resolveCustomerOrdersSession(
        { tab: "all", page: 1 },
        { isDegraded: () => Promise.resolve(true) },
      );
      expect(res).toEqual({ status: "degraded" });
    });

    it("returns unauthenticated when access token cookie is missing", async () => {
      const res = await resolveCustomerOrdersSession(
        { tab: "all", page: 1 },
        {
          isDegraded: () => Promise.resolve(false),
          readToken: () => Promise.resolve(undefined),
        },
      );
      expect(res).toEqual({ status: "unauthenticated" });
    });

    it("forwards grouped statuses query and returns paginated orders when authenticated", async () => {
      let capturedStatuses: string | undefined;
      const res = await resolveCustomerOrdersSession(
        { tab: "pending", page: 2 },
        {
          isDegraded: () => Promise.resolve(false),
          readToken: () => Promise.resolve("valid-token"),
          runWithRefresh: passthroughRefresh as never,
          fetchMyOrders: (query) => {
            capturedStatuses = query.statuses;
            return Promise.resolve({
              response: new Response(null, { status: 200 }),
              data: { data: [sampleOrder], meta: sampleMeta },
            });
          },
        },
      );

      expect(capturedStatuses).toBe(
        "pending_payment,pending_confirmation,confirmed,packing",
      );
      expect(res).toEqual({
        status: "authenticated",
        orders: [sampleOrder],
        meta: sampleMeta,
      });
    });

    it("maps upstream authorization and server errors to distinct outcomes", async () => {
      for (const [httpStatus, expected] of [
        [401, "unauthenticated"],
        [403, "forbidden"],
        [503, "degraded"],
      ] as const) {
        const res = await resolveCustomerOrdersSession(
          { tab: "all", page: 1 },
          {
            isDegraded: () => Promise.resolve(false),
            readToken: () => Promise.resolve("valid-token"),
            runWithRefresh: passthroughRefresh as never,
            fetchMyOrders: () =>
              Promise.resolve({
                response: new Response(null, { status: httpStatus }),
                error: { status: httpStatus },
              }),
          },
        );
        expect(res).toEqual({ status: expected });
      }
    });
  });

  describe("resolveCustomerOrderDetailSession", () => {
    it("returns not_found immediately when orderId is not a UUID", async () => {
      let fetched = false;
      const res = await resolveCustomerOrderDetailSession("not-a-uuid", {
        isDegraded: () => Promise.resolve(false),
        readToken: () => Promise.resolve("valid-token"),
        fetchMyOrderById: () => {
          fetched = true;
          return Promise.resolve({
            response: new Response(null, { status: 200 }),
          });
        },
      });
      expect(fetched).toBe(false);
      expect(res).toEqual({ status: "not_found" });
    });

    it("maps missing, foreign, unauthorized, forbidden, and server-error responses accurately", async () => {
      for (const [httpStatus, expected] of [
        [400, "not_found"],
        [404, "not_found"],
        [401, "unauthenticated"],
        [403, "forbidden"],
        [500, "degraded"],
      ] as const) {
        const res = await resolveCustomerOrderDetailSession(sampleOrder.id, {
          isDegraded: () => Promise.resolve(false),
          readToken: () => Promise.resolve("valid-token"),
          runWithRefresh: passthroughRefresh as never,
          fetchMyOrderById: () =>
            Promise.resolve({
              response: new Response(null, { status: httpStatus }),
              error: { status: httpStatus },
            }),
        });
        expect(res).toEqual({ status: expected });
      }
    });

    it("returns authenticated order detail when owned order exists", async () => {
      const res = await resolveCustomerOrderDetailSession(sampleOrder.id, {
        isDegraded: () => Promise.resolve(false),
        readToken: () => Promise.resolve("valid-token"),
        runWithRefresh: passthroughRefresh as never,
        fetchMyOrderById: () =>
          Promise.resolve({
            response: new Response(null, { status: 200 }),
            data: { data: sampleOrder },
          }),
      });
      expect(res).toEqual({ status: "authenticated", order: sampleOrder });
    });
  });

  describe("resolveCustomerOrderComplaintSession", () => {
    it("fetches order and complaint in parallel and returns authenticated state", async () => {
      const events: string[] = [];
      let releaseOrder!: () => void;
      const orderGate = new Promise<void>((resolve) => {
        releaseOrder = resolve;
      });

      const promise = resolveCustomerOrderComplaintSession(sampleOrder.id, {
        isDegraded: () => Promise.resolve(false),
        readToken: () => Promise.resolve("valid-token"),
        runWithRefresh: passthroughRefresh as never,
        fetchMyOrderById: async () => {
          events.push("order:start");
          await orderGate;
          events.push("order:end");
          return {
            response: new Response(null, { status: 200 }),
            data: { data: sampleOrder },
          };
        },
        fetchOrderComplaint: () => {
          events.push("complaint:start");
          releaseOrder();
          return Promise.resolve({
            response: new Response(null, { status: 200 }),
            data: { data: null },
          });
        },
      });

      const res = await promise;
      expect(events.slice(0, 2)).toEqual(["order:start", "complaint:start"]);
      expect(res).toEqual({
        status: "authenticated",
        order: sampleOrder,
        complaint: null,
      });
    });

    it("maps missing, unauthorized, forbidden, and server-error complaint responses", async () => {
      for (const [httpStatus, expected] of [
        [404, "not_found"],
        [401, "unauthenticated"],
        [403, "forbidden"],
        [503, "degraded"],
      ] as const) {
        const res = await resolveCustomerOrderComplaintSession(sampleOrder.id, {
          isDegraded: () => Promise.resolve(false),
          readToken: () => Promise.resolve("valid-token"),
          runWithRefresh: passthroughRefresh as never,
          fetchMyOrderById: () =>
            Promise.resolve({
              response: new Response(null, { status: 200 }),
              data: { data: sampleOrder },
            }),
          fetchOrderComplaint: () =>
            Promise.resolve({
              response: new Response(null, { status: httpStatus }),
              error: { status: httpStatus },
            }),
        });
        expect(res).toEqual({ status: expected });
      }
    });
  });
});
