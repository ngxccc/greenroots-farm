import { randomBytes } from "node:crypto";
import { asc, and, eq, gt, inArray, sql } from "drizzle-orm";
import { BatchStatus } from "@greenroots/shared";
import { CROCKFORD_BASE32_ALPHABET } from "@/common/constants/encoding.constant";
import { PG_ERROR_CODE } from "@/common/constants/error.constant";
import { VIETNAM_TIMEZONE } from "@/common/constants/time.constant";
import { extractDatabaseErrorDetails } from "@/common/utils/error.util";
import type { DrizzleTx } from "@/database/database.module";
import { batchAllocations, batches } from "@/database/schemas";
import { ORDER_CODE_PREFIX, ORDER_CODE_RANDOM_LENGTH } from "./orders.constant";

// Keep sellable statuses as SQL literals so PostgreSQL proves predicate implication for batches_sellable_stock_idx.
const SELLABLE_BATCH_STATUS_SQL = sql.raw(
  `'${BatchStatus.IN_STOCK}', '${BatchStatus.NEAR_EXPIRY}'`,
);

const VN_CALENDAR_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: VIETNAM_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Locked sellable batch row returned by `lockCandidateSellableBatches`. */
export interface LockedSellableBatch {
  readonly id: string;
  readonly productId: string;
  readonly batchCode: string;
  readonly expirationDate: Date;
  readonly availableQuantity: string;
  readonly status: BatchStatus;
}

/** Normalized item input for FEFO batch allocation planning. */
export interface FefoAllocationItemInput {
  readonly productId: string;
  readonly quantityCents: number;
}

/** Single batch allocation row planned for an order line item. */
export interface PlannedBatchAllocation {
  readonly productId: string;
  readonly batchId: string;
  readonly allocatedQuantity: string;
}

/** Planned remaining-stock update for a locked batch after FEFO allocation. */
export interface PlannedBatchUpdate {
  readonly batchId: string;
  readonly availableQuantity: string;
  readonly status: BatchStatus;
}

/** Complete FEFO allocation and batch-update plan ready for persistence. */
export interface FefoAllocationPlan {
  readonly allocations: readonly PlannedBatchAllocation[];
  readonly batchUpdates: readonly PlannedBatchUpdate[];
}

/** Per-product stock shortage details when sellable batches cannot fulfill demand. */
export interface FefoStockShortage {
  readonly productId: string;
  readonly requested: number;
  readonly available: number;
}

/** Discriminated result of `planFefoAllocations` indicating either a plan or stock shortages. */
export type FefoPlanOutcome =
  | { readonly ok: true; readonly plan: FefoAllocationPlan }
  | { readonly ok: false; readonly shortages: readonly FefoStockShortage[] };

/**
 * Converts a numeric or decimal-string quantity into integer cents (`quantity * 100`).
 */
export function toQuantityCents(value: string | number): number {
  return Math.round(Number(value) * 100);
}

/**
 * Formats integer quantity cents (`quantity * 100`) into a fixed 2-decimal string.
 */
export function formatQuantityFromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Formats a `Date` into `YYYYMMDD` in `Asia/Ho_Chi_Minh` timezone for order codes.
 */
export function formatOrderCalendarDateVn(date: Date): string {
  return VN_CALENDAR_FORMATTER.format(date).replaceAll("-", "");
}

/**
 * Generates a unique-candidate `ORD-YYYYMMDD-XXXXXX` code using Crockford Base32.
 */
export function buildOrderCode(yyyymmdd: string): string {
  const bytes = randomBytes(ORDER_CODE_RANDOM_LENGTH);
  let suffix = "";
  for (const byte of bytes) {
    suffix += CROCKFORD_BASE32_ALPHABET[byte % 32];
  }
  return `${ORDER_CODE_PREFIX}-${yyyymmdd}-${suffix}`;
}

/**
 * Checks whether a database error is a PostgreSQL `23505` unique violation on `orders_order_code_uidx`.
 */
export function isOrderCodeUniqueViolation(error: unknown): boolean {
  const details = extractDatabaseErrorDetails(error);
  return (
    details.isDatabaseError &&
    details.code === PG_ERROR_CODE.UNIQUE_VIOLATION &&
    details.constraint === "orders_order_code_uidx"
  );
}

/**
 * Locks all candidate sellable batches for the given product IDs in ascending `batches.id` order
 * to prevent crossed-item deadlocks (`ADR-0033`).
 */
export async function lockCandidateSellableBatches(
  tx: DrizzleTx,
  productIds: readonly string[],
  now: Date,
): Promise<LockedSellableBatch[]> {
  const sortedProductIds = Array.from(new Set(productIds)).sort((a, b) =>
    a.localeCompare(b),
  );

  // Lock all candidate sellable batches across every order item in one ascending-ID query to eliminate crossed-item deadlocks.
  return tx
    .select({
      id: batches.id,
      productId: batches.productId,
      batchCode: batches.batchCode,
      expirationDate: batches.expirationDate,
      availableQuantity: batches.availableQuantity,
      status: batches.status,
    })
    .from(batches)
    .where(
      and(
        inArray(batches.productId, sortedProductIds),
        sql`${batches.status} IN (${SELLABLE_BATCH_STATUS_SQL})`,
        gt(batches.expirationDate, now),
        sql`${batches.availableQuantity} > 0`,
      ),
    )
    .orderBy(asc(batches.id))
    .for("update");
}

/**
 * Computes a deterministic FEFO (`expirationDate` ascending, then `id` ascending) batch allocation plan.
 */
export function planFefoAllocations(
  items: readonly FefoAllocationItemInput[],
  candidateBatches: readonly LockedSellableBatch[],
): FefoPlanOutcome {
  const batchesByProduct = new Map<string, LockedSellableBatch[]>();
  const remainingCentsByBatchId = new Map<string, number>();

  for (const batch of candidateBatches) {
    remainingCentsByBatchId.set(
      batch.id,
      toQuantityCents(batch.availableQuantity),
    );
    const list = batchesByProduct.get(batch.productId);
    if (list) {
      list.push(batch);
    } else {
      batchesByProduct.set(batch.productId, [batch]);
    }
  }

  for (const list of batchesByProduct.values()) {
    list.sort((a, b) => {
      const expDiff = a.expirationDate.getTime() - b.expirationDate.getTime();
      return expDiff !== 0 ? expDiff : a.id.localeCompare(b.id);
    });
  }

  const allocations: PlannedBatchAllocation[] = [];
  const touchedBatches = new Map<string, LockedSellableBatch>();
  const shortages: FefoStockShortage[] = [];

  for (const item of items) {
    const requestedCents = item.quantityCents;
    let remainingNeededCents = requestedCents;
    const productBatches = batchesByProduct.get(item.productId) ?? [];

    const availableForProductCents = productBatches.reduce(
      (sum, batch) => sum + (remainingCentsByBatchId.get(batch.id) ?? 0),
      0,
    );

    if (availableForProductCents < requestedCents) {
      shortages.push({
        productId: item.productId,
        requested: requestedCents / 100,
        available: availableForProductCents / 100,
      });
      continue;
    }

    for (const batch of productBatches) {
      if (remainingNeededCents === 0) {
        break;
      }

      const batchRemainingCents = remainingCentsByBatchId.get(batch.id) ?? 0;
      if (batchRemainingCents <= 0) {
        continue;
      }

      const takeCents = Math.min(remainingNeededCents, batchRemainingCents);
      remainingCentsByBatchId.set(batch.id, batchRemainingCents - takeCents);
      remainingNeededCents -= takeCents;
      touchedBatches.set(batch.id, batch);

      allocations.push({
        productId: item.productId,
        batchId: batch.id,
        allocatedQuantity: formatQuantityFromCents(takeCents),
      });
    }
  }

  if (shortages.length > 0) {
    return { ok: false, shortages };
  }

  const batchUpdates: PlannedBatchUpdate[] = [];
  for (const batch of touchedBatches.values()) {
    const nextAvailableCents = remainingCentsByBatchId.get(batch.id) ?? 0;
    batchUpdates.push({
      batchId: batch.id,
      availableQuantity: formatQuantityFromCents(nextAvailableCents),
      status: nextAvailableCents === 0 ? BatchStatus.SOLD_OUT : batch.status,
    });
  }

  return { ok: true, plan: { allocations, batchUpdates } };
}

/**
 * Persists planned `batch_allocations` rows and updates `batches` remaining stock and status.
 */
export async function applyFefoAllocations(
  tx: DrizzleTx,
  plan: FefoAllocationPlan,
  insertedItemIdByProduct: ReadonlyMap<string, string>,
  now: Date,
): Promise<void> {
  if (plan.allocations.length > 0) {
    await tx.insert(batchAllocations).values(
      plan.allocations.map((allocation) => {
        const orderItemId = insertedItemIdByProduct.get(allocation.productId);
        if (!orderItemId) {
          throw new Error(
            `Missing inserted order item for product ${allocation.productId}.`,
          );
        }

        return {
          orderItemId,
          batchId: allocation.batchId,
          allocatedQuantity: allocation.allocatedQuantity,
          allocatedAt: now,
          releasedAt: null,
        };
      }),
    );
  }

  for (const update of plan.batchUpdates) {
    await tx
      .update(batches)
      .set({
        availableQuantity: update.availableQuantity,
        status: update.status,
        updatedAt: now,
      })
      .where(eq(batches.id, update.batchId));
  }
}
