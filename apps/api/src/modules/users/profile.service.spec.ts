import { beforeEach, describe, expect, it, mock } from "bun:test";
import { UnauthorizedException } from "@nestjs/common";
import { API_ERROR_CODES, UserRole, UserStatus } from "@greenroots/shared";
import { MESSAGES } from "@/common/constants/messages.constant";
import { createMockDb } from "../../../test/mocks/mock-database";
import { updateProfileSchema } from "./dto";
import { PROFILE_COLUMNS, ProfileService } from "./profile.service";

type MockDb = ReturnType<typeof createMockDb> & {
  mockUpdateSet: ReturnType<typeof mock>;
  mockUpdateWhere: ReturnType<typeof mock>;
  setSelectResult: (result: unknown[]) => void;
  clearAll: () => void;
};

describe("ProfileService", () => {
  let service: ProfileService;
  let mockDb: MockDb;

  const baseTimestamp = new Date("2026-11-19T00:00:00.000Z");
  const updatedTimestamp = new Date("2026-11-19T00:05:00.000Z");

  const sampleRow = {
    id: "019fa8bc-8f4d-7000-b366-e691f45cfb91",
    email: "customer@greenroots.farm",
    fullName: "Nguyen Van An",
    phone: "0912345678",
    role: UserRole.CUSTOMER,
    status: UserStatus.ACTIVE,
    rewardPoints: 120,
    emailVerified: true,
    createdAt: baseTimestamp,
    updatedAt: baseTimestamp,
  };

  beforeEach(() => {
    mockDb = createMockDb() as unknown as MockDb;
    service = new ProfileService(mockDb);
  });

  describe("PROFILE_COLUMNS", () => {
    it("contains the exact closed projection keys in contract order", () => {
      expect(Object.keys(PROFILE_COLUMNS)).toEqual([
        "id",
        "email",
        "fullName",
        "phone",
        "role",
        "status",
        "rewardPoints",
        "emailVerified",
        "createdAt",
        "updatedAt",
      ]);
    });

    it("excludes credential, token, and soft-delete columns", () => {
      const keys = Object.keys(PROFILE_COLUMNS);
      expect(keys).not.toContain("password");
      expect(keys).not.toContain("verificationToken");
      expect(keys).not.toContain("verificationExpiresAt");
      expect(keys).not.toContain("resetPasswordToken");
      expect(keys).not.toContain("resetPasswordExpiresAt");
      expect(keys).not.toContain("deletedAt");
    });
  });

  describe("getProfile", () => {
    it("returns the closed profile projection with ISO timestamps for an active user", async () => {
      mockDb.setSelectResult([sampleRow]);

      const result = await service.getProfile(sampleRow.id);

      expect(mockDb.select).toHaveBeenCalledWith(PROFILE_COLUMNS);
      expect(result).toEqual({
        id: sampleRow.id,
        email: sampleRow.email,
        fullName: sampleRow.fullName,
        phone: sampleRow.phone,
        role: sampleRow.role,
        status: sampleRow.status,
        rewardPoints: sampleRow.rewardPoints,
        emailVerified: sampleRow.emailVerified,
        createdAt: baseTimestamp.toISOString(),
        updatedAt: baseTimestamp.toISOString(),
      });
    });

    it("throws UnauthorizedException when the user is missing or soft-deleted", async () => {
      mockDb.setSelectResult([]);

      try {
        await service.getProfile(sampleRow.id);
        expect.unreachable("Expected UnauthorizedException to be thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(UnauthorizedException);
        expect((error as UnauthorizedException).getResponse()).toEqual({
          code: API_ERROR_CODES.AUTH_TOKEN_INVALID_OR_EXPIRED,
          detail: MESSAGES.AUTH.TOKEN_INVALID_OR_EXPIRED,
        });
      }
    });
  });

  describe("updateProfile", () => {
    it("updates only fullName when phone is omitted", async () => {
      const updatedRow = {
        ...sampleRow,
        fullName: "Tran Thi Binh",
        updatedAt: updatedTimestamp,
      };
      mockDb.setSelectResult([updatedRow]);

      const result = await service.updateProfile(sampleRow.id, {
        fullName: "Tran Thi Binh",
      });

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.mockUpdateSet).toHaveBeenCalledWith({
        fullName: "Tran Thi Binh",
      });
      expect(result.fullName).toBe("Tran Thi Binh");
      expect(result.phone).toBe("0912345678");
      expect(result.updatedAt).toBe(updatedTimestamp.toISOString());
    });

    it("clears phone when null is provided", async () => {
      const updatedRow = {
        ...sampleRow,
        phone: null,
        updatedAt: updatedTimestamp,
      };
      mockDb.setSelectResult([updatedRow]);

      const result = await service.updateProfile(sampleRow.id, {
        phone: null,
      });

      expect(mockDb.mockUpdateSet).toHaveBeenCalledWith({ phone: null });
      expect(result.phone).toBeNull();
    });

    it("updates both fullName and phone when both are supplied", async () => {
      const updatedRow = {
        ...sampleRow,
        fullName: "Le Van Cuong",
        phone: "0987654321",
        updatedAt: updatedTimestamp,
      };
      mockDb.setSelectResult([updatedRow]);

      const result = await service.updateProfile(sampleRow.id, {
        fullName: "Le Van Cuong",
        phone: "0987654321",
      });

      expect(mockDb.mockUpdateSet).toHaveBeenCalledWith({
        fullName: "Le Van Cuong",
        phone: "0987654321",
      });
      expect(result.fullName).toBe("Le Van Cuong");
      expect(result.phone).toBe("0987654321");
    });

    it("throws UnauthorizedException when the target row is missing or soft-deleted", async () => {
      mockDb.setSelectResult([]);

      try {
        await service.updateProfile(sampleRow.id, { fullName: "Ghost User" });
        expect.unreachable("Expected UnauthorizedException to be thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(UnauthorizedException);
        expect((error as UnauthorizedException).getResponse()).toEqual({
          code: API_ERROR_CODES.AUTH_TOKEN_INVALID_OR_EXPIRED,
          detail: MESSAGES.AUTH.TOKEN_INVALID_OR_EXPIRED,
        });
      }
    });
  });

  describe("updateProfileSchema", () => {
    it("rejects an empty object", () => {
      expect(updateProfileSchema.safeParse({}).success).toBe(false);
    });

    it("strips HTML and collapses whitespace in fullName", () => {
      const parsed = updateProfileSchema.parse({
        fullName: "  <b>Nguyen</b>   Van   An  ",
      });
      expect(parsed.fullName).toBe("Nguyen Van An");
    });

    it("rejects fullName exceeding 100 characters", () => {
      expect(
        updateProfileSchema.safeParse({ fullName: "a".repeat(101) }).success,
      ).toBe(false);
      expect(
        updateProfileSchema.safeParse({ fullName: "a".repeat(100) }).success,
      ).toBe(true);
    });

    it("accepts null for phone while rejecting empty string", () => {
      expect(updateProfileSchema.safeParse({ phone: null }).success).toBe(true);
      expect(updateProfileSchema.safeParse({ phone: "" }).success).toBe(false);
    });

    it("rejects read-only and unrecognized keys", () => {
      const forbiddenFields = [
        { id: sampleRow.id },
        { email: "other@greenroots.farm" },
        { role: UserRole.ADMIN },
        { status: UserStatus.SUSPENDED },
        { rewardPoints: 999 },
        { emailVerified: true },
        { createdAt: "2026-11-19T00:00:00.000Z" },
        { updatedAt: "2026-11-19T00:00:00.000Z" },
      ];

      for (const payload of forbiddenFields) {
        const result = updateProfileSchema.safeParse(payload);
        expect(result.success).toBe(false);
      }
    });
  });
});
