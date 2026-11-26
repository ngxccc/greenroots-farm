import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  API_ERROR_CODES,
  OrderStatus,
  PaymentStatus,
} from "@greenroots/shared";
import { orders, payments } from "@/database/schemas";
import { createMockDb } from "../../../test/mocks/mock-database";
import { MockPaymentDriver } from "./drivers/mock-payment.driver";
import type { PayosWebhookPayload } from "./payments.interface";
import { PaymentsWebhookService } from "./payments-webhook.service";

type MockDb = ReturnType<typeof createMockDb> & {
  setSelectResultsQueue: (results: unknown[][]) => void;
};

describe("PaymentsWebhookService", () => {
  const orderId = "019fa8bc-8f4d-7000-b366-e691f45cfb50";
  const paymentId = "019fa8bc-8f4d-7000-b366-e691f45cfb60";
  const orderCode = 1732579200123456;

  let mockDb: MockDb;
  let driver: MockPaymentDriver;
  let service: PaymentsWebhookService;

  const validPayload: PayosWebhookPayload = {
    code: "00",
    desc: "success",
    success: true,
    data: {
      orderCode,
      amount: 185_000,
      description: "ORD-20261126-ABCDEF",
      accountNumber: "12345678",
      reference: "FT26330123456",
      transactionDateTime: "2026-11-26T01:00:00.000Z",
      currency: "VND",
      paymentLinkId: "mock-link-1",
      code: "00",
      desc: "success",
      extraUnknownField: "preserved-for-hmac",
    },
    signature: "valid-mock-signature",
  };

  beforeEach(() => {
    mockDb = createMockDb() as unknown as MockDb;
    driver = new MockPaymentDriver();
    service = new PaymentsWebhookService(mockDb, driver);
  });

  describe("handlePayosWebhook", () => {
    // Invariant: INV-PAY-CHK-5
    it("rejects invalid webhook signatures before querying the database", async () => {
      const txSpy = mock(mockDb.transaction.bind(mockDb));
      mockDb.transaction = txSpy as unknown as typeof mockDb.transaction;

      let caught: unknown;
      try {
        await service.handlePayosWebhook({
          ...validPayload,
          signature: "invalid",
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(UnauthorizedException);
      expect((caught as UnauthorizedException).getResponse()).toMatchObject({
        code: API_ERROR_CODES.PAYMENT_WEBHOOK_SIGNATURE_INVALID,
      });
      expect(txSpy).not.toHaveBeenCalled();
    });

    // Invariant: INV-PAY-CHK-5
    it("throws not found when orderCode does not match any payment record", async () => {
      mockDb.setSelectResultsQueue([[]]);

      let caught: unknown;
      try {
        await service.handlePayosWebhook(validPayload);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(NotFoundException);
      expect((caught as NotFoundException).getResponse()).toMatchObject({
        code: API_ERROR_CODES.PAYMENT_NOT_FOUND,
      });
    });

    // Invariant: INV-PAY-CHK-6
    it("returns acknowledged idempotently when payment is already paid", async () => {
      const updates: unknown[] = [];
      const origUpdate = mockDb.update.bind(mockDb);
      mockDb.update = ((table: unknown) => ({
        set: (vals: unknown) => {
          updates.push({ table, vals });
          return origUpdate(table as never).set(vals as never);
        },
      })) as unknown as typeof mockDb.update;

      mockDb.setSelectResultsQueue([
        [{ id: paymentId, orderId }],
        [
          {
            id: orderId,
            orderCode: "ORD-20261126-ABCDEF",
            orderStatus: OrderStatus.CONFIRMED,
          },
        ],
        [
          {
            id: paymentId,
            amount: 185_000,
            status: PaymentStatus.PAID,
            referenceCode: "FT26330123456",
          },
        ],
      ]);

      const result = await service.handlePayosWebhook(validPayload);

      expect(result).toEqual({ received: true });
      expect(updates).toHaveLength(0);
    });

    // Invariant: INV-PAY-CHK-5
    it("fails closed on verified amount mismatch without mutating order or payment", async () => {
      const updates: unknown[] = [];
      const origUpdate = mockDb.update.bind(mockDb);
      mockDb.update = ((table: unknown) => ({
        set: (vals: unknown) => {
          updates.push({ table, vals });
          return origUpdate(table as never).set(vals as never);
        },
      })) as unknown as typeof mockDb.update;

      mockDb.setSelectResultsQueue([
        [{ id: paymentId, orderId }],
        [
          {
            id: orderId,
            orderCode: "ORD-20261126-ABCDEF",
            orderStatus: OrderStatus.PENDING_PAYMENT,
          },
        ],
        [
          {
            id: paymentId,
            amount: 200_000,
            status: PaymentStatus.PENDING,
            referenceCode: null,
          },
        ],
      ]);

      let caught: unknown;
      try {
        await service.handlePayosWebhook(validPayload);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(UnprocessableEntityException);
      expect(
        (caught as UnprocessableEntityException).getResponse(),
      ).toMatchObject({
        code: API_ERROR_CODES.PAYMENT_AMOUNT_MISMATCH,
      });
      expect(updates).toHaveLength(0);
    });

    // Invariant: INV-PAY-CHK-7
    it("records payment evidence without resurrecting an already-cancelled order", async () => {
      const paymentUpdates: Record<string, unknown>[] = [];
      const orderUpdates: Record<string, unknown>[] = [];
      const origUpdate = mockDb.update.bind(mockDb);
      mockDb.update = ((table: unknown) => ({
        set: (vals: Record<string, unknown>) => {
          if (table === payments) paymentUpdates.push(vals);
          if (table === orders) orderUpdates.push(vals);
          return origUpdate(table as never).set(vals as never);
        },
      })) as unknown as typeof mockDb.update;

      mockDb.setSelectResultsQueue([
        [{ id: paymentId, orderId }],
        [
          {
            id: orderId,
            orderCode: "ORD-20261126-ABCDEF",
            orderStatus: OrderStatus.CANCELLED,
          },
        ],
        [
          {
            id: paymentId,
            amount: 185_000,
            status: PaymentStatus.CANCELLED,
            referenceCode: null,
          },
        ],
      ]);

      const result = await service.handlePayosWebhook(validPayload);

      expect(result).toEqual({ received: true });
      expect(paymentUpdates).toHaveLength(1);
      expect(paymentUpdates[0]).toMatchObject({
        status: PaymentStatus.PAID,
        referenceCode: "FT26330123456",
      });
      expect(orderUpdates).toHaveLength(0);
    });

    it("transitions pending_payment order to confirmed and marks payment paid", async () => {
      const paymentUpdates: Record<string, unknown>[] = [];
      const orderUpdates: Record<string, unknown>[] = [];
      const origUpdate = mockDb.update.bind(mockDb);
      mockDb.update = ((table: unknown) => ({
        set: (vals: Record<string, unknown>) => {
          if (table === payments) paymentUpdates.push(vals);
          if (table === orders) orderUpdates.push(vals);
          return origUpdate(table as never).set(vals as never);
        },
      })) as unknown as typeof mockDb.update;

      mockDb.setSelectResultsQueue([
        [{ id: paymentId, orderId }],
        [
          {
            id: orderId,
            orderCode: "ORD-20261126-ABCDEF",
            orderStatus: OrderStatus.PENDING_PAYMENT,
          },
        ],
        [
          {
            id: paymentId,
            amount: 185_000,
            status: PaymentStatus.PENDING,
            referenceCode: null,
          },
        ],
      ]);

      const result = await service.handlePayosWebhook(validPayload);

      expect(result).toEqual({ received: true });
      expect(paymentUpdates).toHaveLength(1);
      expect(paymentUpdates[0]).toMatchObject({
        status: PaymentStatus.PAID,
        referenceCode: "FT26330123456",
      });
      expect(orderUpdates).toHaveLength(1);
      expect(orderUpdates[0]).toMatchObject({
        paymentStatus: PaymentStatus.PAID,
        orderStatus: OrderStatus.CONFIRMED,
        reservationExpiresAt: null,
      });
    });

    it("returns acknowledged without mutating records when PayOS code is not 00", async () => {
      const updates: unknown[] = [];
      const origUpdate = mockDb.update.bind(mockDb);
      mockDb.update = ((table: unknown) => ({
        set: (vals: unknown) => {
          updates.push({ table, vals });
          return origUpdate(table as never).set(vals as never);
        },
      })) as unknown as typeof mockDb.update;

      mockDb.setSelectResultsQueue([
        [{ id: paymentId, orderId }],
        [
          {
            id: orderId,
            orderCode: "ORD-20261126-ABCDEF",
            orderStatus: OrderStatus.PENDING_PAYMENT,
          },
        ],
        [
          {
            id: paymentId,
            amount: 185_000,
            status: PaymentStatus.PENDING,
            referenceCode: null,
          },
        ],
      ]);

      const result = await service.handlePayosWebhook({
        ...validPayload,
        code: "01",
        data: {
          ...validPayload.data,
          code: "01",
        },
      });

      expect(result).toEqual({ received: true });
      expect(updates).toHaveLength(0);
    });

    it("does not regress order status when order is already beyond pending_payment", async () => {
      const paymentUpdates: Record<string, unknown>[] = [];
      const orderUpdates: Record<string, unknown>[] = [];
      const origUpdate = mockDb.update.bind(mockDb);
      mockDb.update = ((table: unknown) => ({
        set: (vals: Record<string, unknown>) => {
          if (table === payments) paymentUpdates.push(vals);
          if (table === orders) orderUpdates.push(vals);
          return origUpdate(table as never).set(vals as never);
        },
      })) as unknown as typeof mockDb.update;

      mockDb.setSelectResultsQueue([
        [{ id: paymentId, orderId }],
        [
          {
            id: orderId,
            orderCode: "ORD-20261126-ABCDEF",
            orderStatus: OrderStatus.PACKING,
          },
        ],
        [
          {
            id: paymentId,
            amount: 185_000,
            status: PaymentStatus.PENDING,
            referenceCode: null,
          },
        ],
      ]);

      const result = await service.handlePayosWebhook(validPayload);

      expect(result).toEqual({ received: true });
      expect(paymentUpdates).toHaveLength(1);
      expect(orderUpdates).toHaveLength(0);
    });
  });
});
