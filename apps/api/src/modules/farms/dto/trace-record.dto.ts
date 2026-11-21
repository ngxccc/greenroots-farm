import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import {
  BatchStatus,
  FarmingActionType,
  SeasonStatus,
} from "@greenroots/shared";
import { MESSAGES } from "@/common/constants/messages.constant";
import { zIsoDate, zUuidV7 } from "@/common/schemas/zod-primitives";
import { BATCH_CODE_REGEX } from "../farms.constant";
import { soilTestResultSchema, waterTestResultSchema } from "./plot.dto";

/**
 * Normalizes and validates the `:batchCode` path parameter for public QR traceability.
 */
export const batchCodeParamSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(BATCH_CODE_REGEX, {
    message: MESSAGES.VALIDATION.INVALID_BATCH_CODE,
  });

/**
 * Zod schema for the public redacted batch summary in `GET /api/v1/trace/:batchCode`.
 */
export const traceBatchSummarySchema = z.object({
  id: zUuidV7(),
  batchCode: z.string(),
  harvestDate: z.iso.datetime(),
  expirationDate: z.iso.datetime(),
  status: z.enum(BatchStatus),
});

/**
 * Zod schema for the public product summary in `GET /api/v1/trace/:batchCode`.
 */
export const traceProductSummarySchema = z.object({
  id: zUuidV7(),
  name: z.string(),
  slug: z.string(),
  unit: z.string(),
  imageUrls: z.array(z.string()),
});

/**
 * Zod schema for the public farm provenance summary in `GET /api/v1/trace/:batchCode`.
 */
export const traceFarmSummarySchema = z.object({
  name: z.string(),
  legalName: z.string(),
  tagline: z.string().nullable(),
  address: z.string(),
  certificationUrl: z.string().nullable(),
});

/**
 * Zod schema for the public cultivation plot and laboratory telemetry summary.
 */
export const tracePlotSummarySchema = z.object({
  plotCode: z.string(),
  name: z.string(),
  areaSqm: z.number(),
  soilTestResult: soilTestResultSchema.nullable(),
  waterTestResult: waterTestResultSchema.nullable(),
});

/**
 * Zod schema for the cultivation season summary in `GET /api/v1/trace/:batchCode`.
 */
export const traceSeasonSummarySchema = z.object({
  id: zUuidV7(),
  seasonName: z.string(),
  startDate: zIsoDate(),
  expectedHarvestDate: zIsoDate(),
  status: z.enum(SeasonStatus),
});

/**
 * Zod schema for the target log summary referenced by `correctsLog` on public trace timelines.
 */
export const traceLogTargetSummarySchema = z.object({
  id: zUuidV7(),
  actionType: z.enum(FarmingActionType),
  description: z.string(),
  loggedAt: z.iso.datetime(),
});

/**
 * Zod schema for reverse correction references in `correctedBy` without internal `staffId`.
 */
export const traceLogCorrectionRefSchema = z.object({
  id: zUuidV7(),
  loggedAt: z.iso.datetime(),
  recordedByName: z.string(),
});

/**
 * Zod schema for a redacted public farming log entry in a batch trace timeline.
 */
export const traceFarmingLogSchema = z.object({
  id: zUuidV7(),
  actionType: z.enum(FarmingActionType),
  description: z.string(),
  mediaUrls: z.array(z.string()),
  recordedByName: z.string(),
  correctsLogId: zUuidV7().nullable(),
  correctsLog: traceLogTargetSummarySchema.nullable(),
  correctedBy: z.array(traceLogCorrectionRefSchema),
  loggedAt: z.iso.datetime(),
});

/**
 * Zod schema for the complete public QR traceability record returned by `GET /api/v1/trace/:batchCode`.
 */
export const traceRecordSchema = z.object({
  batch: traceBatchSummarySchema,
  product: traceProductSummarySchema,
  farm: traceFarmSummarySchema,
  plot: tracePlotSummarySchema,
  season: traceSeasonSummarySchema,
  farmingLogs: z.array(traceFarmingLogSchema),
  totalLogCount: z.number().int().nonnegative(),
  logsTruncated: z.boolean(),
});

/** Redacted public target log summary referenced by `correctsLog`. */
export type TraceLogTargetSummary = z.infer<typeof traceLogTargetSummarySchema>;

/** Redacted public reverse correction reference in `correctedBy`. */
export type TraceLogCorrectionRef = z.infer<typeof traceLogCorrectionRefSchema>;

/** Redacted public cultivation log entry on a batch trace timeline. */
export type TraceFarmingLogProjection = z.infer<typeof traceFarmingLogSchema>;

/** Complete redacted public QR traceability record projection. */
export type TraceRecordProjection = z.infer<typeof traceRecordSchema>;

/**
 * Response DTO for public batch QR traceability (`GET /api/v1/trace/:batchCode`).
 */
export class TraceRecordDto extends createZodDto(traceRecordSchema) {
  public static readonly zodSchema = traceRecordSchema;
}
