import {
  STAFF_ROLES,
  type StaffRole,
  type UserStatus,
} from "@greenroots/shared";
import type { components } from "@/types/api-schema";

type StaffMemberDto = components["schemas"]["StaffMemberDto"];

/**
 * Supported URL tab values for the BO-10 Admin & Farm Settings route.
 */
export type AdminRbacTab = "staff" | "farm";

/**
 * Parses an unknown URL search param into a valid BO-10 tab, defaulting to `"staff"`.
 *
 * @param value Raw `tab` search parameter value.
 * @returns Normalized tab identifier (`"staff"` or `"farm"`).
 */
export function parseAdminRbacTab(value: unknown): AdminRbacTab {
  return value === "farm" ? "farm" : "staff";
}

/**
 * Vietnamese display labels for internal staff roles managed in BO-10.
 */
export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  farm_staff: "Nhân viên nông trại",
  sales: "Nhân viên bán hàng",
  admin: "Quản trị viên",
  super_admin: "Quản trị cấp cao",
};

/**
 * Vietnamese display labels for staff account statuses.
 */
export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  active: "Đang hoạt động",
  inactive: "Ngừng kích hoạt",
  suspended: "Đã khóa",
};

/**
 * Ordered list of internal staff roles selectable in BO-10 forms.
 */
export const SELECTABLE_STAFF_ROLES: readonly StaffRole[] = STAFF_ROLES;

/**
 * Result of evaluating an ADR-0019 UI guard for a staff mutation.
 */
export interface StaffGuardResult {
  readonly allowed: boolean;
  readonly reason: string | null;
}

/**
 * Counts active `super_admin` accounts in a staff collection.
 *
 * @param staffList Staff records to inspect.
 * @returns Number of staff accounts with `role === "super_admin"` and `status === "active"`.
 */
export function countActiveSuperAdmins(
  staffList: readonly Pick<StaffMemberDto, "role" | "status">[],
): number {
  return staffList.filter(
    (member) => member.role === "super_admin" && member.status === "active",
  ).length;
}

/**
 * Evaluates whether the acting `super_admin` may change the target staff member's role
 * under ADR-0019 (`INV-STAFF-1` last-super-admin and `INV-STAFF-2` self-modification).
 *
 * @param params Guard evaluation inputs.
 * @returns Guard decision with localized Vietnamese explanation when blocked.
 */
export function evaluateStaffRoleChangeGuard(params: {
  readonly actorId: string;
  readonly target: Pick<StaffMemberDto, "id" | "role" | "status">;
  readonly nextRole: StaffRole;
  readonly activeSuperAdminCount: number;
}): StaffGuardResult {
  const { actorId, target, nextRole, activeSuperAdminCount } = params;

  if (actorId === target.id && nextRole !== target.role) {
    return {
      allowed: false,
      reason: "Không thể tự thay đổi vai trò của chính mình.",
    };
  }

  const isLastActiveSuperAdmin =
    target.role === "super_admin" &&
    target.status === "active" &&
    activeSuperAdminCount <= 1;

  if (isLastActiveSuperAdmin && nextRole !== "super_admin") {
    return {
      allowed: false,
      reason:
        "Không thể hạ quyền Super Admin đang hoạt động cuối cùng của hệ thống.",
    };
  }

  return { allowed: true, reason: null };
}

/**
 * Evaluates whether the acting `super_admin` may change the target staff member's status
 * under ADR-0019 (`INV-STAFF-1` last-super-admin and `INV-STAFF-2` self-modification).
 *
 * @param params Guard evaluation inputs.
 * @returns Guard decision with localized Vietnamese explanation when blocked.
 */
export function evaluateStaffStatusChangeGuard(params: {
  readonly actorId: string;
  readonly target: Pick<StaffMemberDto, "id" | "role" | "status">;
  readonly nextStatus: UserStatus;
  readonly activeSuperAdminCount: number;
}): StaffGuardResult {
  const { actorId, target, nextStatus, activeSuperAdminCount } = params;

  if (actorId === target.id && nextStatus !== target.status) {
    return {
      allowed: false,
      reason: "Không thể tự khóa hoặc vô hiệu hóa tài khoản của chính mình.",
    };
  }

  const isLastActiveSuperAdmin =
    target.role === "super_admin" &&
    target.status === "active" &&
    activeSuperAdminCount <= 1;

  if (isLastActiveSuperAdmin && nextStatus !== "active") {
    return {
      allowed: false,
      reason:
        "Không thể khóa hoặc vô hiệu hóa Super Admin đang hoạt động cuối cùng.",
    };
  }

  return { allowed: true, reason: null };
}

/**
 * Evaluates whether the acting `super_admin` may trigger a credential reset
 * for the target staff member under ADR-0019 (`INV-STAFF-2` and active-only boundary).
 *
 * @param params Guard evaluation inputs.
 * @returns Guard decision with localized Vietnamese explanation when blocked.
 */
export function evaluateResetCredentialsGuard(params: {
  readonly actorId: string;
  readonly target: Pick<StaffMemberDto, "id" | "status">;
}): StaffGuardResult {
  const { actorId, target } = params;

  if (actorId === target.id) {
    return {
      allowed: false,
      reason: "Không thể tự đặt lại thông tin đăng nhập cho chính mình.",
    };
  }

  if (target.status !== "active") {
    return {
      allowed: false,
      reason: "Chỉ có thể đặt lại mật khẩu cho tài khoản đang hoạt động.",
    };
  }

  return { allowed: true, reason: null };
}
