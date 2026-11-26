import { randomInt } from "node:crypto";

/**
 * Generates a collision-resistant positive integer `orderCode` for PayOS v2 payment links.
 */
export function generatePayosOrderCode(now: Date): number {
  const epochSeconds = Math.floor(now.getTime() / 1000);
  return epochSeconds * 1_000_000 + randomInt(0, 1_000_000);
}
