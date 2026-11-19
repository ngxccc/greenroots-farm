import { Injectable } from "@nestjs/common";
import type { StaffAuditAction, StaffAuditSnapshot } from "@greenroots/shared";
import type { DrizzleTx } from "@/database/database.module";
import { staffAuditLogs } from "@/database/schemas";

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

/**
 * Writes append-only `staff_audit_logs` records inside the caller's database transaction.
 */
@Injectable()
export class AuditService {
  /**
   * Builds a redacted audit snapshot containing only non-credential staff fields.
   *
   * @param source Staff projection source row.
   * @returns Redacted snapshot safe for JSONB persistence.
   */
  toSnapshot(source: StaffAuditSnapshot): StaffAuditSnapshot {
    return {
      email: source.email,
      fullName: source.fullName,
      phone: source.phone,
      role: source.role,
      status: source.status,
    };
  }

  /**
   * Persists exactly one immutable `staff_audit_logs` entry inside `tx`.
   *
   * @param tx Active database transaction.
   * @param input Audit log entry payload.
   */
  async recordStaffAudit(
    tx: DrizzleTx,
    input: StaffAuditRecordInput,
  ): Promise<void> {
    await tx.insert(staffAuditLogs).values({
      actorId: input.actorId,
      targetUserId: input.targetUserId,
      action: input.action,
      before: input.before,
      after: input.after,
    });
  }
}
