import { describe, expect, it } from "bun:test";
import { MockPaymentDriver } from "./drivers/mock-payment.driver";
import { PayOSAdapter } from "./drivers/payos.adapter";
import { resolvePaymentDriver } from "./payments.module";

describe("PaymentsModule", () => {
  const mock = new MockPaymentDriver();
  const payos = new PayOSAdapter();

  describe("resolvePaymentDriver", () => {
    it("selects MockPaymentDriver when NODE_ENV is test even if PAYMENT_DRIVER is payos", () => {
      // Invariant: INV-PAY-2
      const driver = resolvePaymentDriver(
        {
          NODE_ENV: "test",
          PAYMENT_DRIVER: "payos",
          PAYOS_CLIENT_ID: undefined,
          PAYOS_API_KEY: undefined,
          PAYOS_CHECKSUM_KEY: undefined,
        },
        mock,
        payos,
      );

      expect(driver).toBe(mock);
    });

    it("selects MockPaymentDriver when PAYMENT_DRIVER is mock in non-test environments", () => {
      // Invariant: INV-PAY-2
      const driver = resolvePaymentDriver(
        {
          NODE_ENV: "development",
          PAYMENT_DRIVER: "mock",
          PAYOS_CLIENT_ID: undefined,
          PAYOS_API_KEY: undefined,
          PAYOS_CHECKSUM_KEY: undefined,
        },
        mock,
        payos,
      );

      expect(driver).toBe(mock);
    });

    it("selects PayOSAdapter when PAYMENT_DRIVER is payos with all credentials in non-test", () => {
      // Invariant: INV-PAY-2
      const driver = resolvePaymentDriver(
        {
          NODE_ENV: "development",
          PAYMENT_DRIVER: "payos",
          PAYOS_CLIENT_ID: "client-id",
          PAYOS_API_KEY: "api-key",
          PAYOS_CHECKSUM_KEY: "checksum-key",
        },
        mock,
        payos,
      );

      expect(driver).toBe(payos);
    });

    it("throws when PAYMENT_DRIVER is payos with missing credentials in non-test", () => {
      // Invariant: INV-PAY-2
      expect(() =>
        resolvePaymentDriver(
          {
            NODE_ENV: "development",
            PAYMENT_DRIVER: "payos",
            PAYOS_CLIENT_ID: "client-id",
            PAYOS_API_KEY: undefined,
            PAYOS_CHECKSUM_KEY: "checksum-key",
          },
          mock,
          payos,
        ),
      ).toThrow(/PAYOS_CLIENT_ID/);
    });
  });
});
