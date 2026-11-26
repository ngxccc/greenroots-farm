import { beforeEach, describe, expect, it } from "bun:test";
import {
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  API_ERROR_CODES,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionType,
} from "@greenroots/shared";
import { createMockDb } from "../../../test/mocks/mock-database";
import { listPaymentsQuerySchema } from "./dto";
import { PaymentsService } from "./payments.service";

type MockDb = ReturnType<typeof createMockDb> & {
  setSelectResultsQueue: (results: unknown[][]) => void;
};

describe("PaymentsService", () => {
  let service: PaymentsService;
  let mockDb: MockDb;

  const paymentId = "019fa8bc-8f4d-7000-b366-e691f45cfb10";
  const orderId = "019fa8bc-8f4d-7000-b366-e691f45cfb20";
  const subscriptionId = "019fa8bc-8f4d-7000-b366-e691f45cfb30";
  const actorId = "019fa8bc-8f4d-7000-b366-e691f45cfb40";
  const originalActorId = "019fa8bc-8f4d-7000-b366-e691f45cfb41";

  beforeEach(() => {
    mockDb = createMockDb() as MockDb;
    service = new PaymentsService(mockDb);
  });

  describe("DTO validation", () => {
    it("rejects unknown query params, invalid UUIDs, or inverted date bounds on listPaymentsQuerySchema", () => {
      expect(
        listPaymentsQuerySchema.safeParse({ unknownField: "x" }).success,
      ).toBe(false);
      expect(
        listPaymentsQuerySchema.safeParse({ orderId: "not-a-uuid" }).success,
      ).toBe(false);
      expect(
        listPaymentsQuerySchema.safeParse({
          from: "2026-11-26T12:00:00.000Z",
          to: "2026-11-26T10:00:00.000Z",
        }).success,
      ).toBe(false);
      expect(
        listPaymentsQuerySchema.safeParse({
          page: "1",
          limit: "20",
          status: PaymentStatus.PENDING,
          from: "2026-11-26T10:00:00.000Z",
          to: "2026-11-26T12:00:00.000Z",
          search: "ORD-2026",
        }).success,
      ).toBe(true);
    });
  });

  describe("listPayments", () => {
    it("short-circuits data query when count is zero", async () => {
      mockDb.setSelectResultsQueue([[{ total: 0 }]]);

      const result = await service.listPayments({ page: 1, limit: 20 });

      expect(result.items).toEqual([]);
      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      });
    });

    // Invariant: INV-5
    it("maps hydrated ledger rows and omits rawPayload and paymentUrl", async () => {
      const createdAt = new Date("2026-11-26T05:00:00.000Z");
      const updatedAt = new Date("2026-11-26T05:05:00.000Z");
      const paidAt = new Date("2026-11-26T05:05:00.000Z");

      mockDb.setSelectResultsQueue([
        [{ total: 1 }],
        [
          {
            id: paymentId,
            orderId,
            orderCode: "ORD-20261126-ABC123",
            subscriptionId: null,
            subscriptionCode: null,
            amountVnd: 175_000,
            paymentMethod: PaymentMethod.COD,
            status: PaymentStatus.PAID,
            transactionType: PaymentTransactionType.PAYMENT,
            payosOrderCode: null,
            referenceCode: null,
            verifiedBy: actorId,
            verifiedByName: "Sales Staff",
            paidAt,
            createdAt,
            updatedAt,
          },
        ],
      ]);

      const result = await service.listPayments({ page: 1, limit: 20 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual({
        id: paymentId,
        orderId,
        orderCode: "ORD-20261126-ABC123",
        subscriptionId: null,
        subscriptionCode: null,
        amountVnd: 175_000,
        paymentMethod: PaymentMethod.COD,
        status: PaymentStatus.PAID,
        transactionType: PaymentTransactionType.PAYMENT,
        payosOrderCode: null,
        referenceCode: null,
        verifiedBy: actorId,
        verifiedByName: "Sales Staff",
        paidAt: paidAt.toISOString(),
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
      });
      expect("rawPayload" in (result.items[0] as object)).toBe(false);
      expect("paymentUrl" in (result.items[0] as object)).toBe(false);
    });
  });

  describe("confirmCod", () => {
    it("throws not found when payment row does not exist", async () => {
      mockDb.setSelectResultsQueue([[]]);

      let caught: unknown;
      try {
        await service.confirmCod(paymentId, actorId);
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(NotFoundException);
      expect(
        (caught as NotFoundException).getResponse() as { code: string },
      ).toMatchObject({ code: API_ERROR_CODES.PAYMENT_NOT_FOUND });
    });

    // Invariant: INV-3
    it("rejects subscription, PayOS, and refund payments as not eligible for COD confirmation", async () => {
      const ineligibleLookups = [
        {
          id: paymentId,
          orderId: null,
          subscriptionId,
          paymentMethod: PaymentMethod.PAYOS,
          transactionType: PaymentTransactionType.PAYMENT,
        },
        {
          id: paymentId,
          orderId,
          paymentMethod: PaymentMethod.PAYOS,
          transactionType: PaymentTransactionType.PAYMENT,
        },
        {
          id: paymentId,
          orderId,
          paymentMethod: PaymentMethod.COD,
          transactionType: PaymentTransactionType.REFUND,
        },
      ];

      for (const lookup of ineligibleLookups) {
        mockDb.setSelectResultsQueue([[lookup]]);

        let caught: unknown;
        try {
          await service.confirmCod(paymentId, actorId);
        } catch (err) {
          caught = err;
        }

        expect(caught).toBeInstanceOf(UnprocessableEntityException);
        expect(
          (caught as UnprocessableEntityException).getResponse() as {
            code: string;
          },
        ).toMatchObject({ code: API_ERROR_CODES.PAYMENT_COD_NOT_ELIGIBLE });
      }
    });

    // Invariant: INV-3
    it("rejects terminal non-paid payment statuses with invalid status transition", async () => {
      for (const status of [
        PaymentStatus.CANCELLED,
        PaymentStatus.FAILED,
        PaymentStatus.REFUNDED,
      ]) {
        mockDb.setSelectResultsQueue([
          [
            {
              id: paymentId,
              orderId,
              paymentMethod: PaymentMethod.COD,
              transactionType: PaymentTransactionType.PAYMENT,
            },
          ],
          [{ id: orderId, orderStatus: OrderStatus.DELIVERED }],
          [
            {
              id: paymentId,
              orderId,
              amount: 175_000,
              paymentMethod: PaymentMethod.COD,
              status,
              transactionType: PaymentTransactionType.PAYMENT,
            },
          ],
        ]);

        let caught: unknown;
        try {
          await service.confirmCod(paymentId, actorId);
        } catch (err) {
          caught = err;
        }

        expect(caught).toBeInstanceOf(UnprocessableEntityException);
        expect(
          (caught as UnprocessableEntityException).getResponse() as {
            code: string;
          },
        ).toMatchObject({
          code: API_ERROR_CODES.PAYMENT_INVALID_STATUS_TRANSITION,
        });
      }
    });

    // Invariant: INV-3
    it("rejects COD confirmation when parent order is not in shipping or delivered status", async () => {
      for (const orderStatus of [
        OrderStatus.PENDING_CONFIRMATION,
        OrderStatus.CONFIRMED,
        OrderStatus.PACKING,
        OrderStatus.COMPLETED,
        OrderStatus.CANCELLED,
      ]) {
        mockDb.setSelectResultsQueue([
          [
            {
              id: paymentId,
              orderId,
              paymentMethod: PaymentMethod.COD,
              transactionType: PaymentTransactionType.PAYMENT,
            },
          ],
          [{ id: orderId, orderStatus }],
          [
            {
              id: paymentId,
              orderId,
              amount: 175_000,
              paymentMethod: PaymentMethod.COD,
              status: PaymentStatus.PENDING,
              transactionType: PaymentTransactionType.PAYMENT,
            },
          ],
        ]);

        let caught: unknown;
        try {
          await service.confirmCod(paymentId, actorId);
        } catch (err) {
          caught = err;
        }

        expect(caught).toBeInstanceOf(UnprocessableEntityException);
        expect(
          (caught as UnprocessableEntityException).getResponse() as {
            code: string;
          },
        ).toMatchObject({ code: API_ERROR_CODES.PAYMENT_COD_NOT_ELIGIBLE });
      }
    });

    // Invariant: INV-4
    it("returns persisted projection idempotently when payment is already PAID without overwriting verifiedBy or paidAt", async () => {
      const originalPaidAt = new Date("2026-11-26T04:00:00.000Z");
      const createdAt = new Date("2026-11-26T03:00:00.000Z");
      const updatedAt = new Date("2026-11-26T04:00:00.000Z");

      mockDb.setSelectResultsQueue([
        [
          {
            id: paymentId,
            orderId,
            paymentMethod: PaymentMethod.COD,
            transactionType: PaymentTransactionType.PAYMENT,
          },
        ],
        [{ id: orderId, orderStatus: OrderStatus.DELIVERED }],
        [
          {
            id: paymentId,
            orderId,
            amount: 175_000,
            paymentMethod: PaymentMethod.COD,
            status: PaymentStatus.PAID,
            transactionType: PaymentTransactionType.PAYMENT,
          },
        ],
        [
          {
            id: paymentId,
            orderId,
            orderCode: "ORD-20261126-ABC123",
            subscriptionId: null,
            subscriptionCode: null,
            amountVnd: 175_000,
            paymentMethod: PaymentMethod.COD,
            status: PaymentStatus.PAID,
            transactionType: PaymentTransactionType.PAYMENT,
            payosOrderCode: null,
            referenceCode: null,
            verifiedBy: originalActorId,
            verifiedByName: "Original Staff",
            paidAt: originalPaidAt,
            createdAt,
            updatedAt,
          },
        ],
      ]);

      const result = await service.confirmCod(paymentId, actorId);

      expect(result.verifiedBy).toBe(originalActorId);
      expect(result.verifiedByName).toBe("Original Staff");
      expect(result.paidAt).toBe(originalPaidAt.toISOString());
    });
  });
});
