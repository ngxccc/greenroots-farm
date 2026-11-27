import { beforeEach, describe, expect, it } from "bun:test";
import { getDefaultRouteForRole, useAuthStore } from "./auth.store";

describe("useAuthStore", () => {
  beforeEach(() => {
    useAuthStore.getState().clearSession();
  });

  it("stores in-memory session and clears it on clearSession", () => {
    // Invariant: INV-5
    useAuthStore.getState().setSession("jwt-access-token", {
      id: "0195a8f0-0001-7000-8000-000000000011",
      fullName: "Kỹ sư Lê Văn Canh Tác",
      email: "farm@greenroots.vn",
      role: "farm_staff",
    });

    expect(useAuthStore.getState().user?.role).toBe("farm_staff");
    expect(useAuthStore.getState().accessToken).toBe("jwt-access-token");

    useAuthStore.getState().clearSession();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it("omits demo role bypass methods from store state", () => {
    // Invariant: INV-5
    const state = useAuthStore.getState() as unknown as Record<string, unknown>;
    expect(state.loginDemoRole).toBeUndefined();
  });

  it("routes farm_staff to mobile farming logs and desk roles to orders", () => {
    expect(getDefaultRouteForRole("farm_staff")).toBe("/farming/logs");
    expect(getDefaultRouteForRole("sales")).toBe("/orders");
    expect(getDefaultRouteForRole("admin")).toBe("/orders");
    expect(getDefaultRouteForRole("super_admin")).toBe("/orders");
  });
});
