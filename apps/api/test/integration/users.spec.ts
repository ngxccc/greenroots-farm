import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Server } from "node:http";
import { eq } from "drizzle-orm";
import { API_ERROR_CODES, UserRole, UserStatus } from "@greenroots/shared";
import type { DrizzleDB } from "@/database/database.module";
import { users } from "@/database/schemas";
import { truncateAllTables } from "@/database/utils/truncate.util";
import type { components } from "../generated/api-schema";
import {
  cleanScopedRedisKeys,
  createTestApp,
  teardownTestApp,
  type TestAppSetup,
} from "../helpers/app.helper";
import { createAuthenticatedUser } from "../helpers/auth.helper";

type ApiResponseEnvelope<T> = components["schemas"]["ApiResponseDto"] & {
  data: T;
};
type UserProfile = components["schemas"]["UserProfileDto"];
type UpdateProfilePayload = components["schemas"]["UpdateProfileDto"];
type Rfc9457Error = components["schemas"]["Rfc9457ErrorResponseDto"];

const CONTRACT_PROFILE_KEYS = [
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
] as const;

describe("Users Integration", () => {
  let setup: TestAppSetup;
  let app: INestApplication;
  let db: DrizzleDB;
  let jwtService: JwtService;

  const getHttpServer = (): Server => app.getHttpServer() as Server;

  beforeAll(async () => {
    setup = await createTestApp();
    app = setup.app;
    db = setup.db;
    jwtService = app.get(JwtService);
    expect(setup.dbContext.isLiveDb).toBe(true);
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(setup);
  });

  beforeEach(async () => {
    await truncateAllTables(db, setup.workerSchema);
    await cleanScopedRedisKeys(setup.redisClient);
  }, 15000);

  describe("GET /api/v1/users/me", () => {
    // Invariant: INV-PROFILE-1, INV-PROFILE-2
    it("returns the closed profile projection and caller values", async () => {
      const { user, authHeader } = await createAuthenticatedUser(
        db,
        jwtService,
        {
          fullName: "Nguyen Van An",
          phone: "0912345678",
          rewardPoints: 250,
        },
      );

      const res = await request(getHttpServer())
        .get("/api/v1/users/me")
        .set(authHeader);

      expect(res.status).toBe(200);
      const body = res.body as ApiResponseEnvelope<UserProfile>;
      expect(body.success).toBe(true);
      expect(Object.keys(body.data).sort()).toEqual(
        [...CONTRACT_PROFILE_KEYS].sort(),
      );
      expect(body.data).toEqual({
        id: user.id,
        email: user.email,
        fullName: "Nguyen Van An",
        phone: "0912345678",
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        rewardPoints: 250,
        emailVerified: true,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      });
      expect(body.data).not.toHaveProperty("password");
      expect(body.data).not.toHaveProperty("verificationToken");
      expect(body.data).not.toHaveProperty("verificationExpiresAt");
      expect(body.data).not.toHaveProperty("resetPasswordToken");
      expect(body.data).not.toHaveProperty("resetPasswordExpiresAt");
      expect(body.data).not.toHaveProperty("deletedAt");
    });

    it("rejects unauthenticated requests", async () => {
      const res = await request(getHttpServer()).get("/api/v1/users/me");

      expect(res.status).toBe(401);
      const error = res.body as Rfc9457Error;
      expect(error.status).toBe(401);
      expect(error.type).toBe("/errors/unauthorized");
    });

    // Invariant: INV-PROFILE-8
    it("rejects valid tokens belonging to a soft-deleted user", async () => {
      const { user, authHeader } = await createAuthenticatedUser(
        db,
        jwtService,
      );

      await db
        .update(users)
        .set({ deletedAt: new Date() })
        .where(eq(users.id, user.id));

      const res = await request(getHttpServer())
        .get("/api/v1/users/me")
        .set(authHeader);

      expect(res.status).toBe(401);
      const error = res.body as Rfc9457Error;
      expect(error.code).toBe(API_ERROR_CODES.AUTH_TOKEN_INVALID_OR_EXPIRED);
    });

    it("returns the profile for a suspended user with a valid access token", async () => {
      const { user, authHeader } = await createAuthenticatedUser(
        db,
        jwtService,
        {
          status: UserStatus.SUSPENDED,
        },
      );

      const res = await request(getHttpServer())
        .get("/api/v1/users/me")
        .set(authHeader);

      expect(res.status).toBe(200);
      const body = res.body as ApiResponseEnvelope<UserProfile>;
      expect(body.data.id).toBe(user.id);
      expect(body.data.status).toBe(UserStatus.SUSPENDED);
    });

    it("allows non-customer staff roles to read their own profile", async () => {
      const { user, authHeader } = await createAuthenticatedUser(
        db,
        jwtService,
        {
          role: UserRole.FARM_STAFF,
        },
      );

      const res = await request(getHttpServer())
        .get("/api/v1/users/me")
        .set(authHeader);

      expect(res.status).toBe(200);
      const body = res.body as ApiResponseEnvelope<UserProfile>;
      expect(body.data.id).toBe(user.id);
      expect(body.data.role).toBe(UserRole.FARM_STAFF);
    });
  });

  describe("PATCH /api/v1/users/me", () => {
    it("rejects unauthenticated update requests", async () => {
      const res = await request(getHttpServer())
        .patch("/api/v1/users/me")
        .send({ fullName: "Unauthenticated User" });

      expect(res.status).toBe(401);
    });

    // Invariant: INV-PROFILE-7
    it("updates and sanitizes fullName while preserving phone and advancing updatedAt", async () => {
      const { user, authHeader } = await createAuthenticatedUser(
        db,
        jwtService,
        {
          fullName: "Original Name",
          phone: "0912345678",
        },
      );

      await Bun.sleep(5);

      const payload: UpdateProfilePayload = {
        fullName: "  <b>An</b>   Nguyen   ",
      };
      const res = await request(getHttpServer())
        .patch("/api/v1/users/me")
        .set(authHeader)
        .send(payload);

      expect(res.status).toBe(200);
      const body = res.body as ApiResponseEnvelope<UserProfile>;
      expect(body.success).toBe(true);
      expect(Object.keys(body.data).sort()).toEqual(
        [...CONTRACT_PROFILE_KEYS].sort(),
      );
      expect(body.data.fullName).toBe("An Nguyen");
      expect(body.data.phone).toBe("0912345678");
      expect(new Date(body.data.updatedAt).getTime()).toBeGreaterThan(
        user.updatedAt.getTime(),
      );
    });

    it("updates phone while preserving fullName", async () => {
      const { user, authHeader } = await createAuthenticatedUser(
        db,
        jwtService,
        {
          fullName: "Stable Name",
          phone: "0912345678",
        },
      );

      const res = await request(getHttpServer())
        .patch("/api/v1/users/me")
        .set(authHeader)
        .send({ phone: "0387654321" } satisfies UpdateProfilePayload);

      expect(res.status).toBe(200);
      const body = res.body as ApiResponseEnvelope<UserProfile>;
      expect(body.data.fullName).toBe(user.fullName);
      expect(body.data.phone).toBe("0387654321");
    });

    // Invariant: INV-PROFILE-4
    it("updates both fullName and phone together", async () => {
      const { user, authHeader } = await createAuthenticatedUser(
        db,
        jwtService,
        {
          fullName: "Before Name",
          phone: null,
        },
      );

      const res = await request(getHttpServer())
        .patch("/api/v1/users/me")
        .set(authHeader)
        .send({
          fullName: "After Name",
          phone: "0701122334",
        } satisfies UpdateProfilePayload);

      expect(res.status).toBe(200);
      const body = res.body as ApiResponseEnvelope<UserProfile>;
      expect(body.data.fullName).toBe("After Name");
      expect(body.data.phone).toBe("0701122334");

      const [persisted] = await db
        .select()
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);
      expect(persisted?.fullName).toBe("After Name");
      expect(persisted?.phone).toBe("0701122334");
    });

    // Invariant: INV-PROFILE-6
    it("clears the phone column when null is sent", async () => {
      const { user, authHeader } = await createAuthenticatedUser(
        db,
        jwtService,
        {
          phone: "0912345678",
        },
      );

      const res = await request(getHttpServer())
        .patch("/api/v1/users/me")
        .set(authHeader)
        .send({ phone: null } satisfies UpdateProfilePayload);

      expect(res.status).toBe(200);
      const body = res.body as ApiResponseEnvelope<UserProfile>;
      expect(body.data.phone).toBeNull();

      const [persisted] = await db
        .select()
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);
      expect(persisted?.phone).toBeNull();
    });

    // Invariant: INV-PROFILE-5
    it("rejects an empty payload body", async () => {
      const { authHeader } = await createAuthenticatedUser(db, jwtService);

      const res = await request(getHttpServer())
        .patch("/api/v1/users/me")
        .set(authHeader)
        .send({});

      expect(res.status).toBe(400);
      const error = res.body as Rfc9457Error;
      expect(error.code).toBe(API_ERROR_CODES.VALIDATION_FAILED);
      expect(
        error.invalidParams?.some(
          (param) => param.code === API_ERROR_CODES.CUSTOM_VALIDATION_ERROR,
        ),
      ).toBe(true);
    });

    // Invariant: INV-PROFILE-6, INV-PROFILE-7
    it("rejects empty or invalid phone and invalid or over-length fullName values", async () => {
      const { authHeader } = await createAuthenticatedUser(db, jwtService);

      const invalidPayloads: {
        body: Record<string, unknown>;
        field: string;
      }[] = [
        { body: { phone: "" }, field: "phone" },
        { body: { phone: "+84912345678" }, field: "phone" },
        { body: { phone: "0281234567" }, field: "phone" },
        { body: { fullName: "" }, field: "fullName" },
        { body: { fullName: "   " }, field: "fullName" },
        { body: { fullName: "<script>alert(1)</script>" }, field: "fullName" },
        { body: { fullName: "a".repeat(101) }, field: "fullName" },
      ];

      for (const testCase of invalidPayloads) {
        const res = await request(getHttpServer())
          .patch("/api/v1/users/me")
          .set(authHeader)
          .send(testCase.body);

        expect(res.status).toBe(400);
        const error = res.body as Rfc9457Error;
        expect(error.code).toBe(API_ERROR_CODES.VALIDATION_FAILED);
        expect(
          error.invalidParams?.some(
            (param) =>
              param.name === testCase.field &&
              param.code === API_ERROR_CODES.CUSTOM_VALIDATION_ERROR,
          ),
        ).toBe(true);
      }
    });

    // Invariant: INV-PROFILE-3
    it("rejects every protected or unrecognized field in the payload", async () => {
      const { user, authHeader } = await createAuthenticatedUser(
        db,
        jwtService,
      );

      const protectedPayloads: {
        field: string;
        value: unknown;
      }[] = [
        { field: "id", value: user.id },
        { field: "email", value: "hijack@greenroots.farm" },
        { field: "role", value: UserRole.SUPER_ADMIN },
        { field: "status", value: UserStatus.SUSPENDED },
        { field: "rewardPoints", value: 9999 },
        { field: "emailVerified", value: false },
        { field: "createdAt", value: "2025-01-01T00:00:00.000Z" },
        { field: "updatedAt", value: "2025-01-01T00:00:00.000Z" },
      ];

      for (const testCase of protectedPayloads) {
        const res = await request(getHttpServer())
          .patch("/api/v1/users/me")
          .set(authHeader)
          .send({ [testCase.field]: testCase.value });

        expect(res.status).toBe(400);
        const error = res.body as Rfc9457Error;
        expect(error.code).toBe(API_ERROR_CODES.VALIDATION_FAILED);
        expect(
          error.invalidParams?.some(
            (param) =>
              param.name === testCase.field &&
              param.code === API_ERROR_CODES.UNRECOGNIZED_KEYS,
          ),
        ).toBe(true);
      }
    });

    // Invariant: INV-PROFILE-8
    it("rejects profile updates for a soft-deleted user", async () => {
      const { user, authHeader } = await createAuthenticatedUser(
        db,
        jwtService,
      );

      await db
        .update(users)
        .set({ deletedAt: new Date() })
        .where(eq(users.id, user.id));

      const res = await request(getHttpServer())
        .patch("/api/v1/users/me")
        .set(authHeader)
        .send({ fullName: "Ghost Update" });

      expect(res.status).toBe(401);
      const error = res.body as Rfc9457Error;
      expect(error.code).toBe(API_ERROR_CODES.AUTH_TOKEN_INVALID_OR_EXPIRED);
    });

    it("updates the profile for a suspended user with a valid access token", async () => {
      const { user, authHeader } = await createAuthenticatedUser(
        db,
        jwtService,
        {
          fullName: "Suspended User",
          status: UserStatus.SUSPENDED,
        },
      );

      const res = await request(getHttpServer())
        .patch("/api/v1/users/me")
        .set(authHeader)
        .send({ fullName: "Suspended Updated" });

      expect(res.status).toBe(200);
      const body = res.body as ApiResponseEnvelope<UserProfile>;
      expect(body.data.id).toBe(user.id);
      expect(body.data.status).toBe(UserStatus.SUSPENDED);
      expect(body.data.fullName).toBe("Suspended Updated");
    });

    // Invariant: INV-PROFILE-2
    it("isolates updates to the authenticated subject without affecting other users", async () => {
      const userA = await createAuthenticatedUser(db, jwtService, {
        fullName: "User Alpha",
        phone: "0911111111",
      });
      const userB = await createAuthenticatedUser(db, jwtService, {
        fullName: "User Beta",
        phone: "0922222222",
      });

      const res = await request(getHttpServer())
        .patch("/api/v1/users/me")
        .set(userA.authHeader)
        .send({ fullName: "User Alpha Updated", phone: "0933333333" });

      expect(res.status).toBe(200);

      const [rowA] = await db
        .select()
        .from(users)
        .where(eq(users.id, userA.user.id))
        .limit(1);
      const [rowB] = await db
        .select()
        .from(users)
        .where(eq(users.id, userB.user.id))
        .limit(1);

      expect(rowA?.fullName).toBe("User Alpha Updated");
      expect(rowA?.phone).toBe("0933333333");
      expect(rowB?.fullName).toBe("User Beta");
      expect(rowB?.phone).toBe("0922222222");
    });

    // Invariant: INV-PROFILE-9
    it("keeps independent values when two users update concurrently", async () => {
      const userA = await createAuthenticatedUser(db, jwtService, {
        fullName: "Concurrent A",
        phone: "0911111111",
      });
      const userB = await createAuthenticatedUser(db, jwtService, {
        fullName: "Concurrent B",
        phone: "0922222222",
      });

      const [resA, resB] = await Promise.all([
        request(getHttpServer())
          .patch("/api/v1/users/me")
          .set(userA.authHeader)
          .send({ fullName: "Final A", phone: "0988888881" }),
        request(getHttpServer())
          .patch("/api/v1/users/me")
          .set(userB.authHeader)
          .send({ fullName: "Final B", phone: null }),
      ]);

      expect(resA.status).toBe(200);
      expect(resB.status).toBe(200);

      const [rowA] = await db
        .select()
        .from(users)
        .where(eq(users.id, userA.user.id))
        .limit(1);
      const [rowB] = await db
        .select()
        .from(users)
        .where(eq(users.id, userB.user.id))
        .limit(1);

      expect(rowA?.fullName).toBe("Final A");
      expect(rowA?.phone).toBe("0988888881");
      expect(rowB?.fullName).toBe("Final B");
      expect(rowB?.phone).toBeNull();
    });

    // Invariant: INV-PROFILE-9
    it("converges per-column when the same user sends concurrent partial updates", async () => {
      const { user, authHeader } = await createAuthenticatedUser(
        db,
        jwtService,
        {
          fullName: "Initial Name",
          phone: "0911111111",
        },
      );

      const [resName, resPhone] = await Promise.all([
        request(getHttpServer())
          .patch("/api/v1/users/me")
          .set(authHeader)
          .send({ fullName: "Concurrent Name" }),
        request(getHttpServer())
          .patch("/api/v1/users/me")
          .set(authHeader)
          .send({ phone: "0999999999" }),
      ]);

      expect(resName.status).toBe(200);
      expect(resPhone.status).toBe(200);

      const [persisted] = await db
        .select()
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);

      expect(persisted?.fullName).toBe("Concurrent Name");
      expect(persisted?.phone).toBe("0999999999");
    });
  });
});
