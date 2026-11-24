import type {
  BatchStatus,
  FarmingActionType,
  SeasonStatus,
} from "@greenroots/shared";

/** Single append-only farming log entry rendered in batch traceability timelines. */
export interface FarmingLogEntry {
  readonly id: string;
  readonly actionType: FarmingActionType;
  readonly description: string;
  readonly mediaUrls: readonly string[];
  readonly loggedAt: string;
  readonly engineerName: string;
}

/** Public QR traceability projection for a harvested batch. */
export interface BatchTraceRecord {
  readonly batchCode: string;
  readonly productName: string;
  readonly unitLabel: string;
  readonly harvestDate: string;
  readonly expirationDate: string;
  readonly status: BatchStatus;
  readonly plotCode: string;
  readonly plotName: string;
  readonly areaSqm: number;
  readonly seasonName: string;
  readonly seasonStatus: SeasonStatus;
  readonly soilPh: number;
  readonly waterPh: number;
  readonly heavyMetalsPass: boolean;
  readonly certificationUrl: string;
  readonly farmingLogs: readonly FarmingLogEntry[];
}
