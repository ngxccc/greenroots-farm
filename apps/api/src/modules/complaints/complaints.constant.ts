/**
 * Runtime domain constants for `ComplaintsModule` (`ADR-0035`, `ADR-0040`).
 */

/** Minimum trimmed length for customer complaint reason text. */
export const COMPLAINT_REASON_MIN_LENGTH = 10;

/** Maximum trimmed length for customer complaint reason text. */
export const COMPLAINT_REASON_MAX_LENGTH = 2000;

/** Maximum character length matching `complaints.proof_video_url` (`varchar(500)`). */
export const COMPLAINT_MEDIA_URL_MAX_LENGTH = 500;
