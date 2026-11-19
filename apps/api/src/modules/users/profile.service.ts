import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { API_ERROR_CODES } from "@greenroots/shared";
import { MESSAGES } from "@/common/constants/messages.constant";
import {
  DATABASE_CONNECTION,
  type DrizzleDB,
  type DrizzleTx,
} from "@/database/database.module";
import { users, type User } from "@/database/schemas";
import type { UpdateProfileInput, UserProfile } from "./dto";

/**
 * Closed Drizzle column projection for self-service user profiles.
 * Excludes credentials, verification/reset tokens, and soft-delete state per ADR-0020.
 */
export const PROFILE_COLUMNS = {
  id: users.id,
  email: users.email,
  fullName: users.fullName,
  phone: users.phone,
  role: users.role,
  status: users.status,
  rewardPoints: users.rewardPoints,
  emailVerified: users.emailVerified,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
} as const;

const { rewardPoints: _rewardPoints, ...STAFF_PROFILE_COLUMNS } =
  PROFILE_COLUMNS;

type ProfileRow = Pick<User, keyof typeof PROFILE_COLUMNS>;
type StaffProfileRow = Pick<User, keyof typeof STAFF_PROFILE_COLUMNS>;

@Injectable()
export class ProfileService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DrizzleDB,
  ) {}

  private toUserProfile(row: ProfileRow): UserProfile {
    return {
      id: row.id,
      email: row.email,
      fullName: row.fullName,
      phone: row.phone,
      role: row.role,
      status: row.status,
      rewardPoints: row.rewardPoints,
      emailVerified: row.emailVerified,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /**
   * Returns the closed profile projection for an active, non-deleted subject.
   */
  async getProfile(sub: string): Promise<UserProfile> {
    const [row] = await this.db
      .select(PROFILE_COLUMNS)
      .from(users)
      .where(and(eq(users.id, sub), isNull(users.deletedAt)))
      .limit(1);

    if (!row) {
      throw new UnauthorizedException({
        code: API_ERROR_CODES.AUTH_TOKEN_INVALID_OR_EXPIRED,
        detail: MESSAGES.AUTH.TOKEN_INVALID_OR_EXPIRED,
      });
    }

    return this.toUserProfile(row);
  }

  private buildPatchValues(
    patch: Partial<UpdateProfileInput>,
  ): Partial<UpdateProfileInput> {
    const values: Partial<UpdateProfileInput> = {};
    if (patch.fullName !== undefined) {
      values.fullName = patch.fullName;
    }
    if (patch.phone !== undefined) {
      values.phone = patch.phone;
    }
    return values;
  }

  /**
   * Atomically updates self-editable profile fields (`fullName`, `phone`) in a single statement.
   */
  async updateProfile(
    sub: string,
    patch: UpdateProfileInput,
  ): Promise<UserProfile> {
    const [updated] = await this.updateProfileWithinTx(this.db, sub, patch);

    if (!updated) {
      throw new UnauthorizedException({
        code: API_ERROR_CODES.AUTH_TOKEN_INVALID_OR_EXPIRED,
        detail: MESSAGES.AUTH.TOKEN_INVALID_OR_EXPIRED,
      });
    }

    return this.toUserProfile(updated);
  }

  private async applyProfileUpdate<
    TCols extends typeof PROFILE_COLUMNS | typeof STAFF_PROFILE_COLUMNS,
  >(
    executor: DrizzleDB | DrizzleTx,
    userId: string,
    patch: Partial<UpdateProfileInput>,
    columns: TCols,
  ) {
    const values = this.buildPatchValues(patch);
    if (Object.keys(values).length === 0) {
      return [];
    }

    return executor
      .update(users)
      .set(values)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .returning(columns);
  }

  /**
   * Transaction-scoped helper for updating `fullName`/`phone` without `rewardPoints` per ADR-0020.
   *
   * @param executor Active database client or transaction.
   * @param userId Target user UUID.
   * @param patch Partial profile fields (`fullName`, `phone`).
   * @returns Updated rows projected without `rewardPoints`.
   */
  async updateStaffProfileWithinTx(
    executor: DrizzleDB | DrizzleTx,
    userId: string,
    patch: Partial<UpdateProfileInput>,
  ): Promise<StaffProfileRow[]> {
    return this.applyProfileUpdate(
      executor,
      userId,
      patch,
      STAFF_PROFILE_COLUMNS,
    ) as Promise<StaffProfileRow[]>;
  }

  /**
   * Transaction-scoped helper for updating `fullName`/`phone` with full `PROFILE_COLUMNS`.
   *
   * @param executor Active database client or transaction.
   * @param userId Target user UUID.
   * @param patch Partial profile fields (`fullName`, `phone`).
   * @returns Updated rows projected with `PROFILE_COLUMNS`.
   */
  async updateProfileWithinTx(
    executor: DrizzleDB | DrizzleTx,
    userId: string,
    patch: Partial<UpdateProfileInput>,
  ): Promise<ProfileRow[]> {
    return this.applyProfileUpdate(
      executor,
      userId,
      patch,
      PROFILE_COLUMNS,
    ) as Promise<ProfileRow[]>;
  }
}
