import type { StaffAuditAction, StaffAuditSnapshot } from "@greenroots/shared";

/**
 * Authoritative verified coordinates and formatted shipping snapshot resolved for checkout or subscriptions.
 */
export interface ResolvedQuoteAddress {
  readonly id: string;
  readonly receiverName: string;
  readonly phoneNumber: string;
  readonly formattedAddress: string;
  readonly placeId: string;
  readonly district: string;
  readonly city: string;
  readonly latitude: number;
  readonly longitude: number;
}

/**
 * Input payload for persisting a single `staff_audit_logs` record.
 */
export interface StaffAuditRecordInput {
  readonly actorId: string;
  readonly targetUserId: string;
  readonly action: StaffAuditAction;
  readonly before: StaffAuditSnapshot | null;
  readonly after: StaffAuditSnapshot | null;
}
