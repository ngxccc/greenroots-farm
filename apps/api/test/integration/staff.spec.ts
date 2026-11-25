import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  spyOn,
} from "bun:test";
import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Server } from "node:http";
import { and, eq } from "drizzle-orm";
import {
  API_ERROR_CODES,
  AuthSurface,
  StaffAuditAction,
  UserRole,
  UserStatus,
} from "@greenroots/shared";
import { sha256 } from "@/common/utils/crypto.util";
import { extractDatabaseErrorDetails } from "@/common/utils/error.util";
import type { DrizzleDB } from "@/database/database.module";
import { refreshTokens, staffAuditLogs, users } from "@/database/schemas";
import { truncateAllTables } from "@/database/utils/truncate.util";
import { MailService } from "@/modules/mail/mail.service";
import { AuditService } from "@/modules/users/audit.service";
import type { components } from "../generated/api-schema";
import { createUser } from "../factories/user.factory";
import {
  cleanScopedRedisKeys,
  createTestApp,
  teardownTestApp,
  type TestAppSetup,
} from "../helpers/app.helper";
import {
  captureMailTokens,
  createAuthenticatedAdmin,
  createAuthenticatedUser,
  generateTestToken,
  type CapturedMailTokens,
} from "../helpers/auth.helper";

type ApiResponseEnvelope<T> = components["schemas"]["ApiResponseDto"] & {
  data: T;
};
type PaginatedStaffEnvelope =
  components["schemas"]["PaginatedApiResponseDto"] & {
    data: StaffMemberResponse[];
    meta: components["schemas"]["PaginationMetaDto"];
  };
type StaffMemberResponse = components["schemas"]["StaffMemberDto"];
type CreateStaffPayload = components["schemas"]["CreateStaffDto"];
type UpdateStaffPayload = components["schemas"]["UpdateStaffDto"];
type Rfc9457Error = components["schemas"]["Rfc9457ErrorResponseDto"];

const CONTRACT_STAFF_KEYS = [
  "id",
  "email",
  "fullName",
  "phone",
  "role",
  "status",
  "emailVerified",
  "createdAt",
  "updatedAt",
] as const;

const UUID_V4 = "550e8400-e29b-41d4-a716-446655440000";
const MISSING_UUID_V7 = "019fa8bc-8f4d-7000-b366-e691f45cfb99";

describe("Staff Management Integration", () => {
  let setup: TestAppSetup;
  let app: INestApplication;
  let db: DrizzleDB;
  let jwtService: JwtService;
  let mailTokens: CapturedMailTokens;

  const getHttpServer = (): Server => app.getHttpServer() as Server;

  beforeAll(async () => {
    setup = await createTestApp();
    app = setup.app;
    db = setup.db;
    jwtService = app.get(JwtService);
    mailTokens = captureMailTokens(app);
    expect(setup.dbContext.isLiveDb).toBe(true);
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(setup);
  });

  beforeEach(async () => {
    await truncateAllTables(db, setup.workerSchema);
    await cleanScopedRedisKeys(setup.redisClient);
    mailTokens.clear();
  }, 15000);

  describe("RBAC Matrix across /api/v1/admin/users", () => {
    it("rejects unauthenticated requests across all staff endpoints", async () => {
      const target = await createUser(db, { role: UserRole.FARM_STAFF });

      const getRes = await request(getHttpServer()).get("/api/v1/admin/users");
      const postRes = await request(getHttpServer())
        .post("/api/v1/admin/users")
        .send({
          email: "staff@greenroots.farm",
          fullName: "Staff One",
          role: UserRole.FARM_STAFF,
        });
      const patchRes = await request(getHttpServer())
        .patch(`/api/v1/admin/users/${target.id}`)
        .send({ fullName: "Updated" });
      const resetRes = await request(getHttpServer()).post(
        `/api/v1/admin/users/${target.id}/reset-credentials`,
      );

      expect(getRes.status).toBe(401);
      expect(postRes.status).toBe(401);
      expect(patchRes.status).toBe(401);
      expect(resetRes.status).toBe(401);
    });

    it("forbids guest, customer, farm_staff, and sales from all admin staff routes", async () => {
      const target = await createUser(db, { role: UserRole.FARM_STAFF });

      for (const role of [
        UserRole.GUEST,
        UserRole.CUSTOMER,
        UserRole.FARM_STAFF,
        UserRole.SALES,
      ]) {
        const session = await createAuthenticatedUser(db, jwtService, { role });

        const getRes = await request(getHttpServer())
          .get("/api/v1/admin/users")
          .set(session.authHeader);
        const postRes = await request(getHttpServer())
          .post("/api/v1/admin/users")
          .set(session.authHeader)
          .send({
            email: `${role}-new@greenroots.farm`,
            fullName: "New Staff",
            role: UserRole.FARM_STAFF,
          });
        const patchRes = await request(getHttpServer())
          .patch(`/api/v1/admin/users/${target.id}`)
          .set(session.authHeader)
          .send({ fullName: "Attempt" });
        const resetRes = await request(getHttpServer())
          .post(`/api/v1/admin/users/${target.id}/reset-credentials`)
          .set(session.authHeader);

        expect(getRes.status).toBe(403);
        expect(postRes.status).toBe(403);
        expect(patchRes.status).toBe(403);
        expect(resetRes.status).toBe(403);
      }
    });

    it("forbids admin from creating staff, changing role/status, or resetting credentials", async () => {
      const admin = await createAuthenticatedAdmin(
        db,
        jwtService,
        UserRole.ADMIN,
      );
      const target = await createUser(db, { role: UserRole.FARM_STAFF });

      const postRes = await request(getHttpServer())
        .post("/api/v1/admin/users")
        .set(admin.authHeader)
        .send({
          email: "invite@greenroots.farm",
          fullName: "Invitee",
          role: UserRole.FARM_STAFF,
        });
      const patchRoleRes = await request(getHttpServer())
        .patch(`/api/v1/admin/users/${target.id}`)
        .set(admin.authHeader)
        .send({ role: UserRole.SALES });
      const patchStatusRes = await request(getHttpServer())
        .patch(`/api/v1/admin/users/${target.id}`)
        .set(admin.authHeader)
        .send({ status: UserStatus.SUSPENDED });
      const resetRes = await request(getHttpServer())
        .post(`/api/v1/admin/users/${target.id}/reset-credentials`)
        .set(admin.authHeader);

      expect(postRes.status).toBe(403);
      expect(patchRoleRes.status).toBe(403);
      expect(patchStatusRes.status).toBe(403);
      expect(resetRes.status).toBe(403);
    });
  });

  describe("GET /api/v1/admin/users", () => {
    // Invariant: INV-STAFF-6, INV-STAFF-7
    it("returns paginated staff projection excluding customers, guests, soft-deleted rows, and secret fields", async () => {
      const admin = await createAuthenticatedAdmin(
        db,
        jwtService,
        UserRole.ADMIN,
        {
          email: "alpha-admin@greenroots.farm",
          fullName: "Alpha Admin",
        },
      );
      await createUser(db, {
        email: "beta-sales@greenroots.farm",
        fullName: "Beta Sales 50% Fresh",
        phone: "0912345678",
        role: UserRole.SALES,
        status: UserStatus.ACTIVE,
      });
      await createUser(db, {
        email: "gamma-farm@greenroots.farm",
        fullName: "Gamma Farm",
        role: UserRole.FARM_STAFF,
        status: UserStatus.SUSPENDED,
      });
      await createUser(db, {
        email: "customer@greenroots.farm",
        fullName: "Customer Hidden",
        role: UserRole.CUSTOMER,
      });
      await createUser(db, {
        email: "guest@greenroots.farm",
        fullName: "Guest Hidden",
        role: UserRole.GUEST,
      });
      await createUser(db, {
        email: "deleted-staff@greenroots.farm",
        fullName: "Deleted Staff",
        role: UserRole.FARM_STAFF,
        deletedAt: new Date(),
      });

      const res = await request(getHttpServer())
        .get("/api/v1/admin/users")
        .query({ sort: "email:asc", page: 1, limit: 2 })
        .set(admin.authHeader);

      expect(res.status).toBe(200);
      const body = res.body as PaginatedStaffEnvelope;
      expect(body.success).toBe(true);
      expect(body.meta).toEqual({
        page: 1,
        limit: 2,
        total: 3,
        totalPages: 2,
        hasNextPage: true,
        hasPrevPage: false,
      });
      expect(body.data.map((item) => item.email)).toEqual([
        "alpha-admin@greenroots.farm",
        "beta-sales@greenroots.farm",
      ]);

      const first = body.data[0]!;
      expect(Object.keys(first).sort()).toEqual(
        [...CONTRACT_STAFF_KEYS].sort(),
      );
      expect(first).not.toHaveProperty("password");
      expect(first).not.toHaveProperty("resetPasswordToken");
      expect(first).not.toHaveProperty("verificationToken");
      expect(first).not.toHaveProperty("rewardPoints");
      expect(first).not.toHaveProperty("deletedAt");
    });

    it("filters by role, status, and escaped wildcard search query", async () => {
      const superAdmin = await createAuthenticatedAdmin(
        db,
        jwtService,
        UserRole.SUPER_ADMIN,
      );
      await createUser(db, {
        email: "promo@greenroots.farm",
        fullName: "Discount 50% ops_team",
        role: UserRole.SALES,
        status: UserStatus.ACTIVE,
      });
      await createUser(db, {
        email: "distractor@greenroots.farm",
        fullName: "Discount 500 opsxteam",
        role: UserRole.SALES,
        status: UserStatus.ACTIVE,
      });

      const percentRes = await request(getHttpServer())
        .get("/api/v1/admin/users")
        .query({ role: UserRole.SALES, status: UserStatus.ACTIVE, q: "50%" })
        .set(superAdmin.authHeader);

      expect(percentRes.status).toBe(200);
      const percentBody = percentRes.body as PaginatedStaffEnvelope;
      expect(percentBody.data).toHaveLength(1);
      expect(percentBody.data[0]?.email).toBe("promo@greenroots.farm");

      const underscoreRes = await request(getHttpServer())
        .get("/api/v1/admin/users")
        .query({ q: "ops_team" })
        .set(superAdmin.authHeader);

      expect(underscoreRes.status).toBe(200);
      const underscoreBody = underscoreRes.body as PaginatedStaffEnvelope;
      expect(underscoreBody.data).toHaveLength(1);
      expect(underscoreBody.data[0]?.email).toBe("promo@greenroots.farm");
    });

    // Invariant: INV-STAFF-7
    it("rejects customer and guest role filters and invalid sort or query parameters", async () => {
      const admin = await createAuthenticatedAdmin(
        db,
        jwtService,
        UserRole.ADMIN,
      );

      for (const forbiddenRole of [UserRole.CUSTOMER, UserRole.GUEST]) {
        const filterRes = await request(getHttpServer())
          .get("/api/v1/admin/users")
          .query({ role: forbiddenRole })
          .set(admin.authHeader);
        expect(filterRes.status).toBe(422);
        expect((filterRes.body as Rfc9457Error).code).toBe(
          API_ERROR_CODES.STAFF_ROLE_INVALID,
        );
      }

      const badSortRes = await request(getHttpServer())
        .get("/api/v1/admin/users")
        .query({ sort: "password:asc" })
        .set(admin.authHeader);
      expect(badSortRes.status).toBe(400);

      const unknownParamRes = await request(getHttpServer())
        .get("/api/v1/admin/users")
        .query({ extraFlag: "true" })
        .set(admin.authHeader);
      expect(unknownParamRes.status).toBe(400);
    });
  });

  describe("POST /api/v1/admin/users", () => {
    // Invariant: INV-STAFF-4, INV-STAFF-6
    it("creates unverified staff, records staff.create audit log, and activates via reset-password", async () => {
      const superAdmin = await createAuthenticatedAdmin(
        db,
        jwtService,
        UserRole.SUPER_ADMIN,
      );
      const payload: CreateStaffPayload = {
        email: "  New.Staff@GreenRoots.Farm ",
        fullName: "  <b>Le</b>   Van  Nam ",
        phone: "0912345678",
        role: UserRole.FARM_STAFF,
      };

      const createRes = await request(getHttpServer())
        .post("/api/v1/admin/users")
        .set(superAdmin.authHeader)
        .send(payload);

      expect(createRes.status).toBe(201);
      const created = (
        createRes.body as ApiResponseEnvelope<StaffMemberResponse>
      ).data;
      expect(Object.keys(created).sort()).toEqual(
        [...CONTRACT_STAFF_KEYS].sort(),
      );
      expect(created.email).toBe("new.staff@greenroots.farm");
      expect(created.fullName).toBe("Le Van Nam");
      expect(created.role).toBe(UserRole.FARM_STAFF);
      expect(created.status).toBe(UserStatus.ACTIVE);
      expect(created.emailVerified).toBe(false);
      expect(created).not.toHaveProperty("resetPasswordToken");

      const rawToken = mailTokens.getLatestStaffInviteToken(
        "new.staff@greenroots.farm",
      );
      expect(rawToken).toMatch(/^[0-9a-f]{64}$/);

      const [persisted] = await db
        .select()
        .from(users)
        .where(eq(users.id, created.id));
      expect(persisted?.resetPasswordToken).toBe(sha256(rawToken!));
      expect(persisted?.resetPasswordToken).not.toBe(rawToken);
      expect(persisted?.resetPasswordExpiresAt).toBeInstanceOf(Date);

      const audits = await db
        .select()
        .from(staffAuditLogs)
        .where(eq(staffAuditLogs.targetUserId, created.id));
      expect(audits).toHaveLength(1);
      expect(audits[0]?.actorId).toBe(superAdmin.user.id);
      expect(audits[0]?.action).toBe(StaffAuditAction.CREATE);
      expect(audits[0]?.before).toBeNull();
      expect(audits[0]?.after).toEqual({
        email: "new.staff@greenroots.farm",
        fullName: "Le Van Nam",
        phone: "0912345678",
        role: UserRole.FARM_STAFF,
        status: UserStatus.ACTIVE,
      });

      const unverifiedLogin = await request(getHttpServer())
        .post("/api/v1/auth/staff/login")
        .send({
          email: "new.staff@greenroots.farm",
          password: "AnyPassword123!",
        });
      expect(unverifiedLogin.status).toBe(401);

      const resetRes = await request(getHttpServer())
        .post("/api/v1/auth/reset-password")
        .send({
          token: rawToken,
          password: "StaffPassword123!",
          confirmPassword: "StaffPassword123!",
        });
      expect(resetRes.status).toBe(200);

      const loginRes = await request(getHttpServer())
        .post("/api/v1/auth/staff/login")
        .send({
          email: "new.staff@greenroots.farm",
          password: "StaffPassword123!",
        });
      expect(loginRes.status).toBe(200);
    });

    // Invariant: INV-STAFF-7
    it("rejects non-staff roles, unknown keys, and duplicate active emails while allowing soft-deleted reuse", async () => {
      const superAdmin = await createAuthenticatedAdmin(
        db,
        jwtService,
        UserRole.SUPER_ADMIN,
      );
      await createUser(db, {
        email: "existing.customer@greenroots.farm",
        role: UserRole.CUSTOMER,
      });

      const unknownKeysRes = await request(getHttpServer())
        .post("/api/v1/admin/users")
        .set(superAdmin.authHeader)
        .send({
          email: "extra@greenroots.farm",
          fullName: "Extra Keys",
          role: UserRole.FARM_STAFF,
          password: "PlaintextNotAllowed1!",
          emailVerified: true,
        });
      expect(unknownKeysRes.status).toBe(400);
      expect((unknownKeysRes.body as Rfc9457Error).code).toBe(
        API_ERROR_CODES.VALIDATION_FAILED,
      );

      for (const nonStaffRole of [UserRole.CUSTOMER, UserRole.GUEST]) {
        const invalidRoleRes = await request(getHttpServer())
          .post("/api/v1/admin/users")
          .set(superAdmin.authHeader)
          .send({
            email: `${nonStaffRole}@greenroots.farm`,
            fullName: "Non Staff Role",
            role: nonStaffRole,
          });
        expect(invalidRoleRes.status).toBe(422);
        expect((invalidRoleRes.body as Rfc9457Error).code).toBe(
          API_ERROR_CODES.STAFF_ROLE_INVALID,
        );
      }

      const duplicateRes = await request(getHttpServer())
        .post("/api/v1/admin/users")
        .set(superAdmin.authHeader)
        .send({
          email: "existing.customer@greenroots.farm",
          fullName: "Duplicate Email",
          role: UserRole.SALES,
        });
      expect(duplicateRes.status).toBe(409);
      expect((duplicateRes.body as Rfc9457Error).code).toBe(
        API_ERROR_CODES.AUTH_EMAIL_ALREADY_EXISTS,
      );

      await createUser(db, {
        email: "reusable.deleted@greenroots.farm",
        role: UserRole.FARM_STAFF,
        deletedAt: new Date(),
      });
      const reuseRes = await request(getHttpServer())
        .post("/api/v1/admin/users")
        .set(superAdmin.authHeader)
        .send({
          email: "reusable.deleted@greenroots.farm",
          fullName: "Rehired Staff",
          role: UserRole.FARM_STAFF,
        });
      expect(reuseRes.status).toBe(201);
    });

    it("persists created staff even when invitation mail enqueue fails after commit", async () => {
      const superAdmin = await createAuthenticatedAdmin(
        db,
        jwtService,
        UserRole.SUPER_ADMIN,
      );
      const mailService = app.get(MailService);
      const failSpy = spyOn(
        mailService,
        "sendStaffInvitationEmail",
      ).mockRejectedValueOnce(new Error("BullMQ down"));

      const res = await request(getHttpServer())
        .post("/api/v1/admin/users")
        .set(superAdmin.authHeader)
        .send({
          email: "resilient@greenroots.farm",
          fullName: "Resilient Staff",
          role: UserRole.SALES,
        });

      expect(res.status).toBe(201);
      expect(failSpy).toHaveBeenCalledTimes(1);
      const body = res.body as ApiResponseEnvelope<StaffMemberResponse>;
      const [persisted] = await db
        .select()
        .from(users)
        .where(eq(users.id, body.data.id));
      expect(persisted?.email).toBe("resilient@greenroots.farm");
    });

    // Invariant: ADV-2
    it("serializes concurrent staff creation with identical emails", async () => {
      const superAdmin = await createAuthenticatedAdmin(
        db,
        jwtService,
        UserRole.SUPER_ADMIN,
      );
      const payload: CreateStaffPayload = {
        email: "race@greenroots.farm",
        fullName: "Race Staff",
        role: UserRole.FARM_STAFF,
      };

      const [resA, resB] = await Promise.all([
        request(getHttpServer())
          .post("/api/v1/admin/users")
          .set(superAdmin.authHeader)
          .send(payload),
        request(getHttpServer())
          .post("/api/v1/admin/users")
          .set(superAdmin.authHeader)
          .send(payload),
      ]);

      expect([resA.status, resB.status].sort((a, b) => a - b)).toEqual([
        201, 409,
      ]);
    });
  });

  describe("PATCH /api/v1/admin/users/:id", () => {
    it("allows admin to edit staff fullName and phone and records staff.update_profile", async () => {
      const admin = await createAuthenticatedAdmin(
        db,
        jwtService,
        UserRole.ADMIN,
      );
      const target = await createUser(db, {
        fullName: "Old Name",
        phone: "0911111111",
        role: UserRole.FARM_STAFF,
      });

      const patchPayload: UpdateStaffPayload = {
        fullName: "New Name",
        phone: null,
      };
      const res = await request(getHttpServer())
        .patch(`/api/v1/admin/users/${target.id}`)
        .set(admin.authHeader)
        .send(patchPayload);

      expect(res.status).toBe(200);
      const updated = (res.body as ApiResponseEnvelope<StaffMemberResponse>)
        .data;
      expect(updated.fullName).toBe("New Name");
      expect(updated.phone).toBeNull();

      const audits = await db
        .select()
        .from(staffAuditLogs)
        .where(eq(staffAuditLogs.targetUserId, target.id));
      expect(audits).toHaveLength(1);
      expect(audits[0]?.action).toBe(StaffAuditAction.UPDATE_PROFILE);
      expect(audits[0]?.before?.fullName).toBe("Old Name");
      expect(audits[0]?.after?.fullName).toBe("New Name");
      expect(audits[0]?.after?.phone).toBeNull();
    });

    // Invariant: INV-STAFF-4, INV-STAFF-7
    it("records one staff.update row on combined PATCH and rejects empty payloads or non-staff roles", async () => {
      const superAdmin = await createAuthenticatedAdmin(
        db,
        jwtService,
        UserRole.SUPER_ADMIN,
      );
      const target = await createUser(db, {
        fullName: "Before Multi",
        role: UserRole.FARM_STAFF,
        status: UserStatus.ACTIVE,
      });

      const emptyRes = await request(getHttpServer())
        .patch(`/api/v1/admin/users/${target.id}`)
        .set(superAdmin.authHeader)
        .send({});
      expect(emptyRes.status).toBe(400);

      const nonStaffRoleRes = await request(getHttpServer())
        .patch(`/api/v1/admin/users/${target.id}`)
        .set(superAdmin.authHeader)
        .send({ role: UserRole.CUSTOMER });
      expect(nonStaffRoleRes.status).toBe(422);
      expect((nonStaffRoleRes.body as Rfc9457Error).code).toBe(
        API_ERROR_CODES.STAFF_ROLE_INVALID,
      );

      const multiRes = await request(getHttpServer())
        .patch(`/api/v1/admin/users/${target.id}`)
        .set(superAdmin.authHeader)
        .send({
          fullName: "After Multi",
          role: UserRole.SALES,
          status: UserStatus.INACTIVE,
        });
      expect(multiRes.status).toBe(200);

      const audits = await db
        .select()
        .from(staffAuditLogs)
        .where(eq(staffAuditLogs.targetUserId, target.id));
      expect(audits).toHaveLength(1);
      expect(audits[0]?.action).toBe(StaffAuditAction.UPDATE);
      expect(audits[0]?.after).toEqual({
        email: target.email,
        fullName: "After Multi",
        phone: target.phone,
        role: UserRole.SALES,
        status: UserStatus.INACTIVE,
      });
    });

    it("short-circuits no-op PATCH without creating audit noise", async () => {
      const admin = await createAuthenticatedAdmin(
        db,
        jwtService,
        UserRole.ADMIN,
      );
      const target = await createUser(db, {
        fullName: "Same Name",
        phone: "0912345678",
        role: UserRole.SALES,
      });

      const res = await request(getHttpServer())
        .patch(`/api/v1/admin/users/${target.id}`)
        .set(admin.authHeader)
        .send({ fullName: "Same Name", phone: "0912345678" });

      expect(res.status).toBe(200);
      const audits = await db
        .select()
        .from(staffAuditLogs)
        .where(eq(staffAuditLogs.targetUserId, target.id));
      expect(audits).toHaveLength(0);
    });

    // Invariant: INV-STAFF-2
    it("forbids self-modification of role or status while allowing self profile edits", async () => {
      const superAdmin = await createAuthenticatedAdmin(
        db,
        jwtService,
        UserRole.SUPER_ADMIN,
        { fullName: "Before Self" },
      );

      const selfProfileRes = await request(getHttpServer())
        .patch(`/api/v1/admin/users/${superAdmin.user.id}`)
        .set(superAdmin.authHeader)
        .send({ fullName: "After Self" });
      expect(selfProfileRes.status).toBe(200);

      const selfRoleRes = await request(getHttpServer())
        .patch(`/api/v1/admin/users/${superAdmin.user.id}`)
        .set(superAdmin.authHeader)
        .send({ role: UserRole.ADMIN });
      expect(selfRoleRes.status).toBe(422);
      expect((selfRoleRes.body as Rfc9457Error).code).toBe(
        API_ERROR_CODES.SELF_MODIFICATION_FORBIDDEN,
      );

      const selfStatusRes = await request(getHttpServer())
        .patch(`/api/v1/admin/users/${superAdmin.user.id}`)
        .set(superAdmin.authHeader)
        .send({ status: UserStatus.SUSPENDED });
      expect(selfStatusRes.status).toBe(422);
      expect((selfStatusRes.body as Rfc9457Error).code).toBe(
        API_ERROR_CODES.SELF_MODIFICATION_FORBIDDEN,
      );
    });

    // Invariant: INV-STAFF-7
    it("rejects customer, guest, soft-deleted, or missing targets and malformed identifiers", async () => {
      const superAdmin = await createAuthenticatedAdmin(
        db,
        jwtService,
        UserRole.SUPER_ADMIN,
      );
      const customer = await createUser(db, { role: UserRole.CUSTOMER });
      const guest = await createUser(db, { role: UserRole.GUEST });
      const softDeleted = await createUser(db, {
        role: UserRole.FARM_STAFF,
        deletedAt: new Date(),
      });

      for (const forbiddenTargetId of [
        customer.id,
        guest.id,
        softDeleted.id,
        MISSING_UUID_V7,
      ]) {
        const res = await request(getHttpServer())
          .patch(`/api/v1/admin/users/${forbiddenTargetId}`)
          .set(superAdmin.authHeader)
          .send({ fullName: "Should Fail" });
        expect(res.status).toBe(404);
        expect((res.body as Rfc9457Error).code).toBe(
          API_ERROR_CODES.STAFF_NOT_FOUND,
        );
      }

      const badUuidRes = await request(getHttpServer())
        .patch(`/api/v1/admin/users/${UUID_V4}`)
        .set(superAdmin.authHeader)
        .send({ fullName: "Bad UUID" });
      expect(badUuidRes.status).toBe(400);
    });

    // Invariant: INV-STAFF-1
    it("prevents demoting or suspending the last active super_admin sequentially and under concurrency", async () => {
      const sa1 = await createAuthenticatedAdmin(
        db,
        jwtService,
        UserRole.SUPER_ADMIN,
      );
      const inactiveSa = await createAuthenticatedAdmin(
        db,
        jwtService,
        UserRole.SUPER_ADMIN,
        { status: UserStatus.INACTIVE },
      );

      const seqRes = await request(getHttpServer())
        .patch(`/api/v1/admin/users/${sa1.user.id}`)
        .set(inactiveSa.authHeader)
        .send({ status: UserStatus.SUSPENDED });
      expect(seqRes.status).toBe(422);
      expect((seqRes.body as Rfc9457Error).code).toBe(
        API_ERROR_CODES.LAST_SUPER_ADMIN,
      );

      const sa2 = await createAuthenticatedAdmin(
        db,
        jwtService,
        UserRole.SUPER_ADMIN,
      );

      const [resA, resB] = await Promise.all([
        request(getHttpServer())
          .patch(`/api/v1/admin/users/${sa2.user.id}`)
          .set(sa1.authHeader)
          .send({ role: UserRole.ADMIN }),
        request(getHttpServer())
          .patch(`/api/v1/admin/users/${sa1.user.id}`)
          .set(sa2.authHeader)
          .send({ status: UserStatus.SUSPENDED }),
      ]);

      const statuses = [resA.status, resB.status].sort((a, b) => a - b);
      expect(statuses).toEqual([200, 422]);
      const failed = resA.status === 422 ? resA : resB;
      expect((failed.body as Rfc9457Error).code).toBe(
        API_ERROR_CODES.LAST_SUPER_ADMIN,
      );

      const remainingActiveSuperAdmins = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.role, UserRole.SUPER_ADMIN),
            eq(users.status, UserStatus.ACTIVE),
          ),
        );
      expect(remainingActiveSuperAdmins).toHaveLength(1);
    });

    // Invariant: INV-STAFF-3
    it("deletes refresh tokens in-tx and revokes Redis access tokens when suspended, deactivated, or demoted", async () => {
      const superAdmin = await createAuthenticatedAdmin(
        db,
        jwtService,
        UserRole.SUPER_ADMIN,
      );
      const staff = await createAuthenticatedUser(db, jwtService, {
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      });

      const refreshPlain = "a".repeat(64);
      await db.insert(refreshTokens).values({
        userId: staff.user.id,
        token: sha256(refreshPlain),
        surface: AuthSurface.STAFF,
        expiresAt: new Date(Date.now() + 3_600_000),
      });

      const demoteRes = await request(getHttpServer())
        .patch(`/api/v1/admin/users/${staff.user.id}`)
        .set(superAdmin.authHeader)
        .send({ role: UserRole.FARM_STAFF });
      expect(demoteRes.status).toBe(200);

      const dbTokensAfterDemote = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.userId, staff.user.id));
      expect(dbTokensAfterDemote).toHaveLength(0);

      const accessAfterDemote = await request(getHttpServer())
        .get("/api/v1/users/me")
        .set(staff.authHeader);
      expect(accessAfterDemote.status).toBe(401);

      const refreshAfterDemote = await request(getHttpServer())
        .post("/api/v1/auth/staff/refresh")
        .send({ refreshToken: refreshPlain });
      expect(refreshAfterDemote.status).toBe(401);

      // Issue fresh session tokens, then suspend the staff member
      await cleanScopedRedisKeys(setup.redisClient);
      const freshToken = await generateTestToken(jwtService, {
        sub: staff.user.id,
        email: staff.user.email,
        role: UserRole.FARM_STAFF,
      });
      const freshRefresh = "b".repeat(64);
      await db.insert(refreshTokens).values({
        userId: staff.user.id,
        token: sha256(freshRefresh),
        surface: AuthSurface.STAFF,
        expiresAt: new Date(Date.now() + 3_600_000),
      });

      const suspendRes = await request(getHttpServer())
        .patch(`/api/v1/admin/users/${staff.user.id}`)
        .set(superAdmin.authHeader)
        .send({ status: UserStatus.SUSPENDED });
      expect(suspendRes.status).toBe(200);

      const dbTokensAfterSuspend = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.userId, staff.user.id));
      expect(dbTokensAfterSuspend).toHaveLength(0);

      const accessAfterSuspend = await request(getHttpServer())
        .get("/api/v1/users/me")
        .set({ Authorization: `Bearer ${freshToken}` });
      expect(accessAfterSuspend.status).toBe(401);

      // Reactivate, mint new session, then deactivate (`inactive`) and verify revocation
      await request(getHttpServer())
        .patch(`/api/v1/admin/users/${staff.user.id}`)
        .set(superAdmin.authHeader)
        .send({ status: UserStatus.ACTIVE });

      await cleanScopedRedisKeys(setup.redisClient);
      const reactivatedAccess = await generateTestToken(jwtService, {
        sub: staff.user.id,
        email: staff.user.email,
        role: UserRole.FARM_STAFF,
      });
      const reactivatedRefresh = "d".repeat(64);
      await db.insert(refreshTokens).values({
        userId: staff.user.id,
        token: sha256(reactivatedRefresh),
        surface: AuthSurface.STAFF,
        expiresAt: new Date(Date.now() + 3_600_000),
      });

      const deactivateRes = await request(getHttpServer())
        .patch(`/api/v1/admin/users/${staff.user.id}`)
        .set(superAdmin.authHeader)
        .send({ status: UserStatus.INACTIVE });
      expect(deactivateRes.status).toBe(200);

      const dbTokensAfterDeactivate = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.userId, staff.user.id));
      expect(dbTokensAfterDeactivate).toHaveLength(0);

      const accessAfterDeactivate = await request(getHttpServer())
        .get("/api/v1/users/me")
        .set({ Authorization: `Bearer ${reactivatedAccess}` });
      expect(accessAfterDeactivate.status).toBe(401);

      const refreshAfterDeactivate = await request(getHttpServer())
        .post("/api/v1/auth/staff/refresh")
        .send({ refreshToken: reactivatedRefresh });
      expect(refreshAfterDeactivate.status).toBe(401);
    });
  });

  describe("POST /api/v1/admin/users/:id/reset-credentials & status gate", () => {
    // Invariant: INV-STAFF-2, INV-STAFF-3, INV-STAFF-4
    it("issues reset token, revokes active sessions, records audit log, and rejects self or inactive targets", async () => {
      const superAdmin = await createAuthenticatedAdmin(
        db,
        jwtService,
        UserRole.SUPER_ADMIN,
      );
      const activeStaff = await createAuthenticatedUser(db, jwtService, {
        role: UserRole.SALES,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      });
      const suspendedStaff = await createUser(db, {
        role: UserRole.FARM_STAFF,
        status: UserStatus.SUSPENDED,
      });
      const inactiveStaff = await createUser(db, {
        role: UserRole.FARM_STAFF,
        status: UserStatus.INACTIVE,
      });

      const selfResetRes = await request(getHttpServer())
        .post(`/api/v1/admin/users/${superAdmin.user.id}/reset-credentials`)
        .set(superAdmin.authHeader);
      expect(selfResetRes.status).toBe(422);
      expect((selfResetRes.body as Rfc9457Error).code).toBe(
        API_ERROR_CODES.SELF_MODIFICATION_FORBIDDEN,
      );

      for (const blocked of [suspendedStaff, inactiveStaff]) {
        const blockedResetRes = await request(getHttpServer())
          .post(`/api/v1/admin/users/${blocked.id}/reset-credentials`)
          .set(superAdmin.authHeader);
        expect(blockedResetRes.status).toBe(422);
      }

      await db.insert(refreshTokens).values({
        userId: activeStaff.user.id,
        token: sha256("c".repeat(64)),
        surface: AuthSurface.STAFF,
        expiresAt: new Date(Date.now() + 3_600_000),
      });

      const resetRes = await request(getHttpServer())
        .post(`/api/v1/admin/users/${activeStaff.user.id}/reset-credentials`)
        .set(superAdmin.authHeader);
      expect(resetRes.status).toBe(200);
      expect(resetRes.body).toEqual({ success: true, data: null });

      const accessAfterReset = await request(getHttpServer())
        .get("/api/v1/users/me")
        .set(activeStaff.authHeader);
      expect(accessAfterReset.status).toBe(401);

      const rawToken = mailTokens.getLatestStaffResetToken(
        activeStaff.user.email,
      );
      expect(rawToken).toMatch(/^[0-9a-f]{64}$/);

      const audits = await db
        .select()
        .from(staffAuditLogs)
        .where(eq(staffAuditLogs.targetUserId, activeStaff.user.id));
      expect(audits).toHaveLength(1);
      expect(audits[0]?.action).toBe(StaffAuditAction.RESET_CREDENTIALS);

      // Suspend before invite/reset token is consumed -> POST /auth/reset-password must reject with 403
      await request(getHttpServer())
        .patch(`/api/v1/admin/users/${activeStaff.user.id}`)
        .set(superAdmin.authHeader)
        .send({ status: UserStatus.SUSPENDED });

      const consumeWhileSuspended = await request(getHttpServer())
        .post("/api/v1/auth/reset-password")
        .send({
          token: rawToken,
          password: "BlockedPassword123!",
          confirmPassword: "BlockedPassword123!",
        });
      expect(consumeWhileSuspended.status).toBe(403);
      expect((consumeWhileSuspended.body as Rfc9457Error).code).toBe(
        API_ERROR_CODES.AUTH_ACCOUNT_SUSPENDED,
      );
    });

    // Invariant: INV-STAFF-7
    it("rejects reset-credentials for missing, customer, guest, and soft-deleted targets", async () => {
      const superAdmin = await createAuthenticatedAdmin(
        db,
        jwtService,
        UserRole.SUPER_ADMIN,
      );
      const customer = await createUser(db, { role: UserRole.CUSTOMER });
      const guest = await createUser(db, { role: UserRole.GUEST });
      const softDeleted = await createUser(db, {
        role: UserRole.FARM_STAFF,
        deletedAt: new Date(),
      });

      for (const targetId of [
        customer.id,
        guest.id,
        softDeleted.id,
        MISSING_UUID_V7,
      ]) {
        const res = await request(getHttpServer())
          .post(`/api/v1/admin/users/${targetId}/reset-credentials`)
          .set(superAdmin.authHeader);
        expect(res.status).toBe(404);
        expect((res.body as Rfc9457Error).code).toBe(
          API_ERROR_CODES.STAFF_NOT_FOUND,
        );
      }
    });

    // Invariant: INV-STAFF-3, EDGE-17
    it("blocks unverified invited staff from resetting password after suspension without changing password or emailVerified", async () => {
      const superAdmin = await createAuthenticatedAdmin(
        db,
        jwtService,
        UserRole.SUPER_ADMIN,
      );
      const inviteRes = await request(getHttpServer())
        .post("/api/v1/admin/users")
        .set(superAdmin.authHeader)
        .send({
          email: "suspended-invite@greenroots.farm",
          fullName: "Suspended Invitee",
          role: UserRole.FARM_STAFF,
        });
      expect(inviteRes.status).toBe(201);
      const invitedId = (
        inviteRes.body as ApiResponseEnvelope<StaffMemberResponse>
      ).data.id;
      const inviteToken = mailTokens.getLatestStaffInviteToken(
        "suspended-invite@greenroots.farm",
      );

      const [beforeSuspend] = await db
        .select({
          password: users.password,
          emailVerified: users.emailVerified,
        })
        .from(users)
        .where(eq(users.id, invitedId));

      await request(getHttpServer())
        .patch(`/api/v1/admin/users/${invitedId}`)
        .set(superAdmin.authHeader)
        .send({ status: UserStatus.SUSPENDED });

      const consumeRes = await request(getHttpServer())
        .post("/api/v1/auth/reset-password")
        .send({
          token: inviteToken,
          password: "BlockedPassword123!",
          confirmPassword: "BlockedPassword123!",
        });
      expect(consumeRes.status).toBe(403);
      expect((consumeRes.body as Rfc9457Error).code).toBe(
        API_ERROR_CODES.AUTH_ACCOUNT_SUSPENDED,
      );

      const [afterAttempt] = await db
        .select({
          password: users.password,
          emailVerified: users.emailVerified,
        })
        .from(users)
        .where(eq(users.id, invitedId));
      expect(afterAttempt?.emailVerified).toBe(false);
      expect(afterAttempt?.password).toBe(beforeSuspend?.password);
    });
  });

  describe("staff_audit_logs Atomicity & Immutability", () => {
    // Invariant: INV-STAFF-4
    it("rolls back staff creation and updates when audit log insertion fails", async () => {
      const superAdmin = await createAuthenticatedAdmin(
        db,
        jwtService,
        UserRole.SUPER_ADMIN,
      );
      const existingStaff = await createUser(db, {
        fullName: "Original Name",
        role: UserRole.FARM_STAFF,
      });
      const auditService = app.get(AuditService);

      const auditFailSpy = spyOn(
        auditService,
        "recordStaffAudit",
      ).mockRejectedValueOnce(new Error("Audit insert failed"));

      const failedCreate = await request(getHttpServer())
        .post("/api/v1/admin/users")
        .set(superAdmin.authHeader)
        .send({
          email: "rollback-create@greenroots.farm",
          fullName: "Rollback Staff",
          role: UserRole.SALES,
        });
      expect(failedCreate.status).toBe(500);
      expect(auditFailSpy).toHaveBeenCalledTimes(1);

      const rolledBackUsers = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, "rollback-create@greenroots.farm"));
      expect(rolledBackUsers).toHaveLength(0);

      auditFailSpy.mockClear();
      auditFailSpy.mockRejectedValueOnce(new Error("Audit insert failed"));

      const failedUpdate = await request(getHttpServer())
        .patch(`/api/v1/admin/users/${existingStaff.id}`)
        .set(superAdmin.authHeader)
        .send({ fullName: "Rolled Back Name", role: UserRole.SALES });
      expect(failedUpdate.status).toBe(500);
      expect(auditFailSpy).toHaveBeenCalledTimes(1);
      auditFailSpy.mockRestore();

      const [unchanged] = await db
        .select({ fullName: users.fullName, role: users.role })
        .from(users)
        .where(eq(users.id, existingStaff.id));
      expect(unchanged?.fullName).toBe("Original Name");
      expect(unchanged?.role).toBe(UserRole.FARM_STAFF);
    });

    // Invariant: INV-STAFF-5
    it("rejects UPDATE and DELETE on staff_audit_logs at the PostgreSQL trigger level", async () => {
      const superAdmin = await createAuthenticatedAdmin(
        db,
        jwtService,
        UserRole.SUPER_ADMIN,
      );

      const createRes = await request(getHttpServer())
        .post("/api/v1/admin/users")
        .set(superAdmin.authHeader)
        .send({
          email: "immutable@greenroots.farm",
          fullName: "Audit Target",
          role: UserRole.FARM_STAFF,
        });
      expect(createRes.status).toBe(201);

      const createdId = (
        createRes.body as ApiResponseEnvelope<StaffMemberResponse>
      ).data.id;
      const [auditRow] = await db
        .select()
        .from(staffAuditLogs)
        .where(eq(staffAuditLogs.targetUserId, createdId));
      expect(auditRow).toBeDefined();

      let updateError: unknown;
      try {
        await db
          .update(staffAuditLogs)
          .set({ action: StaffAuditAction.UPDATE })
          .where(eq(staffAuditLogs.id, auditRow!.id));
      } catch (error) {
        updateError = error;
      }
      expect(updateError).toBeDefined();
      const updateDetails = extractDatabaseErrorDetails(updateError);
      expect(updateDetails.code).toBe("P0001");
      expect(updateDetails.message).toContain("STAFF_AUDIT_LOG_IMMUTABLE");

      let deleteError: unknown;
      try {
        await db
          .delete(staffAuditLogs)
          .where(eq(staffAuditLogs.id, auditRow!.id));
      } catch (error) {
        deleteError = error;
      }
      expect(deleteError).toBeDefined();
      const deleteDetails = extractDatabaseErrorDetails(deleteError);
      expect(deleteDetails.code).toBe("P0001");
      expect(deleteDetails.message).toContain("STAFF_AUDIT_LOG_IMMUTABLE");
    });
  });
});
