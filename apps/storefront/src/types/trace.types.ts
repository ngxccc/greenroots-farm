import type { components } from "@/types/api-schema";

/** Public redacted batch QR traceability record returned by `GET /api/v1/trace/:batchCode`. */
export type TraceRecord = components["schemas"]["TraceRecordDto"];

/** Single append-only cultivation log entry within a `TraceRecord`. */
export type TraceFarmingLog = TraceRecord["farmingLogs"][number];

/** Public redacted recent harvested batch item returned by `GET /api/v1/trace`. */
export type RecentTraceBatchItem =
  components["schemas"]["RecentTraceBatchItemDto"];

/** Discriminated result returned by `fetchTraceByBatchCode` and `lookupTraceBatchAction`. */
export type TraceLookupResult =
  | { readonly ok: true; readonly data: TraceRecord }
  | {
      readonly ok: false;
      readonly reason: "not_found" | "error";
      readonly message: string;
    };
