import { z } from "zod";

/**
 * Strict empty-body schema for `POST /api/v1/waste-logs/:id/approve` that allows
 * omitted or `{}` payloads while rejecting unexpected JSON keys with `400`.
 */
export const approveWasteLogSchema = z.preprocess(
  (value) => (value === undefined ? {} : value),
  z.object({}).strict(),
);

/** Validated empty payload for approving a waste log. */
export type ApproveWasteLogInput = z.infer<typeof approveWasteLogSchema>;
