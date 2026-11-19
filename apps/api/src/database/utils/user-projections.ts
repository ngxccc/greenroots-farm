import type { User } from "@/database/schemas/user.schema";
import { users } from "@/database/schemas/user.schema";

/**
 * Closed Drizzle column projection for self-service customer profile responses.
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

/**
 * Closed Drizzle column projection for staff identity, profile, and directory responses.
 * Excludes credentials, verification/reset tokens, soft-delete state, and loyalty points.
 */
export const { rewardPoints: _rewardPoints, ...STAFF_USER_COLUMNS } =
  PROFILE_COLUMNS;

export type ProfileRow = Pick<User, keyof typeof PROFILE_COLUMNS>;
export type StaffUserRow = Pick<User, keyof typeof STAFF_USER_COLUMNS>;
