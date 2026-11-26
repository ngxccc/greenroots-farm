import { randomInt } from "node:crypto";
import type { Logger } from "@nestjs/common";
import { PAYOS_CANCEL_LINK_CONCURRENCY } from "./payments.constant";
import type { PaymentDriver } from "./payments.interface";

/**
 * Target descriptor for post-commit PayOS payment link cancellation.
 */
export interface PayosLinkCancelTarget {
  readonly orderCode: number;
  readonly referenceId: string;
}

/**
 * Generates a collision-resistant positive integer `orderCode` for PayOS v2 payment links.
 */
export function generatePayosOrderCode(now: Date): number {
  const epochSeconds = Math.floor(now.getTime() / 1000);
  return epochSeconds * 1_000_000 + randomInt(0, 1_000_000);
}

/**
 * Cancels upstream PayOS payment links in bounded-concurrency batches strictly after DB commit.
 * Failures are logged as warnings without throwing so local DB cancellations are never rolled back.
 *
 * @param paymentDriver Active `PaymentDriver` adapter.
 * @param logger Caller logger instance for structured failure reporting.
 * @param targets PayOS `orderCode` targets collected from committed DB cancellations.
 * @param reason Human-readable cancellation reason sent to PayOS.
 */
export async function cancelPaymentLinksBestEffort(
  paymentDriver: Pick<PaymentDriver, "cancelPaymentLink">,
  logger: Pick<Logger, "warn">,
  targets: readonly PayosLinkCancelTarget[],
  reason: string,
): Promise<void> {
  if (targets.length === 0) {
    return;
  }

  for (let i = 0; i < targets.length; i += PAYOS_CANCEL_LINK_CONCURRENCY) {
    const chunk = targets.slice(i, i + PAYOS_CANCEL_LINK_CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map((target) =>
        paymentDriver.cancelPaymentLink(target.orderCode, reason),
      ),
    );

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        const target = chunk[index]!;
        const detail =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
        logger.warn(
          `Best-effort PayOS cancelPaymentLink failed for referenceId=${target.referenceId} orderCode=${target.orderCode}: ${detail}`,
        );
      }
    });
  }
}
