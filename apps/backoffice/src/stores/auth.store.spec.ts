import { beforeEach, describe, expect, it } from "bun:test";
import { getDefaultRouteForRole, useAuthStore } from "./auth.store";

describe("useAuthStore", () => {
  beforeEach(() => {
    useAuthStore.getState().logout();
  });

  it("logs in a demo internal role and clears on logout", () => {
    useAuthStore.getState().loginDemoRole("farm_staff");
    expect(useAuthStore.getState().user?.role).toBe("farm_staff");
    expect(useAuthStore.getState().accessToken).toBe("demo-jwt-farm_staff");

    useAuthStore.getState().logout();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it("ignores non-internal roles", () => {
    useAuthStore.getState().loginDemoRole("customer");
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("routes farm_staff to mobile farming logs and desk roles to orders", () => {
    expect(getDefaultRouteForRole("farm_staff")).toBe("/farming/logs");
    expect(getDefaultRouteForRole("sales")).toBe("/orders");
    expect(getDefaultRouteForRole("admin")).toBe("/orders");
    expect(getDefaultRouteForRole("super_admin")).toBe("/orders");
  });
});
