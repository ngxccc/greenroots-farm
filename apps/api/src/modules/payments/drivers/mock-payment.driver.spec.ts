import { beforeEach, describe, expect, it } from "bun:test";
import { MockPaymentDriver } from "./mock-payment.driver";

async function expectErrorMessage(
  promise: Promise<unknown>,
  pattern: RegExp,
): Promise<void> {
  try {
    await promise;
    expect.unreachable("Expected promise to reject");
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(pattern);
  }
}

describe("MockPaymentDriver", () => {
  let driver: MockPaymentDriver;

  beforeEach(() => {
    driver = new MockPaymentDriver();
  });

  describe("createPaymentLink", () => {
    it("returns deterministic link metadata and stores the record", async () => {
      // Invariant: INV-PAY-3
      const result = await driver.createPaymentLink({
        orderCode: 123456,
        amountVnd: 250_000,
        description: "GRF-123456",
        returnUrl: "https://greenroots.farm/return",
        cancelUrl: "https://greenroots.farm/cancel",
      });

      expect(result).toEqual({
        checkoutUrl: "https://mock.payos.local/checkout/123456",
        paymentLinkId: "mock-link-123456",
        orderCode: 123456,
        qrCode: "MOCK_VIETQR_123456_250000",
        status: "PENDING",
      });
      expect(driver.getCreatedLinks()).toHaveLength(1);
    });

    it("rejects invalid orderCode, amountVnd, or oversized description", async () => {
      // Invariant: INV-PAY-3
      await expectErrorMessage(
        driver.createPaymentLink({
          orderCode: 0,
          amountVnd: 250_000,
          description: "GRF-0",
          returnUrl: "https://greenroots.farm/return",
          cancelUrl: "https://greenroots.farm/cancel",
        }),
        /orderCode/,
      );

      await expectErrorMessage(
        driver.createPaymentLink({
          orderCode: Number.MAX_SAFE_INTEGER + 1,
          amountVnd: 250_000,
          description: "GRF-1",
          returnUrl: "https://greenroots.farm/return",
          cancelUrl: "https://greenroots.farm/cancel",
        }),
        /orderCode/,
      );

      await expectErrorMessage(
        driver.createPaymentLink({
          orderCode: 100,
          amountVnd: 100.5,
          description: "GRF-100",
          returnUrl: "https://greenroots.farm/return",
          cancelUrl: "https://greenroots.farm/cancel",
        }),
        /amountVnd/,
      );

      await expectErrorMessage(
        driver.createPaymentLink({
          orderCode: 100,
          amountVnd: 100_000,
          description: "A".repeat(26),
          returnUrl: "https://greenroots.farm/return",
          cancelUrl: "https://greenroots.farm/cancel",
        }),
        /description/,
      );
    });
  });

  describe("verifyWebhook", () => {
    it("returns verified data when signature and payload are valid", async () => {
      const verified = await driver.verifyWebhook({
        code: "00",
        desc: "success",
        success: true,
        data: {
          orderCode: 123456,
          amount: 250_000,
          description: "GRF-123456",
          accountNumber: "12345678",
          reference: "FT25001",
          transactionDateTime: "2026-11-25 10:00:00",
          currency: "VND",
          paymentLinkId: "mock-link-123456",
          code: "00",
          desc: "success",
        },
        signature: "mock-signature",
      });

      expect(verified.orderCode).toBe(123456);
      expect(verified.amountVnd).toBe(250_000);
      expect(verified.reference).toBe("FT25001");
    });

    it("rejects webhook when signature is empty or invalid", async () => {
      await expectErrorMessage(
        driver.verifyWebhook({
          code: "00",
          desc: "success",
          data: { orderCode: 123456, amount: 250_000 },
          signature: "",
        }),
        /signature/,
      );

      await expectErrorMessage(
        driver.verifyWebhook({
          code: "00",
          desc: "success",
          data: { orderCode: 123456, amount: 250_000 },
          signature: "invalid",
        }),
        /signature/,
      );
    });

    it("rejects webhook when payload data is missing or not an object", async () => {
      await expectErrorMessage(
        driver.verifyWebhook({
          code: "00",
          desc: "success",
          data: null as unknown as Record<string, unknown>,
          signature: "mock-signature",
        }),
        /missing data object/,
      );
    });
  });

  describe("cancelPaymentLink", () => {
    it("marks an existing mock link as cancelled", async () => {
      await driver.createPaymentLink({
        orderCode: 789,
        amountVnd: 150_000,
        description: "GRF-789",
        returnUrl: "https://greenroots.farm/return",
        cancelUrl: "https://greenroots.farm/cancel",
      });

      const cancelled = await driver.cancelPaymentLink(789, "Customer expired");
      expect(cancelled.status).toBe("CANCELLED");
      expect(cancelled.orderCode).toBe(789);
      expect(cancelled.cancellationReason).toBe("Customer expired");
      expect(driver.getCreatedLinks()[0]?.status).toBe("CANCELLED");
    });
  });

  describe("getPaymentLinkInfo", () => {
    it("returns tracked status for created/cancelled links and PENDING for untracked orderCodes", async () => {
      await driver.createPaymentLink({
        orderCode: 790,
        amountVnd: 150_000,
        description: "GRF-790",
        returnUrl: "https://greenroots.farm/return",
        cancelUrl: "https://greenroots.farm/cancel",
      });

      const pending = await driver.getPaymentLinkInfo(790);
      expect(pending.status).toBe("PENDING");
      expect(pending.amountVnd).toBe(150_000);

      await driver.cancelPaymentLink(790, "Cancelled by user");
      const cancelled = await driver.getPaymentLinkInfo(790);
      expect(cancelled.status).toBe("CANCELLED");

      const untracked = await driver.getPaymentLinkInfo(999);
      expect(untracked.status).toBe("PENDING");
    });
  });
});
