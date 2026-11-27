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
  clearSession: () => void;
}

/**
 * In-memory Zustand store holding the active staff access token and user profile.
 * Refresh tokens are managed exclusively via HttpOnly cookies by apps/api (ADR-0051).
 */
export const useAuthStore = create<AuthState>()((set) => ({
  accessToken: null,
  user: null,
  setSession: (accessToken, user) => set({ accessToken, user }),
  clearSession: () => set({ accessToken: null, user: null }),
}));

/**
 * Resolves the default landing route for an authenticated internal staff role.
 */
export function getDefaultRouteForRole(role: UserRole): string {
  if (role === "farm_staff") return "/farming/logs";
  return "/orders";
}
