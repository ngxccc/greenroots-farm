import type { UserRole } from "@greenroots/shared";
import { create } from "zustand";

export interface BackofficeUser {
  readonly id: string;
  readonly fullName: string;
  readonly email: string;
  readonly role: UserRole;
}

interface AuthState {
  accessToken: string | null;
  user: BackofficeUser | null;
  setSession: (accessToken: string, user: BackofficeUser) => void;
  loginDemoRole: (role: UserRole) => void;
  logout: () => void;
}

const DEMO_USERS: Record<
  Exclude<UserRole, "guest" | "customer">,
  BackofficeUser
> = {
  farm_staff: {
    id: "0195a8f0-0001-7000-8000-000000000011",
    fullName: "Kỹ sư Lê Văn Canh Tác",
    email: "farm@greenroots.vn",
    role: "farm_staff",
  },
  sales: {
    id: "0195a8f0-0001-7000-8000-000000000012",
    fullName: "Điều phối Nguyễn Minh Đơn",
    email: "sales@greenroots.vn",
    role: "sales",
  },
  admin: {
    id: "0195a8f0-0001-7000-8000-000000000013",
    fullName: "Quản trị Trần Vận Hành",
    email: "admin@greenroots.vn",
    role: "admin",
  },
  super_admin: {
    id: "0195a8f0-0001-7000-8000-000000000014",
    fullName: "SuperAdmin Nguyễn Hệ Thống",
    email: "root@greenroots.vn",
    role: "super_admin",
  },
};

export const useAuthStore = create<AuthState>()((set) => ({
  accessToken: null,
  user: null,
  setSession: (accessToken, user) => set({ accessToken, user }),
  loginDemoRole: (role) => {
    if (role === "guest" || role === "customer") return;
    set({
      accessToken: `demo-jwt-${role}`,
      user: DEMO_USERS[role],
    });
  },
  logout: () => set({ accessToken: null, user: null }),
}));

export function getDefaultRouteForRole(role: UserRole): string {
  if (role === "farm_staff") return "/farming/logs";
  return "/orders";
}
