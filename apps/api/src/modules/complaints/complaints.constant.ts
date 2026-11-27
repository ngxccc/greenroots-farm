import { ComplaintStatus, UserRole } from "@greenroots/shared";

/**
 * Runtime domain constants for `ComplaintsModule` (`ADR-0035`, `ADR-0040`, `ADR-0045`).
 */

/** Minimum trimmed length for customer complaint reason text. */
export const COMPLAINT_REASON_MIN_LENGTH = 10;

/** Maximum trimmed length for customer complaint reason text. */
export const COMPLAINT_REASON_MAX_LENGTH = 2000;

/** Maximum character length matching `complaints.proof_video_url` (`varchar(500)`). */
export const COMPLAINT_MEDIA_URL_MAX_LENGTH = 500;

/** Staff roles authorized to list and triage customer complaints (`ADR-0045`). */
export const COMPLAINTS_STAFF_ALLOWED_ROLES = Object.freeze([
  UserRole.SALES,
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
] as const);

/** Staff roles authorized to resolve triaged complaints (`ADR-0046`, `INV-CMP-9`). */
export const COMPLAINTS_RESOLVE_ALLOWED_ROLES = Object.freeze([
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
] as const);

/** Maximum trimmed length for administrative `resolutionNote`. */
export const RESOLUTION_NOTE_MAX_LENGTH = 500;

/** Maximum trimmed length for manual bank-transfer refund `referenceCode`. */
export const REFUND_REFERENCE_CODE_MAX_LENGTH = 100;

/** Valid target statuses for staff complaint triage (`ADR-0045`). */
export const TRIAGE_TARGET_STATUSES = Object.freeze([
  ComplaintStatus.TRIAGED,
  ComplaintStatus.REJECTED,
] as const);

/** Minimum trimmed length for staff rejection `triageNote`. */
export const TRIAGE_NOTE_MIN_LENGTH = 5;

/** Maximum trimmed length for staff `triageNote`. */
export const TRIAGE_NOTE_MAX_LENGTH = 500;

/** Minimum trimmed length for staff complaint `search` query. */
export const COMPLAINT_SEARCH_MIN_LENGTH = 2;

/** Maximum trimmed length for staff complaint `search` query. */
export const COMPLAINT_SEARCH_MAX_LENGTH = 100;
