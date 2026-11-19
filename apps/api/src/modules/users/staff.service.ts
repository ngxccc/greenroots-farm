import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  type SQL,
} from "drizzle-orm";
import {
  API_ERROR_CODES,
  isStaffRole,
  STAFF_ROLES,
  StaffAuditAction,
  UserRole,
  UserStatus,
} from "@greenroots/shared";
import { AUTH_REVOCATION_TTL_SECONDS } from "@/common/constants/auth.constant";
import { PG_ERROR_CODE } from "@/common/constants/error.constant";
import { MESSAGES } from "@/common/constants/messages.constant";
import type { JwtPayload } from "@/common/decorators/current-user.decorator";
import type { PaginationMetaDto } from "@/common/dto/api-response.dto";
import { RedisService } from "@/common/services/redis.service";
import { buildPaginationMeta } from "@/common/utils/api-response.util";
import { extractDatabaseErrorDetails } from "@/common/utils/error.util";
import {
  DATABASE_CONNECTION,
  type DrizzleDB,
  type DrizzleTx,
} from "@/database/database.module";
import { refreshTokens, users } from "@/database/schemas";
import {
  STAFF_USER_COLUMNS,
  type StaffUserRow,
} from "@/database/utils/user-projections";
import { AuthService } from "@/modules/auth/auth.service";
import { MailService } from "@/modules/mail/mail.service";
import { AuditService } from "./audit.service";
import type {
  CreateStaffInput,
  ListStaffQuery,
  StaffMember,
  StaffSortOption,
  UpdateStaffInput,
} from "./dto";
import { ProfileService } from "./profile.service";

const STAFF_SORT_EXPRESSIONS = new Map<StaffSortOption, SQL[]>([
  ["createdAt:desc", [desc(users.createdAt), desc(users.id)]],
  ["createdAt:asc", [asc(users.createdAt), desc(users.id)]],
  ["fullName:asc", [asc(users.fullName), desc(users.id)]],
  ["fullName:desc", [desc(users.fullName), desc(users.id)]],
  ["email:asc", [asc(users.email), desc(users.id)]],
  ["email:desc", [desc(users.email), desc(users.id)]],
]);

function escapeLikePattern(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
}

/**
 * Orchestrates staff directory queries, onboarding, role/status governance,
 * session revocation, and append-only audit logging per ADR-0019 and ADR-0020.
 */
@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DrizzleDB,
    private readonly authService: AuthService,
    private readonly profileService: ProfileService,
    private readonly auditService: AuditService,
    private readonly redisService: RedisService,
    private readonly mailService: MailService,
  ) {}

  private toStaffMember(row: StaffUserRow): StaffMember {
    if (!isStaffRole(row.role)) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.STAFF_ROLE_INVALID,
        detail: MESSAGES.STAFF.ROLE_INVALID,
      });
    }

    return {
      id: row.id,
      email: row.email,
      fullName: row.fullName,
      phone: row.phone,
      role: row.role,
      status: row.status,
      emailVerified: row.emailVerified,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private assertValidStaffRole(role: UserRole): void {
    if (!isStaffRole(role)) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.STAFF_ROLE_INVALID,
        detail: MESSAGES.STAFF.ROLE_INVALID,
      });
    }
  }

  private staffNotFound(): NotFoundException {
    return new NotFoundException({
      code: API_ERROR_CODES.STAFF_NOT_FOUND,
      detail: MESSAGES.STAFF.NOT_FOUND,
    });
  }

  private async lockStaffTarget(
    tx: DrizzleTx,
    targetId: string,
  ): Promise<StaffUserRow> {
    const [target] = await tx
      .select(STAFF_USER_COLUMNS)
      .from(users)
      .where(and(eq(users.id, targetId), isNull(users.deletedAt)))
      .for("update");

    if (!target || !isStaffRole(target.role)) {
      throw this.staffNotFound();
    }

    return target;
  }

  private resolveUpdateAuditAction(
    profileChanged: boolean,
    roleChanged: boolean,
    statusChanged: boolean,
  ): StaffAuditAction {
    const changedDimensions =
      Number(profileChanged) + Number(roleChanged) + Number(statusChanged);
    if (changedDimensions > 1) {
      return StaffAuditAction.UPDATE;
    }
    if (roleChanged) {
      return StaffAuditAction.CHANGE_ROLE;
    }
    if (statusChanged) {
      return StaffAuditAction.CHANGE_STATUS;
    }
    return StaffAuditAction.UPDATE_PROFILE;
  }

  /**
   * Lists staff accounts with role/status/search filtering, whitelisted sorting, and pagination.
   *
   * @param query Validated filter, search, sort, and pagination parameters.
   * @returns Closed staff projections and pagination metadata.
   */
  async listStaff(
    query: ListStaffQuery,
  ): Promise<{ items: StaffMember[]; meta: PaginationMetaDto }> {
    if (query.role !== undefined) {
      this.assertValidStaffRole(query.role);
    }

    const conditions: SQL[] = [
      isNull(users.deletedAt),
      query.role !== undefined
        ? eq(users.role, query.role)
        : inArray(users.role, [...STAFF_ROLES]),
    ];

    if (query.status !== undefined) {
      conditions.push(eq(users.status, query.status));
    }

    if (query.q !== undefined && query.q.length > 0) {
      const pattern = `%${escapeLikePattern(query.q)}%`;
      const searchPredicate = or(
        ilike(users.fullName, pattern),
        ilike(users.email, pattern),
        ilike(users.phone, pattern),
      );
      if (searchPredicate) {
        conditions.push(searchPredicate);
      }
    }

    const whereClause = and(...conditions);
    const offset = (query.page - 1) * query.limit;

    const [totalRow] = await this.db
      .select({ total: count() })
      .from(users)
      .where(whereClause);

    const orderBy = STAFF_SORT_EXPRESSIONS.get(query.sort) ?? [
      desc(users.createdAt),
      desc(users.id),
    ];

    const rows = await this.db
      .select(STAFF_USER_COLUMNS)
      .from(users)
      .where(whereClause)
      .orderBy(...orderBy)
      .limit(query.limit)
      .offset(offset);

    return {
      items: rows.map((row) => this.toStaffMember(row)),
      meta: buildPaginationMeta(
        Number(totalRow?.total ?? 0),
        query.page,
        query.limit,
      ),
    };
  }

  /**
   * Creates an unverified staff account with a 24h SHA-256 reset token and sends a Backoffice invite.
   *
   * @param actorId Authenticated `super_admin` subject ID.
   * @param input Validated staff creation payload.
   * @returns Newly created staff projection without secret fields.
   */
  async createStaff(
    actorId: string,
    input: CreateStaffInput,
  ): Promise<StaffMember> {
    this.assertValidStaffRole(input.role);
    const normalizedEmail = input.email.toLowerCase().trim();

    // Perform scrypt hashing outside the transaction so row locks stay minimal.
    const creds = await this.authService.prepareStaffCredentials();

    let created: StaffUserRow;
    try {
      created = await this.db.transaction(async (tx) => {
        const [existing] = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.email, normalizedEmail), isNull(users.deletedAt)))
          .limit(1);

        if (existing) {
          throw new ConflictException({
            code: API_ERROR_CODES.AUTH_EMAIL_ALREADY_EXISTS,
            detail: MESSAGES.AUTH.EMAIL_ALREADY_EXISTS,
          });
        }

        const inserted = await this.authService.createStaffIdentity(tx, {
          email: normalizedEmail,
          fullName: input.fullName,
          phone: input.phone ?? null,
          role: input.role,
          passwordHash: creds.unusablePasswordHash,
          tokenHash: creds.tokenHash,
          expiresAt: creds.expiresAt,
        });

        await this.auditService.recordStaffAudit(tx, {
          actorId,
          targetUserId: inserted.id,
          action: StaffAuditAction.CREATE,
          before: null,
          after: this.auditService.toSnapshot(inserted),
        });

        return inserted;
      });
    } catch (error) {
      const dbError = extractDatabaseErrorDetails(error);
      if (dbError.code === PG_ERROR_CODE.UNIQUE_VIOLATION) {
        throw new ConflictException({
          code: API_ERROR_CODES.AUTH_EMAIL_ALREADY_EXISTS,
          detail: MESSAGES.AUTH.EMAIL_ALREADY_EXISTS,
        });
      }
      throw error;
    }

    // Best-effort mail dispatch: DB commit is authoritative and token is resendable via reset-credentials.
    try {
      await this.mailService.sendStaffInvitationEmail(
        created.email,
        created.fullName,
        creds.rawToken,
      );
    } catch (error) {
      this.logger.error(
        `Failed to enqueue staff invitation email for user "${created.id}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return this.toStaffMember(created);
  }

  /**
   * Atomically updates a staff member's profile, role, and/or status with RBAC,
   * last-super-admin concurrency protection, audit logging, and session revocation.
   *
   * @param actor Authenticated `admin` or `super_admin` JWT claims.
   * @param targetId Target staff user UUIDv7.
   * @param patch Validated partial update payload.
   * @returns Updated staff projection.
   */
  async updateStaff(
    actor: JwtPayload,
    targetId: string,
    patch: UpdateStaffInput,
  ): Promise<StaffMember> {
    const mutatesRoleOrStatus =
      patch.role !== undefined || patch.status !== undefined;

    if (actor.role === UserRole.ADMIN && mutatesRoleOrStatus) {
      throw new ForbiddenException({
        code: API_ERROR_CODES.FORBIDDEN,
        detail: MESSAGES.COMMON.FORBIDDEN,
      });
    }

    if (patch.role !== undefined) {
      this.assertValidStaffRole(patch.role);
    }

    if (actor.sub === targetId && mutatesRoleOrStatus) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.SELF_MODIFICATION_FORBIDDEN,
        detail: MESSAGES.STAFF.SELF_MODIFICATION_FORBIDDEN,
      });
    }

    const mayReduceSuperAdmins =
      (patch.role !== undefined && patch.role !== UserRole.SUPER_ADMIN) ||
      (patch.status !== undefined && patch.status !== UserStatus.ACTIVE);

    const outcome = await this.db.transaction(async (tx) => {
      // Lock active super-admin rows in deterministic ID order before locking target (INV-STAFF-1).
      const activeSuperAdmins = mayReduceSuperAdmins
        ? await tx
            .select({ id: users.id })
            .from(users)
            .where(
              and(
                eq(users.role, UserRole.SUPER_ADMIN),
                eq(users.status, UserStatus.ACTIVE),
                isNull(users.deletedAt),
              ),
            )
            .orderBy(asc(users.id))
            .for("update")
        : [];

      const target = await this.lockStaffTarget(tx, targetId);

      const nextRole = patch.role ?? target.role;
      const nextStatus = patch.status ?? target.status;

      if (
        mayReduceSuperAdmins &&
        target.role === UserRole.SUPER_ADMIN &&
        target.status === UserStatus.ACTIVE &&
        (nextRole !== UserRole.SUPER_ADMIN ||
          nextStatus !== UserStatus.ACTIVE) &&
        activeSuperAdmins.length <= 1
      ) {
        throw new UnprocessableEntityException({
          code: API_ERROR_CODES.LAST_SUPER_ADMIN,
          detail: MESSAGES.STAFF.LAST_SUPER_ADMIN,
        });
      }

      const profilePatch: { fullName?: string; phone?: string | null } = {};
      if (patch.fullName !== undefined && patch.fullName !== target.fullName) {
        profilePatch.fullName = patch.fullName;
      }
      if (patch.phone !== undefined && patch.phone !== target.phone) {
        profilePatch.phone = patch.phone;
      }

      const profileChanged = Object.keys(profilePatch).length > 0;
      const roleChanged =
        patch.role !== undefined && patch.role !== target.role;
      const statusChanged =
        patch.status !== undefined && patch.status !== target.status;

      if (!profileChanged && !roleChanged && !statusChanged) {
        return {
          staff: this.toStaffMember(target),
          shouldRevokeSession: false,
        };
      }

      const before = this.auditService.toSnapshot(target);
      let updatedRow: StaffUserRow = target;

      if (profileChanged) {
        const [profileUpdated] =
          await this.profileService.updateStaffProfileWithinTx(
            tx,
            targetId,
            profilePatch,
          );
        if (profileUpdated) {
          updatedRow = profileUpdated;
        }
      }

      if (roleChanged || statusChanged) {
        const governanceValues: { role?: UserRole; status?: UserStatus } = {};
        if (roleChanged) governanceValues.role = nextRole;
        if (statusChanged) governanceValues.status = nextStatus;

        const [governanceUpdated] = await tx
          .update(users)
          .set(governanceValues)
          .where(and(eq(users.id, targetId), isNull(users.deletedAt)))
          .returning(STAFF_USER_COLUMNS);

        if (governanceUpdated) {
          updatedRow = governanceUpdated;
        }
      }

      const action = this.resolveUpdateAuditAction(
        profileChanged,
        roleChanged,
        statusChanged,
      );

      await this.auditService.recordStaffAudit(tx, {
        actorId: actor.sub,
        targetUserId: targetId,
        action,
        before,
        after: this.auditService.toSnapshot(updatedRow),
      });

      const shouldRevokeSession =
        roleChanged ||
        (statusChanged &&
          (nextStatus === UserStatus.SUSPENDED ||
            nextStatus === UserStatus.INACTIVE));

      if (shouldRevokeSession) {
        await tx
          .delete(refreshTokens)
          .where(eq(refreshTokens.userId, targetId));
      }

      return {
        staff: this.toStaffMember(updatedRow),
        shouldRevokeSession,
      };
    });

    if (outcome.shouldRevokeSession) {
      await this.redisService.revokeUser(targetId, AUTH_REVOCATION_TTL_SECONDS);
    }

    return outcome.staff;
  }

  /**
   * Issues a fresh 24h reset token for an active staff member, revokes sessions,
   * records an audit log row, and dispatches a Backoffice reset email.
   *
   * @param actorId Authenticated `super_admin` subject ID.
   * @param targetId Target active staff user UUIDv7.
   */
  async resetCredentials(actorId: string, targetId: string): Promise<void> {
    if (actorId === targetId) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.SELF_MODIFICATION_FORBIDDEN,
        detail: MESSAGES.STAFF.SELF_MODIFICATION_FORBIDDEN,
      });
    }

    const tokenPair = this.authService.generateStaffResetToken();

    const target = await this.db.transaction(async (tx) => {
      const row = await this.lockStaffTarget(tx, targetId);

      if (row.status !== UserStatus.ACTIVE) {
        throw new UnprocessableEntityException({
          code: API_ERROR_CODES.UNPROCESSABLE_ENTITY,
          detail: MESSAGES.STAFF.CANNOT_RESET_INACTIVE_ACCOUNT,
        });
      }

      await this.authService.issueStaffResetToken(
        tx,
        targetId,
        tokenPair.tokenHash,
        tokenPair.expiresAt,
      );

      await tx.delete(refreshTokens).where(eq(refreshTokens.userId, targetId));

      const snapshot = this.auditService.toSnapshot(row);
      await this.auditService.recordStaffAudit(tx, {
        actorId,
        targetUserId: targetId,
        action: StaffAuditAction.RESET_CREDENTIALS,
        before: snapshot,
        after: snapshot,
      });

      return row;
    });

    await this.redisService.revokeUser(targetId, AUTH_REVOCATION_TTL_SECONDS);
    await this.mailService.sendStaffCredentialResetEmail(
      target.email,
      target.fullName,
      tokenPair.rawToken,
    );
  }
}
