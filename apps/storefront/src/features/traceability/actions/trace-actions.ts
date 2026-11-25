"use server";

import { fetchTraceByBatchCode } from "@/features/traceability/services/trace.service";
import type { TraceLookupResult } from "@/features/traceability/types/trace.types";

/**
 * Server Action invoked by the `/trace` lookup form to resolve a batch code
 * against `GET /api/v1/trace/:batchCode` without exposing direct browser API calls.
 *
 * @param batchCode Raw batch code entered by the visitor.
 * @returns Discriminated lookup result for inline preview or error rendering.
 */
export async function lookupTraceBatchAction(
  batchCode: string,
): Promise<TraceLookupResult> {
  return fetchTraceByBatchCode(batchCode);
}
