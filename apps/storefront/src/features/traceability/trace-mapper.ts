import type { RecentTraceBatchItem, TraceRecord } from "@/types/trace.types";

/**
 * Maps a full `TraceRecord` into the compact `RecentTraceBatchItem` shape used by the `/trace` preview panel.
 *
 * @param record Full batch traceability record.
 * @returns Compact preview summary.
 */
export function toRecentTracePreview(
  record: TraceRecord,
): RecentTraceBatchItem {
  return {
    batchCode: record.batch.batchCode,
    harvestDate: record.batch.harvestDate,
    status: record.batch.status,
    product: {
      name: record.product.name,
      unit: record.product.unit,
      imageUrls: record.product.imageUrls,
    },
    plot: {
      plotCode: record.plot.plotCode,
      name: record.plot.name,
    },
  };
}

/**
 * Validates that an external certification URL uses HTTPS before rendering an outbound anchor.
 *
 * @param rawUrl Candidate certification URL from farm metadata.
 * @returns `true` when the URL parses cleanly as `https:`.
 */
export function isSafeExternalCertUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl.trim());
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}
