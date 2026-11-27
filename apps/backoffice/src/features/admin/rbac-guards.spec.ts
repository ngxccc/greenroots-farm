import { describe, expect, it } from "bun:test";
import {
  countActiveSuperAdmins,
  evaluateResetCredentialsGuard,
  evaluateStaffRoleChangeGuard,
  evaluateStaffStatusChangeGuard,
  parseAdminRbacTab,
} from "./rbac-guards";

const ACTOR_ID = "0195a8f0-0001-7000-8000-000000000001";
const OTHER_SUPER_ADMIN_ID = "0195a8f0-0001-7000-8000-000000000002";
const OTHER_STAFF_ID = "0195a8f0-0001-7000-8000-000000000003";

describe("rbac-guards", () => {
  describe("parseAdminRbacTab", () => {
    it("returns farm when search param equals farm and defaults to staff otherwise", () => {
      expect(parseAdminRbacTab("farm")).toBe("farm");
      expect(parseAdminRbacTab("staff")).toBe("staff");
      expect(parseAdminRbacTab(undefined)).toBe("staff");
      expect(parseAdminRbacTab("invalid")).toBe("staff");
    });
  });

  describe("countActiveSuperAdmins", () => {
    it("counts only super_admin accounts with active status", () => {
      const count = countActiveSuperAdmins([
        { role: "super_admin", status: "active" },
        { role: "super_admin", status: "suspended" },
        { role: "super_admin", status: "inactive" },
        { role: "admin", status: "active" },
        { role: "super_admin", status: "active" },
      ]);

      expect(count).toBe(2);
    });
  });

  describe("evaluateStaffRoleChangeGuard", () => {
    it("blocks self-demotion when actor attempts to change their own role", () => {
      // Invariant: INV-STAFF-2
      const result = evaluateStaffRoleChangeGuard({
        actorId: ACTOR_ID,
        target: { id: ACTOR_ID, role: "super_admin", status: "active" },
        nextRole: "admin",
        activeSuperAdminCount: 2,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBeTruthy();
    });

    it("blocks demoting the last active super_admin", () => {
      // Invariant: INV-STAFF-1
      const result = evaluateStaffRoleChangeGuard({
        actorId: ACTOR_ID,
        target: {
          id: OTHER_SUPER_ADMIN_ID,
          role: "super_admin",
          status: "active",
        },
        nextRole: "admin",
        activeSuperAdminCount: 1,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBeTruthy();
    });

    it("allows demoting a super_admin when another active super_admin exists", () => {
      // Invariant: INV-STAFF-1
      const result = evaluateStaffRoleChangeGuard({
        actorId: ACTOR_ID,
        target: {
          id: OTHER_SUPER_ADMIN_ID,
          role: "super_admin",
          status: "active",
        },
        nextRole: "admin",
        activeSuperAdminCount: 2,
      });

      expect(result).toEqual({ allowed: true, reason: null });
    });

    it("allows promoting a non-super_admin staff member", () => {
      const result = evaluateStaffRoleChangeGuard({
        actorId: ACTOR_ID,
        target: { id: OTHER_STAFF_ID, role: "sales", status: "active" },
        nextRole: "admin",
        activeSuperAdminCount: 1,
      });

      expect(result).toEqual({ allowed: true, reason: null });
    });
  });

  describe("evaluateStaffStatusChangeGuard", () => {
    it("blocks self-suspension when actor attempts to suspend their own account", () => {
      // Invariant: INV-STAFF-2
      const result = evaluateStaffStatusChangeGuard({
        actorId: ACTOR_ID,
        target: { id: ACTOR_ID, role: "super_admin", status: "active" },
        nextStatus: "suspended",
        activeSuperAdminCount: 2,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBeTruthy();
    });

    it("blocks suspending or deactivating the last active super_admin", () => {
      // Invariant: INV-STAFF-1
      const suspendResult = evaluateStaffStatusChangeGuard({
        actorId: ACTOR_ID,
        target: {
          id: OTHER_SUPER_ADMIN_ID,
          role: "super_admin",
          status: "active",
        },
        nextStatus: "suspended",
        activeSuperAdminCount: 1,
      });
      const inactiveResult = evaluateStaffStatusChangeGuard({
        actorId: ACTOR_ID,
        target: {
          id: OTHER_SUPER_ADMIN_ID,
          role: "super_admin",
          status: "active",
        },
        nextStatus: "inactive",
        activeSuperAdminCount: 1,
      });

      expect(suspendResult.allowed).toBe(false);
      expect(inactiveResult.allowed).toBe(false);
    });

    it("allows suspending another staff member when last-super-admin invariant holds", () => {
      // Invariant: INV-STAFF-1
      const result = evaluateStaffStatusChangeGuard({
        actorId: ACTOR_ID,
        target: { id: OTHER_STAFF_ID, role: "farm_staff", status: "active" },
        nextStatus: "suspended",
        activeSuperAdminCount: 1,
      });

      expect(result).toEqual({ allowed: true, reason: null });
    });
  });

  describe("evaluateResetCredentialsGuard", () => {
    it("blocks self credential reset", () => {
      // Invariant: INV-STAFF-2
      const result = evaluateResetCredentialsGuard({
        actorId: ACTOR_ID,
        target: { id: ACTOR_ID, status: "active" },
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBeTruthy();
    });

    it("blocks credential reset for suspended or inactive accounts", () => {
      const result = evaluateResetCredentialsGuard({
        actorId: ACTOR_ID,
        target: { id: OTHER_STAFF_ID, status: "suspended" },
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBeTruthy();
    });

    it("allows credential reset for another active staff account", () => {
      const result = evaluateResetCredentialsGuard({
        actorId: ACTOR_ID,
        target: { id: OTHER_STAFF_ID, status: "active" },
      });

      expect(result).toEqual({ allowed: true, reason: null });
    });
  });
});
