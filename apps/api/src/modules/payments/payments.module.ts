import { Module } from "@nestjs/common";
import { env, type ApiEnvironment } from "@/common/config/env.config";
import { MockPaymentDriver } from "./drivers/mock-payment.driver";
import { PayOSAdapter } from "./drivers/payos.adapter";
import { PAYMENT_DRIVER_TOKEN } from "./payments.constant";
import type { PaymentDriver } from "./payments.interface";

type PaymentDriverEnv = Pick<
  ApiEnvironment,
  | "NODE_ENV"
  | "PAYMENT_DRIVER"
  | "PAYOS_CLIENT_ID"
  | "PAYOS_API_KEY"
  | "PAYOS_CHECKSUM_KEY"
>;

/**
 * Selects the active `PaymentDriver`, failing closed when `PAYMENT_DRIVER=payos`
 * is configured outside `test` without all three PayOS credentials.
 *
 * @param activeEnv Active API environment configuration.
 * @param mock Deterministic mock payment driver.
 * @param payos Live PayOS v2 adapter.
 * @returns Resolved `PaymentDriver` implementation.
 */
export function resolvePaymentDriver(
  activeEnv: PaymentDriverEnv,
  mock: MockPaymentDriver,
  payos: PayOSAdapter,
): PaymentDriver {
  if (activeEnv.NODE_ENV === "test" || activeEnv.PAYMENT_DRIVER === "mock") {
    return mock;
  }

  if (
    !activeEnv.PAYOS_CLIENT_ID?.trim() ||
    !activeEnv.PAYOS_API_KEY?.trim() ||
    !activeEnv.PAYOS_CHECKSUM_KEY?.trim()
  ) {
    throw new Error(
      "PAYOS_CLIENT_ID, PAYOS_API_KEY, and PAYOS_CHECKSUM_KEY are required when PAYMENT_DRIVER is 'payos'",
    );
  }

  return payos;
}

/**
 * Provides and exports the `PAYMENT_DRIVER_TOKEN` seam for checkout, webhook, and expiry flows.
 */
@Module({
  providers: [
    MockPaymentDriver,
    PayOSAdapter,
    {
      provide: PAYMENT_DRIVER_TOKEN,
      useFactory: (mock: MockPaymentDriver, payos: PayOSAdapter) =>
        resolvePaymentDriver(env, mock, payos),
      inject: [MockPaymentDriver, PayOSAdapter],
    },
  ],
  exports: [PAYMENT_DRIVER_TOKEN, MockPaymentDriver],
})
export class PaymentsModule {}
