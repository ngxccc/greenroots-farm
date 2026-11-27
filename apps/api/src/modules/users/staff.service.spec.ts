import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  API_ERROR_CODES,
  StaffAuditAction,
  UserRole,
  UserStatus,
} from "@greenroots/shared";
import type { JwtPayload } from "@/common/decorators/current-user.decorator";
import type { RedisService } from "@/common/services/redis.service";
import type { AuthService } from "@/modules/auth/auth.service";
import type { MailService } from "@/modules/mail/mail.service";
import { createMockDb } from "../../../test/mocks/mock-database";
import { AuditService } from "./audit.service";
import type { ProfileService } from "./profile.service";
import { StaffService } from "./staff.service";

type MockDb = ReturnType<typeof createMockDb> & {
  mockInsertValues: ReturnType<typeof mock>;
  setSelectResult: (result: unknown[]) => void;
  setSelectResultsQueue: (results: unknown[][]) => void;
  clearAll: () => void;
};

describe("StaffService", () => {
  let service: StaffService;
  let mockDb: MockDb;

  const actor: JwtPayload = {
    sub: "019fa8bc-8f4d-7000-b366-e691f45cfb01",
    email: "superadmin@greenroots.farm",
    role: UserRole.SUPER_ADMIN,
    jti: "jti-1",
    sid: "sid-1",
  };

  const targetId = "019fa8bc-8f4d-7000-b366-e691f45cfb02";
  const baseDate = new Date("2026-11-19T00:00:00.000Z");

  const sampleStaffRow = {
    id: targetId,
    email: "staff@greenroots.farm",
    fullName: "Pham Minh Staff",
    phone: "0912345678",
    role: UserRole.FARM_STAFF,
    status: UserStatus.ACTIVE,
    emailVerified: true,
    createdAt: baseDate,
    updatedAt: baseDate,
  };

  const mockAuthService = {
    prepareStaffCredentials: mock(() =>
      Promise.resolve({
        unusablePasswordHash: "s1$salt$hash",
        rawToken: "raw-invite-token",
        tokenHash: "hashed-invite-token",
        expiresAt: new Date(Date.now() + 86_400_000),
      }),
    ),
    generateStaffResetToken: mock(() => ({
      rawToken: "raw-reset-token",
      tokenHash: "hashed-reset-token",
      expiresAt: new Date(Date.now() + 86_400_000),
    })),
    createStaffIdentity: mock(() => Promise.resolve(sampleStaffRow)),
    issueStaffResetToken: mock(() => Promise.resolve()),
    clearAll() {
      this.prepareStaffCredentials.mockClear();
      this.generateStaffResetToken.mockClear();
      this.createStaffIdentity.mockClear();
      this.issueStaffResetToken.mockClear();
    },
  };

  const mockProfileService = {
    updateStaffProfileWithinTx: mock(() => Promise.resolve([sampleStaffRow])),
  };

  const mockRedisService = {
    revokeUser: mock(() => Promise.resolve()),
  };

  const mockMailService = {
    sendStaffInvitationEmail: mock(() => Promise.resolve()),
    sendStaffCredentialResetEmail: mock(() => Promise.resolve()),
  };

  const auditService = new AuditService();

  beforeEach(() => {
    mockDb = createMockDb() as unknown as MockDb;
    mockAuthService.clearAll();
    mockProfileService.updateStaffProfileWithinTx.mockClear();
    mockRedisService.revokeUser.mockClear();
    mockMailService.sendStaffInvitationEmail.mockReset();
    mockMailService.sendStaffInvitationEmail.mockImplementation(() =>
      Promise.resolve(),
    );
    mockMailService.sendStaffCredentialResetEmail.mockReset();
    mockMailService.sendStaffCredentialResetEmail.mockImplementation(() =>
      Promise.resolve(),
    );

    service = new StaffService(
      mockDb,
      mockAuthService as unknown as AuthService,
      mockProfileService as unknown as ProfileService,
      auditService,
      mockRedisService as unknown as RedisService,
      mockMailService as unknown as MailService,
    );
  });

  describe("createStaff", () => {
    it("rejects customer and guest roles", async () => {
      for (const role of [UserRole.CUSTOMER, UserRole.GUEST]) {
        try {
          await service.createStaff(actor.sub, {
            email: "bad@greenroots.farm",
            fullName: "Invalid Role",
            role,
          });
          expect.unreachable("Expected UnprocessableEntityException");
        } catch (error) {
          expect(error).toBeInstanceOf(UnprocessableEntityException);
          expect((error as UnprocessableEntityException).getResponse()).toEqual(
            expect.objectContaining({
              code: API_ERROR_CODES.STAFF_ROLE_INVALID,
            }),
          );
        }
      }
      expect(mockAuthService.prepareStaffCredentials).not.toHaveBeenCalled();
    });

    it("returns the created staff projection even when mail enqueue fails after commit", async () => {
      mockDb.setSelectResult([]);
      mockMailService.sendStaffInvitationEmail.mockImplementation(() =>
        Promise.reject(new Error("Redis unavailable")),
      );

      const created = await service.createStaff(actor.sub, {
        email: "staff@greenroots.farm",
        fullName: "Pham Minh Staff",
        phone: "0912345678",
        role: UserRole.FARM_STAFF,
      });

      expect(created.id).toBe(sampleStaffRow.id);
      expect(created).not.toHaveProperty("password");
      expect(mockMailService.sendStaffInvitationEmail).toHaveBeenCalledTimes(1);
    });
  });

  describe("updateStaff", () => {
    it("forbids admin from modifying role or status", async () => {
      const adminActor: JwtPayload = { ...actor, role: UserRole.ADMIN };
      try {
        await service.updateStaff(adminActor, targetId, {
          role: UserRole.SALES,
        });
        expect.unreachable("Expected ForbiddenException");
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
      }
    });

    it("forbids actors from modifying their own role or status", async () => {
      try {
        await service.updateStaff(actor, actor.sub, {
          status: UserStatus.SUSPENDED,
        });
        expect.unreachable("Expected UnprocessableEntityException");
      } catch (error) {
        expect(error).toBeInstanceOf(UnprocessableEntityException);
        expect((error as UnprocessableEntityException).getResponse()).toEqual(
          expect.objectContaining({
            code: API_ERROR_CODES.SELF_MODIFICATION_FORBIDDEN,
          }),
        );
      }
    });

    it("short-circuits no-op updates without writing audit rows or revoking sessions", async () => {
      mockDb.setSelectResultsQueue([[], [sampleStaffRow]]);

      const result = await service.updateStaff(actor, targetId, {
        fullName: sampleStaffRow.fullName,
        phone: sampleStaffRow.phone,
        role: sampleStaffRow.role,
        status: sampleStaffRow.status,
      });

      expect(result.id).toBe(targetId);
      expect(
        mockProfileService.updateStaffProfileWithinTx,
      ).not.toHaveBeenCalled();
      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(mockRedisService.revokeUser).not.toHaveBeenCalled();
    });

    it("rejects demoting the last active super_admin", async () => {
      const superAdminRow = { ...sampleStaffRow, role: UserRole.SUPER_ADMIN };
      mockDb.setSelectResultsQueue([[{ id: targetId }], [superAdminRow]]);

      try {
        await service.updateStaff(actor, targetId, { role: UserRole.ADMIN });
        expect.unreachable("Expected UnprocessableEntityException");
      } catch (error) {
        expect(error).toBeInstanceOf(UnprocessableEntityException);
        expect((error as UnprocessableEntityException).getResponse()).toEqual(
          expect.objectContaining({
            code: API_ERROR_CODES.LAST_SUPER_ADMIN,
          }),
        );
      }
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it("revokes sessions and records before/after snapshots when role changes", async () => {
      const updatedRow = { ...sampleStaffRow, role: UserRole.SALES };
      mockDb.setSelectResultsQueue([[], [sampleStaffRow], [updatedRow]]);

      const result = await service.updateStaff(actor, targetId, {
        role: UserRole.SALES,
      });

      expect(result.role).toBe(UserRole.SALES);
      expect(mockDb.delete).toHaveBeenCalled();
      expect(mockRedisService.revokeUser).toHaveBeenCalledWith(targetId, 900);
      expect(mockDb.mockInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          action: StaffAuditAction.CHANGE_ROLE,
          before: {
            email: sampleStaffRow.email,
            fullName: sampleStaffRow.fullName,
            phone: sampleStaffRow.phone,
            role: UserRole.FARM_STAFF,
            status: UserStatus.ACTIVE,
          },
          after: {
            email: sampleStaffRow.email,
            fullName: sampleStaffRow.fullName,
            phone: sampleStaffRow.phone,
            role: UserRole.SALES,
            status: UserStatus.ACTIVE,
          },
        }),
      );
    });

    it("revokes sessions on suspend/deactivate while skipping revocation on reactivation or profile-only edit", async () => {
      for (const nextStatus of [UserStatus.SUSPENDED, UserStatus.INACTIVE]) {
        mockDb.clearAll();
        mockRedisService.revokeUser.mockClear();
        const updated = { ...sampleStaffRow, status: nextStatus };
        mockDb.setSelectResultsQueue([[], [sampleStaffRow], [updated]]);

        await service.updateStaff(actor, targetId, { status: nextStatus });

        expect(mockDb.delete).toHaveBeenCalledTimes(1);
        expect(mockRedisService.revokeUser).toHaveBeenCalledWith(targetId, 900);
      }

      mockDb.clearAll();
      mockRedisService.revokeUser.mockClear();
      const suspendedRow = { ...sampleStaffRow, status: UserStatus.SUSPENDED };
      mockDb.setSelectResultsQueue([[suspendedRow], [sampleStaffRow]]);

      await service.updateStaff(actor, targetId, {
        status: UserStatus.ACTIVE,
      });
      expect(mockDb.delete).not.toHaveBeenCalled();
      expect(mockRedisService.revokeUser).not.toHaveBeenCalled();

      mockDb.clearAll();
      mockRedisService.revokeUser.mockClear();
      const renamedRow = { ...sampleStaffRow, fullName: "Renamed Only" };
      mockProfileService.updateStaffProfileWithinTx.mockResolvedValueOnce([
        renamedRow,
      ]);
      mockDb.setSelectResultsQueue([[sampleStaffRow]]);

      await service.updateStaff(actor, targetId, { fullName: "Renamed Only" });
      expect(mockDb.delete).not.toHaveBeenCalled();
      expect(mockRedisService.revokeUser).not.toHaveBeenCalled();
    });

    it("records combined update action when both profile and governance change", async () => {
      const profileUpdated = { ...sampleStaffRow, fullName: "New Name" };
      const governanceUpdated = { ...profileUpdated, role: UserRole.ADMIN };
      mockProfileService.updateStaffProfileWithinTx.mockResolvedValueOnce([
        profileUpdated,
      ]);
      mockDb.setSelectResultsQueue([[], [sampleStaffRow], [governanceUpdated]]);

      const result = await service.updateStaff(actor, targetId, {
        fullName: "New Name",
        role: UserRole.ADMIN,
      });

      expect(result.fullName).toBe("New Name");
      expect(result.role).toBe(UserRole.ADMIN);
      expect(mockDb.mockInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          action: StaffAuditAction.UPDATE,
        }),
      );
    });
  });

  describe("resetCredentials", () => {
    it("forbids resetting own credentials", async () => {
      try {
        await service.resetCredentials(actor.sub, actor.sub);
        expect.unreachable("Expected UnprocessableEntityException");
      } catch (error) {
        expect(error).toBeInstanceOf(UnprocessableEntityException);
        expect((error as UnprocessableEntityException).getResponse()).toEqual(
          expect.objectContaining({
            code: API_ERROR_CODES.SELF_MODIFICATION_FORBIDDEN,
          }),
        );
      }
    });

    it("rejects customer targets as not found", async () => {
      mockDb.setSelectResult([{ ...sampleStaffRow, role: UserRole.CUSTOMER }]);

      try {
        await service.resetCredentials(actor.sub, targetId);
        expect.unreachable("Expected NotFoundException");
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);
        expect((error as NotFoundException).getResponse()).toEqual(
          expect.objectContaining({
            code: API_ERROR_CODES.STAFF_NOT_FOUND,
          }),
        );
      }
    });

    it("dispatches credential reset email and propagates mail enqueue failure", async () => {
      mockDb.setSelectResult([sampleStaffRow]);
      mockMailService.sendStaffCredentialResetEmail.mockImplementationOnce(() =>
        Promise.resolve(),
      );

      await service.resetCredentials(actor.sub, targetId);
      expect(
        mockMailService.sendStaffCredentialResetEmail,
      ).toHaveBeenCalledTimes(1);

      mockDb.setSelectResult([sampleStaffRow]);
      mockMailService.sendStaffCredentialResetEmail.mockImplementation(() =>
        Promise.reject(new Error("Mail queue down")),
      );

      try {
        await service.resetCredentials(actor.sub, targetId);
        expect.unreachable("Expected Error");
      } catch (error) {
        expect((error as Error).message).toBe("Mail queue down");
      }
      expect(mockRedisService.revokeUser).toHaveBeenCalledWith(targetId, 900);
    });
  });
});
