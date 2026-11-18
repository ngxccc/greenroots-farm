import {
  describe,
  expect,
  it,
  beforeAll,
  beforeEach,
  afterAll,
} from "bun:test";
import request from "supertest";
import { type INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Server } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  createTestApp,
  teardownTestApp,
  type TestAppSetup,
} from "../helpers/app.helper";
import { truncateAllTables } from "@/database/utils/truncate.util";
import type { DrizzleDB } from "@/database/database.module";
import { users, refreshTokens, type User } from "@/database/schemas";
import { UserRole, UserStatus, API_ERROR_CODES } from "@greenroots/shared";
import { MESSAGES } from "@/common/constants/messages.constant";
import {
  hashPassword,
  verifyPassword,
  sha256,
} from "@/common/utils/crypto.util";
import {
  captureMailTokens,
  generateTestToken,
  type CapturedMailTokens,
} from "../helpers/auth.helper";
import { RedisService } from "@/common/services/redis.service";
import type { Redis } from "ioredis";

// Standard response envelope types
interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
}

interface LoginData {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    status: string;
  };
}

interface RefreshData {
  accessToken: string;
  refreshToken: string;
}

interface Rfc9457Error {
  type: string;
  title: string;
  status: number;
  code?: string;
  detail: string;
  instance: string;
  invalidParams?: { name: string; reason: string; code?: string }[];
}

describe("Authentication Integration", () => {
  let setup: TestAppSetup;
  let app: INestApplication;
  let db: DrizzleDB;
  let redisClient: Redis;
  let jwtService: JwtService;
  let mailTokens: CapturedMailTokens;

  const getHttpServer = (): Server => app.getHttpServer() as Server;

  beforeAll(async () => {
    setup = await createTestApp();
    app = setup.app;
    db = setup.db;
    redisClient = app.get(RedisService).getClient();
    jwtService = app.get(JwtService);
    mailTokens = captureMailTokens(app);
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(setup);
  });

  beforeEach(async () => {
    await truncateAllTables(db, setup.workerSchema);
    mailTokens.clear();
    const keys = await redisClient.keys("auth:revoked:*");
    if (keys.length > 0) {
      await redisClient.del(...keys);
    }
  }, 15000);

  // Helper function to seed an active, email-verified user
  async function seedVerifiedUser(
    email: string,
    password = "Password123!",
    overrides: Partial<typeof users.$inferInsert> = {},
  ): Promise<User> {
    const hashedPassword = await hashPassword(password);
    const [user] = await db
      .insert(users)
      .values({
        email: email.toLowerCase().trim(),
        fullName: "Test Verified User",
        phone: "0912345678",
        password: hashedPassword,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerified: true,
        ...overrides,
      })
      .returning();
    if (!user) throw new Error("Failed to seed verified user");
    return user;
  }

  // Helper function to seed an unverified user with verification token
  async function seedUnverifiedUser(
    email: string,
    password = "Password123!",
    rawVerificationToken?: string,
  ): Promise<{ user: User; rawToken: string }> {
    const hashedPassword = await hashPassword(password);
    const rawToken = rawVerificationToken ?? randomBytes(32).toString("hex");
    const [user] = await db
      .insert(users)
      .values({
        email: email.toLowerCase().trim(),
        fullName: "Test Unverified User",
        phone: "0912345678",
        password: hashedPassword,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerified: false,
        verificationToken: sha256(rawToken),
        verificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
      .returning();
    if (!user) throw new Error("Failed to seed unverified user");
    return { user, rawToken };
  }

  // Helper to seed a refresh token record
  async function seedRefreshTokenRecord(
    userId: string,
    rawRefreshToken: string,
    expiresInMs = 7 * 24 * 60 * 60 * 1000,
  ) {
    await db.insert(refreshTokens).values({
      userId,
      token: sha256(rawRefreshToken),
      deviceName: "Mozilla/5.0 Test Suite",
      ipAddress: "127.0.0.1",
      expiresAt: new Date(Date.now() + expiresInMs),
    });
  }

  // =========================================================================
  // TIER 1: Feature Coverage (Category-Partition) — 45 Test Cases
  // =========================================================================
  describe("Core Endpoint Lifecycle", () => {
    // 1. POST /api/v1/auth/register (5 tests)
    describe("POST /api/v1/auth/register", () => {
      it("registers customer with valid fields", async () => {
        const payload = {
          email: "farmer.bob@greenroots.farm",
          fullName: "Farmer Bob",
          phoneNumber: "0912345678",
          password: "SecurePassword123!",
          confirmPassword: "SecurePassword123!",
          agreeTerms: true,
        };

        const res = await request(getHttpServer())
          .post("/api/v1/auth/register")
          .send(payload);

        expect(res.status).toBe(201);
        const body = res.body as ApiResponse<null>;
        expect(body.success).toBe(true);
        expect(body.data).toBeNull();
      });

      it("persists user record with active status, customer role and unverified flag", async () => {
        const email = "active.unverified@greenroots.farm";
        const res = await request(getHttpServer())
          .post("/api/v1/auth/register")
          .send({
            email,
            fullName: "Nguyen Van An",
            phoneNumber: "0912345678",
            password: "SecurePassword123!",
            confirmPassword: "SecurePassword123!",
            agreeTerms: true,
          });

        expect(res.status).toBe(201);

        const [createdUser] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        expect(createdUser).toBeDefined();
        expect(createdUser?.status).toBe(UserStatus.ACTIVE);
        expect(createdUser?.role).toBe(UserRole.CUSTOMER);
        expect(createdUser?.emailVerified).toBe(false);
        expect(createdUser?.password).toMatch(
          /^s1\$[0-9a-f]{32}\$[0-9a-f]{128}$/,
        );
      });

      it("stores SHA-256 verification token digest with ~24h expiration in database", async () => {
        const email = "token.check@greenroots.farm";
        const before = Date.now();
        await request(getHttpServer()).post("/api/v1/auth/register").send({
          email,
          fullName: "Token Checker",
          phoneNumber: "0912345678",
          password: "SecurePassword123!",
          confirmPassword: "SecurePassword123!",
          agreeTerms: true,
        });

        const [createdUser] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        expect(createdUser?.verificationToken).toMatch(/^[0-9a-f]{64}$/);
        expect(createdUser?.verificationExpiresAt).toBeDefined();
        const expiresAt = createdUser!.verificationExpiresAt!.getTime();
        expect(expiresAt).toBeGreaterThan(before + 23 * 3600 * 1000);
        expect(expiresAt).toBeLessThanOrEqual(before + 25 * 3600 * 1000);
      });

      it("enqueues verification email job with raw token via MailService", async () => {
        const email = "email.queue@greenroots.farm";
        const fullName = "Queue Receiver";
        await request(getHttpServer()).post("/api/v1/auth/register").send({
          email,
          fullName,
          phoneNumber: "0912345678",
          password: "SecurePassword123!",
          confirmPassword: "SecurePassword123!",
          agreeTerms: true,
        });

        const capturedToken = mailTokens.getLatestVerificationToken(email);
        expect(capturedToken).toBeDefined();
        expect(capturedToken).toMatch(/^[0-9a-f]{64}$/);

        // Verify that the hash in the DB matches sha256(capturedToken)
        const [createdUser] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        expect(createdUser?.verificationToken).toBe(sha256(capturedToken!));
      });

      it("registers successfully when optional phone number is omitted", async () => {
        const email = "nophone@greenroots.farm";
        const res = await request(getHttpServer())
          .post("/api/v1/auth/register")
          .send({
            email,
            fullName: "No Phone Customer",
            password: "SecurePassword123!",
            confirmPassword: "SecurePassword123!",
            agreeTerms: true,
          });

        expect(res.status).toBe(201);
        const [createdUser] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        expect(createdUser).toBeDefined();
        expect(createdUser?.phone).toBeNull();
      });
    });

    // 2. POST /api/v1/auth/verify-email (5 tests)
    describe("POST /api/v1/auth/verify-email", () => {
      it("verifies email with valid 32-byte hex token", async () => {
        const { rawToken } = await seedUnverifiedUser(
          "verify.happy@greenroots.farm",
        );

        const res = await request(getHttpServer())
          .post("/api/v1/auth/verify-email")
          .send({ token: rawToken });

        expect(res.status).toBe(200);
        const body = res.body as ApiResponse<null>;
        expect(body.success).toBe(true);
        expect(body.data).toBeNull();
      });

      it("updates user record to emailVerified in database", async () => {
        const { user, rawToken } = await seedUnverifiedUser(
          "verify.db@greenroots.farm",
        );

        await request(getHttpServer())
          .post("/api/v1/auth/verify-email")
          .send({ token: rawToken });

        const [updatedUser] = await db
          .select()
          .from(users)
          .where(eq(users.id, user.id))
          .limit(1);

        expect(updatedUser?.emailVerified).toBe(true);
      });

      it("clears verification token and expiration upon verification", async () => {
        const { user, rawToken } = await seedUnverifiedUser(
          "verify.clear@greenroots.farm",
        );

        await request(getHttpServer())
          .post("/api/v1/auth/verify-email")
          .send({ token: rawToken });

        const [updatedUser] = await db
          .select()
          .from(users)
          .where(eq(users.id, user.id))
          .limit(1);

        expect(updatedUser?.verificationToken).toBeNull();
        expect(updatedUser?.verificationExpiresAt).toBeNull();
      });

      it("allows user to log in after email verification", async () => {
        const email = "verify.then.login@greenroots.farm";
        const password = "Password123!";
        const { rawToken } = await seedUnverifiedUser(email, password);

        // Verify email
        const verifyRes = await request(getHttpServer())
          .post("/api/v1/auth/verify-email")
          .send({ token: rawToken });
        expect(verifyRes.status).toBe(200);

        // Login now succeeds
        const loginRes = await request(getHttpServer())
          .post("/api/v1/auth/login")
          .send({ email, password });

        expect(loginRes.status).toBe(200);
        const body = loginRes.body as ApiResponse<LoginData>;
        expect(body.success).toBe(true);
        expect(body.data.accessToken).toBeTypeOf("string");
      });

      it("rejects re-submitting already consumed verification token", async () => {
        const { rawToken } = await seedUnverifiedUser(
          "verify.reused@greenroots.farm",
        );

        // First verification
        const firstRes = await request(getHttpServer())
          .post("/api/v1/auth/verify-email")
          .send({ token: rawToken });
        expect(firstRes.status).toBe(200);

        // Second verification with identical token fails
        const secondRes = await request(getHttpServer())
          .post("/api/v1/auth/verify-email")
          .send({ token: rawToken });

        expect(secondRes.status).toBe(400);
        const errorBody = secondRes.body as Rfc9457Error;
        expect(errorBody.code).toBe(
          API_ERROR_CODES.AUTH_VERIFICATION_TOKEN_INVALID,
        );
      });
    });

    // 3. POST /api/v1/auth/resend-verification (5 tests)
    describe("POST /api/v1/auth/resend-verification", () => {
      it("resends verification for unverified user", async () => {
        const email = "resend.happy@greenroots.farm";
        await seedUnverifiedUser(email);

        const res = await request(getHttpServer())
          .post("/api/v1/auth/resend-verification")
          .send({ email });

        expect(res.status).toBe(200);
        const body = res.body as ApiResponse<null>;
        expect(body.success).toBe(true);
        expect(body.data).toBeNull();
      });

      it("updates database with fresh verification token hash", async () => {
        const email = "resend.fresh@greenroots.farm";
        const { user } = await seedUnverifiedUser(email);
        const initialTokenHash = user.verificationToken;

        // Advance simulated time past 60s cooldown if needed
        await db
          .update(users)
          .set({
            verificationExpiresAt: new Date(Date.now() + 23 * 3600 * 1000), // set back to bypass 60s cooldown
          })
          .where(eq(users.id, user.id));

        await request(getHttpServer())
          .post("/api/v1/auth/resend-verification")
          .send({ email });

        const [updatedUser] = await db
          .select()
          .from(users)
          .where(eq(users.id, user.id))
          .limit(1);

        expect(updatedUser?.verificationToken).not.toBe(initialTokenHash);
        expect(updatedUser?.verificationToken).toMatch(/^[0-9a-f]{64}$/);
      });

      it("enqueues activation email via MailService", async () => {
        const email = "resend.mail@greenroots.farm";
        const { user } = await seedUnverifiedUser(email);
        mailTokens.clear();

        await db
          .update(users)
          .set({
            verificationExpiresAt: new Date(Date.now() + 23 * 3600 * 1000),
          })
          .where(eq(users.id, user.id));

        await request(getHttpServer())
          .post("/api/v1/auth/resend-verification")
          .send({ email });

        const capturedToken = mailTokens.getLatestVerificationToken(email);
        expect(capturedToken).toBeDefined();
        expect(capturedToken).toMatch(/^[0-9a-f]{64}$/);
      });

      it("verifies user using newly issued verification token", async () => {
        const email = "resend.activate@greenroots.farm";
        const { user } = await seedUnverifiedUser(email);
        mailTokens.clear();

        await db
          .update(users)
          .set({
            verificationExpiresAt: new Date(Date.now() + 23 * 3600 * 1000),
          })
          .where(eq(users.id, user.id));

        await request(getHttpServer())
          .post("/api/v1/auth/resend-verification")
          .send({ email });

        const newToken = mailTokens.getLatestVerificationToken(email)!;
        const verifyRes = await request(getHttpServer())
          .post("/api/v1/auth/verify-email")
          .send({ token: newToken });

        expect(verifyRes.status).toBe(200);

        const [verifiedUser] = await db
          .select()
          .from(users)
          .where(eq(users.id, user.id))
          .limit(1);

        expect(verifiedUser?.emailVerified).toBe(true);
      });

      it("invalidates previous verification token when new token is issued", async () => {
        const email = "resend.invalidate.old@greenroots.farm";
        const { user, rawToken: oldToken } = await seedUnverifiedUser(email);
        mailTokens.clear();

        await db
          .update(users)
          .set({
            verificationExpiresAt: new Date(Date.now() + 23 * 3600 * 1000),
          })
          .where(eq(users.id, user.id));

        await request(getHttpServer())
          .post("/api/v1/auth/resend-verification")
          .send({ email });

        // Old token should now be rejected
        const oldVerifyRes = await request(getHttpServer())
          .post("/api/v1/auth/verify-email")
          .send({ token: oldToken });

        expect(oldVerifyRes.status).toBe(400);
        const errorBody = oldVerifyRes.body as Rfc9457Error;
        expect(errorBody.code).toBe(
          API_ERROR_CODES.AUTH_VERIFICATION_TOKEN_INVALID,
        );
      });
    });

    // 4. POST /api/v1/auth/login (5 tests)
    describe("POST /api/v1/auth/login", () => {
      it("logs in with valid verified credentials", async () => {
        const email = "login.success@greenroots.farm";
        const password = "Password123!";
        await seedVerifiedUser(email, password);

        const res = await request(getHttpServer())
          .post("/api/v1/auth/login")
          .send({ email, password });

        expect(res.status).toBe(200);
        const body = res.body as ApiResponse<LoginData>;
        expect(body.success).toBe(true);
        expect(body.data.accessToken).toBeTypeOf("string");
        expect(body.data.refreshToken).toBeTypeOf("string");
        expect(body.data.user.email).toBe(email);
        expect(body.data.user.role).toBe(UserRole.CUSTOMER);
        expect(body.data.user.status).toBe(UserStatus.ACTIVE);
      });

      it("issues JWT access token with correct claims", async () => {
        const email = "login.claims@greenroots.farm";
        const password = "Password123!";
        const user = await seedVerifiedUser(email, password);

        const res = await request(getHttpServer())
          .post("/api/v1/auth/login")
          .send({ email, password });

        const { accessToken } = (res.body as ApiResponse<LoginData>).data;
        const decoded = jwtService.decode<{
          sub: string;
          email: string;
          role: string;
          jti: string;
          exp: number;
          iat: number;
        }>(accessToken);

        expect(decoded.sub).toBe(user.id);
        expect(decoded.email).toBe(email);
        expect(decoded.role).toBe(UserRole.CUSTOMER);
        expect(decoded.jti).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
        expect(decoded.exp - decoded.iat).toBe(900); // 15 minutes TTL
      });

      it("persists refresh token in database with ~7-day expiration", async () => {
        const email = "login.dbtoken@greenroots.farm";
        const password = "Password123!";
        const user = await seedVerifiedUser(email, password);
        const before = Date.now();

        const res = await request(getHttpServer())
          .post("/api/v1/auth/login")
          .send({ email, password });

        const { refreshToken } = (res.body as ApiResponse<LoginData>).data;
        const hashedIncoming = sha256(refreshToken);

        const [storedToken] = await db
          .select()
          .from(refreshTokens)
          .where(eq(refreshTokens.token, hashedIncoming))
          .limit(1);

        expect(storedToken).toBeDefined();
        expect(storedToken?.userId).toBe(user.id);
        const expiresAt = storedToken!.expiresAt.getTime();
        expect(expiresAt).toBeGreaterThan(before + 6 * 86400 * 1000);
        expect(expiresAt).toBeLessThanOrEqual(before + 8 * 86400 * 1000);
      });

      it("captures client deviceName and ipAddress in refresh token record", async () => {
        const email = "login.metadata@greenroots.farm";
        const password = "Password123!";
        await seedVerifiedUser(email, password);

        const res = await request(getHttpServer())
          .post("/api/v1/auth/login")
          .set("User-Agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")
          .set("X-Forwarded-For", "203.0.113.195")
          .send({ email, password });

        const { refreshToken } = (res.body as ApiResponse<LoginData>).data;
        const [storedToken] = await db
          .select()
          .from(refreshTokens)
          .where(eq(refreshTokens.token, sha256(refreshToken)))
          .limit(1);

        expect(storedToken?.deviceName).toContain("iPhone");
        expect(storedToken?.ipAddress).toBe("203.0.113.195");
      });

      it("allows access to protected endpoints using issued access token", async () => {
        const email = "login.authguard@greenroots.farm";
        const password = "Password123!";
        await seedVerifiedUser(email, password);

        const loginRes = await request(getHttpServer())
          .post("/api/v1/auth/login")
          .send({ email, password });

        const { accessToken } = (loginRes.body as ApiResponse<LoginData>).data;

        // Test accessing protected endpoint POST /api/v1/auth/logout-all
        const protectedRes = await request(getHttpServer())
          .post("/api/v1/auth/logout-all")
          .set("Authorization", `Bearer ${accessToken}`);

        expect(protectedRes.status).toBe(200);
      });
    });

    // 5. POST /api/v1/auth/refresh (5 tests)
    describe("POST /api/v1/auth/refresh", () => {
      it("rotates refresh token and issues new token pair", async () => {
        const user = await seedVerifiedUser("refresh.happy@greenroots.farm");
        const initialRawRefreshToken = randomBytes(32).toString("hex");
        await seedRefreshTokenRecord(user.id, initialRawRefreshToken);

        const res = await request(getHttpServer())
          .post("/api/v1/auth/refresh")
          .send({ refreshToken: initialRawRefreshToken });

        expect(res.status).toBe(200);
        const body = res.body as ApiResponse<RefreshData>;
        expect(body.success).toBe(true);
        expect(body.data.accessToken).toBeTypeOf("string");
        expect(body.data.refreshToken).toBeTypeOf("string");
        expect(body.data.refreshToken).not.toBe(initialRawRefreshToken);
      });

      it("atomically deletes consumed refresh token from database", async () => {
        const user = await seedVerifiedUser("refresh.atomic@greenroots.farm");
        const initialRawRefreshToken = randomBytes(32).toString("hex");
        await seedRefreshTokenRecord(user.id, initialRawRefreshToken);

        await request(getHttpServer())
          .post("/api/v1/auth/refresh")
          .send({ refreshToken: initialRawRefreshToken });

        const [consumedToken] = await db
          .select()
          .from(refreshTokens)
          .where(eq(refreshTokens.token, sha256(initialRawRefreshToken)))
          .limit(1);

        expect(consumedToken).toBeUndefined();
      });

      it("persists new refresh token in database with ~7-day TTL", async () => {
        const user = await seedVerifiedUser("refresh.ttl@greenroots.farm");
        const initialRawRefreshToken = randomBytes(32).toString("hex");
        await seedRefreshTokenRecord(user.id, initialRawRefreshToken);
        const before = Date.now();

        const res = await request(getHttpServer())
          .post("/api/v1/auth/refresh")
          .send({ refreshToken: initialRawRefreshToken });

        const { refreshToken: newRefreshToken } = (
          res.body as ApiResponse<RefreshData>
        ).data;
        const [persistedToken] = await db
          .select()
          .from(refreshTokens)
          .where(eq(refreshTokens.token, sha256(newRefreshToken)))
          .limit(1);

        expect(persistedToken).toBeDefined();
        expect(persistedToken?.userId).toBe(user.id);
        const expiresAt = persistedToken!.expiresAt.getTime();
        expect(expiresAt).toBeGreaterThan(before + 6 * 86400 * 1000);
      });

      it("issues new access token with distinct jti claim", async () => {
        const user = await seedVerifiedUser("refresh.jti@greenroots.farm");
        const initialRawRefreshToken = randomBytes(32).toString("hex");
        await seedRefreshTokenRecord(user.id, initialRawRefreshToken);

        const initialAccessToken = await generateTestToken(jwtService, {
          sub: user.id,
          email: user.email,
          role: user.role,
        });
        const initialDecoded = jwtService.decode<{ jti: string }>(
          initialAccessToken,
        );

        const res = await request(getHttpServer())
          .post("/api/v1/auth/refresh")
          .send({ refreshToken: initialRawRefreshToken });

        const { accessToken: newAccessToken } = (
          res.body as ApiResponse<RefreshData>
        ).data;
        const newDecoded = jwtService.decode<{ jti: string }>(newAccessToken);

        expect(newDecoded.jti).toBeDefined();
        expect(newDecoded.jti).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
        expect(newDecoded.jti).not.toBe(initialDecoded.jti);
      });

      it("supports chained rotation using newly issued refresh token", async () => {
        const user = await seedVerifiedUser("refresh.chain@greenroots.farm");
        const r1 = randomBytes(32).toString("hex");
        await seedRefreshTokenRecord(user.id, r1);

        // First rotation: R1 -> R2
        const res1 = await request(getHttpServer())
          .post("/api/v1/auth/refresh")
          .send({ refreshToken: r1 });
        expect(res1.status).toBe(200);
        const r2 = (res1.body as ApiResponse<RefreshData>).data.refreshToken;

        // Second rotation: R2 -> R3
        const res2 = await request(getHttpServer())
          .post("/api/v1/auth/refresh")
          .send({ refreshToken: r2 });
        expect(res2.status).toBe(200);
        const r3 = (res2.body as ApiResponse<RefreshData>).data.refreshToken;

        expect(r3).not.toBe(r2);
        expect(r3).not.toBe(r1);
      });
    });

    // 6. POST /api/v1/auth/logout (5 tests)
    describe("POST /api/v1/auth/logout", () => {
      it("performs single logout with valid refresh and access token", async () => {
        const user = await seedVerifiedUser("logout.happy@greenroots.farm");
        const rawRefreshToken = randomBytes(32).toString("hex");
        await seedRefreshTokenRecord(user.id, rawRefreshToken);

        const accessToken = await generateTestToken(jwtService, {
          sub: user.id,
          email: user.email,
          role: user.role,
        });

        const res = await request(getHttpServer())
          .post("/api/v1/auth/logout")
          .set("Authorization", `Bearer ${accessToken}`)
          .send({ refreshToken: rawRefreshToken });

        expect(res.status).toBe(200);
        const body = res.body as ApiResponse<null>;
        expect(body.success).toBe(true);
        expect(body.data).toBeNull();
      });

      it("deletes specific refresh token from database", async () => {
        const user = await seedVerifiedUser("logout.deletedb@greenroots.farm");
        const rawRefreshToken = randomBytes(32).toString("hex");
        await seedRefreshTokenRecord(user.id, rawRefreshToken);

        await request(getHttpServer())
          .post("/api/v1/auth/logout")
          .send({ refreshToken: rawRefreshToken });

        const [deleted] = await db
          .select()
          .from(refreshTokens)
          .where(eq(refreshTokens.token, sha256(rawRefreshToken)))
          .limit(1);

        expect(deleted).toBeUndefined();
      });

      it("blacklists access token in Redis with remaining TTL", async () => {
        const user = await seedVerifiedUser("logout.redis@greenroots.farm");
        const rawRefreshToken = randomBytes(32).toString("hex");
        await seedRefreshTokenRecord(user.id, rawRefreshToken);

        const jti = randomUUID();
        const accessToken = await generateTestToken(jwtService, {
          sub: user.id,
          email: user.email,
          role: user.role,
          jti,
        });

        await request(getHttpServer())
          .post("/api/v1/auth/logout")
          .set("Authorization", `Bearer ${accessToken}`)
          .send({ refreshToken: rawRefreshToken });

        const isRevoked = await redisClient.get(`auth:revoked:token:${jti}`);
        expect(isRevoked).toBe("1");
      });

      it("rejects blacklisted access token on subsequent requests", async () => {
        const user = await seedVerifiedUser("logout.blacklist@greenroots.farm");
        const rawRefreshToken = randomBytes(32).toString("hex");
        await seedRefreshTokenRecord(user.id, rawRefreshToken);

        const accessToken = await generateTestToken(jwtService, {
          sub: user.id,
          email: user.email,
          role: user.role,
        });

        // Logout
        await request(getHttpServer())
          .post("/api/v1/auth/logout")
          .set("Authorization", `Bearer ${accessToken}`)
          .send({ refreshToken: rawRefreshToken });

        // Protected request with same token fails
        const protectedRes = await request(getHttpServer())
          .post("/api/v1/auth/logout-all")
          .set("Authorization", `Bearer ${accessToken}`);

        expect(protectedRes.status).toBe(401);
        const error = protectedRes.body as Rfc9457Error;
        expect(error.detail).toContain(MESSAGES.AUTH.TOKEN_REVOKED);
      });

      it("deletes refresh token even when Authorization header is omitted", async () => {
        const user = await seedVerifiedUser("logout.noauth@greenroots.farm");
        const rawRefreshToken = randomBytes(32).toString("hex");
        await seedRefreshTokenRecord(user.id, rawRefreshToken);

        const res = await request(getHttpServer())
          .post("/api/v1/auth/logout")
          .send({ refreshToken: rawRefreshToken });

        expect(res.status).toBe(200);

        const [deleted] = await db
          .select()
          .from(refreshTokens)
          .where(eq(refreshTokens.token, sha256(rawRefreshToken)))
          .limit(1);

        expect(deleted).toBeUndefined();
      });
    });

    // 7. POST /api/v1/auth/logout-all (5 tests)
    describe("POST /api/v1/auth/logout-all", () => {
      it("performs global logout with valid Bearer token", async () => {
        const user = await seedVerifiedUser("logoutall.happy@greenroots.farm");
        const accessToken = await generateTestToken(jwtService, {
          sub: user.id,
          email: user.email,
          role: user.role,
        });

        const res = await request(getHttpServer())
          .post("/api/v1/auth/logout-all")
          .set("Authorization", `Bearer ${accessToken}`);

        expect(res.status).toBe(200);
        const body = res.body as ApiResponse<null>;
        expect(body.success).toBe(true);
        expect(body.data).toBeNull();
      });

      it("deletes all refresh tokens for user from database", async () => {
        const user = await seedVerifiedUser("logoutall.purge@greenroots.farm");
        await seedRefreshTokenRecord(user.id, randomBytes(32).toString("hex"));
        await seedRefreshTokenRecord(user.id, randomBytes(32).toString("hex"));
        await seedRefreshTokenRecord(user.id, randomBytes(32).toString("hex"));

        const accessToken = await generateTestToken(jwtService, {
          sub: user.id,
          email: user.email,
          role: user.role,
        });

        await request(getHttpServer())
          .post("/api/v1/auth/logout-all")
          .set("Authorization", `Bearer ${accessToken}`);

        const remaining = await db
          .select()
          .from(refreshTokens)
          .where(eq(refreshTokens.userId, user.id));

        expect(remaining.length).toBe(0);
      });

      it("sets user revocation key in Redis with ~15-minute TTL", async () => {
        const user = await seedVerifiedUser("logoutall.redis@greenroots.farm");
        const accessToken = await generateTestToken(jwtService, {
          sub: user.id,
          email: user.email,
          role: user.role,
        });

        await request(getHttpServer())
          .post("/api/v1/auth/logout-all")
          .set("Authorization", `Bearer ${accessToken}`);

        const isRevoked = await redisClient.get(`auth:revoked:user:${user.id}`);
        expect(isRevoked).toBe("1");

        const ttl = await redisClient.ttl(`auth:revoked:user:${user.id}`);
        expect(ttl).toBeGreaterThan(800);
        expect(ttl).toBeLessThanOrEqual(900);
      });

      it("rejects caller access token on subsequent requests", async () => {
        const user = await seedVerifiedUser("logoutall.caller@greenroots.farm");
        const accessToken = await generateTestToken(jwtService, {
          sub: user.id,
          email: user.email,
          role: user.role,
        });

        await request(getHttpServer())
          .post("/api/v1/auth/logout-all")
          .set("Authorization", `Bearer ${accessToken}`);

        const secondRes = await request(getHttpServer())
          .post("/api/v1/auth/logout-all")
          .set("Authorization", `Bearer ${accessToken}`);

        expect(secondRes.status).toBe(401);
        const error = secondRes.body as Rfc9457Error;
        expect(error.status).toBe(401);
        expect(error.detail).toContain(MESSAGES.AUTH.TOKEN_REVOKED);
      });

      it("rejects concurrent device access tokens for same user immediately", async () => {
        const user = await seedVerifiedUser(
          "logoutall.concurrent@greenroots.farm",
        );
        const tokenDeviceA = await generateTestToken(jwtService, {
          sub: user.id,
          email: user.email,
          role: user.role,
        });
        const tokenDeviceB = await generateTestToken(jwtService, {
          sub: user.id,
          email: user.email,
          role: user.role,
        });

        // Device A logs out all
        await request(getHttpServer())
          .post("/api/v1/auth/logout-all")
          .set("Authorization", `Bearer ${tokenDeviceA}`);

        // Device B token is also dead immediately
        const deviceBRes = await request(getHttpServer())
          .post("/api/v1/auth/logout-all")
          .set("Authorization", `Bearer ${tokenDeviceB}`);

        expect(deviceBRes.status).toBe(401);
        const error = deviceBRes.body as Rfc9457Error;
        expect(error.status).toBe(401);
        expect(error.detail).toContain(MESSAGES.AUTH.TOKEN_REVOKED);
      });
    });

    // 8. POST /api/v1/auth/forgot-password (5 tests)
    describe("POST /api/v1/auth/forgot-password", () => {
      it("returns success for valid registered email", async () => {
        const email = "forgot.happy@greenroots.farm";
        await seedVerifiedUser(email);

        const res = await request(getHttpServer())
          .post("/api/v1/auth/forgot-password")
          .send({ email });

        expect(res.status).toBe(200);
        const body = res.body as ApiResponse<null>;
        expect(body.success).toBe(true);
        expect(body.data).toBeNull();
      });

      it("generates reset password token hash in users table", async () => {
        const email = "forgot.tokenhash@greenroots.farm";
        const user = await seedVerifiedUser(email);

        await request(getHttpServer())
          .post("/api/v1/auth/forgot-password")
          .send({ email });

        const [updatedUser] = await db
          .select()
          .from(users)
          .where(eq(users.id, user.id))
          .limit(1);

        expect(updatedUser?.resetPasswordToken).toMatch(/^[0-9a-f]{64}$/);
      });

      it("sets reset password expiration to ~15 minutes in future", async () => {
        const email = "forgot.expires@greenroots.farm";
        const user = await seedVerifiedUser(email);
        const before = Date.now();

        await request(getHttpServer())
          .post("/api/v1/auth/forgot-password")
          .send({ email });

        const [updatedUser] = await db
          .select()
          .from(users)
          .where(eq(users.id, user.id))
          .limit(1);

        expect(updatedUser?.resetPasswordExpiresAt).toBeDefined();
        const expiresAt = updatedUser!.resetPasswordExpiresAt!.getTime();
        expect(expiresAt).toBeGreaterThan(before + 14 * 60 * 1000);
        expect(expiresAt).toBeLessThanOrEqual(before + 16 * 60 * 1000);
      });

      it("dispatches reset password email job via MailService", async () => {
        const email = "forgot.mail@greenroots.farm";
        await seedVerifiedUser(email);
        mailTokens.clear();

        await request(getHttpServer())
          .post("/api/v1/auth/forgot-password")
          .send({ email });

        const capturedToken = mailTokens.getLatestResetToken(email);
        expect(capturedToken).toBeDefined();
        expect(capturedToken).toMatch(/^[0-9a-f]{64}$/);

        const [dbUser] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        expect(dbUser?.resetPasswordToken).toBe(sha256(capturedToken!));
      });

      it("replaces existing reset token when requested again", async () => {
        const email = "forgot.replace@greenroots.farm";
        const user = await seedVerifiedUser(email);

        await request(getHttpServer())
          .post("/api/v1/auth/forgot-password")
          .send({ email });

        const [firstUser] = await db
          .select()
          .from(users)
          .where(eq(users.id, user.id))
          .limit(1);
        const firstTokenHash = firstUser?.resetPasswordToken;

        await request(getHttpServer())
          .post("/api/v1/auth/forgot-password")
          .send({ email });

        const [secondUser] = await db
          .select()
          .from(users)
          .where(eq(users.id, user.id))
          .limit(1);

        expect(secondUser?.resetPasswordToken).not.toBe(firstTokenHash);
      });
    });

    // 9. POST /api/v1/auth/reset-password (5 tests)
    describe("POST /api/v1/auth/reset-password", () => {
      it("resets password with valid token and strong password", async () => {
        const email = "reset.happy@greenroots.farm";
        const user = await seedVerifiedUser(email);
        const rawResetToken = randomBytes(32).toString("hex");

        await db
          .update(users)
          .set({
            resetPasswordToken: sha256(rawResetToken),
            resetPasswordExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
          })
          .where(eq(users.id, user.id));

        const res = await request(getHttpServer())
          .post("/api/v1/auth/reset-password")
          .send({
            token: rawResetToken,
            password: "NewPassword123!",
            confirmPassword: "NewPassword123!",
          });

        expect(res.status).toBe(200);
        const body = res.body as ApiResponse<null>;
        expect(body.success).toBe(true);
        expect(body.data).toBeNull();
      });

      it("updates database password to new Scrypt hash", async () => {
        const email = "reset.hash@greenroots.farm";
        const user = await seedVerifiedUser(email);
        const rawResetToken = randomBytes(32).toString("hex");
        const newPassword = "NewStrongPassword456!";

        await db
          .update(users)
          .set({
            resetPasswordToken: sha256(rawResetToken),
            resetPasswordExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
          })
          .where(eq(users.id, user.id));

        await request(getHttpServer())
          .post("/api/v1/auth/reset-password")
          .send({
            token: rawResetToken,
            password: newPassword,
            confirmPassword: newPassword,
          });

        const [updatedUser] = await db
          .select()
          .from(users)
          .where(eq(users.id, user.id))
          .limit(1);

        const isMatch = await verifyPassword(
          newPassword,
          updatedUser!.password,
        );
        expect(isMatch).toBe(true);
      });

      it("clears reset password token and expiry in database", async () => {
        const email = "reset.clear@greenroots.farm";
        const user = await seedVerifiedUser(email);
        const rawResetToken = randomBytes(32).toString("hex");

        await db
          .update(users)
          .set({
            resetPasswordToken: sha256(rawResetToken),
            resetPasswordExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
          })
          .where(eq(users.id, user.id));

        await request(getHttpServer())
          .post("/api/v1/auth/reset-password")
          .send({
            token: rawResetToken,
            password: "NewPassword123!",
            confirmPassword: "NewPassword123!",
          });

        const [updatedUser] = await db
          .select()
          .from(users)
          .where(eq(users.id, user.id))
          .limit(1);

        expect(updatedUser?.resetPasswordToken).toBeNull();
        expect(updatedUser?.resetPasswordExpiresAt).toBeNull();
      });

      it("allows user to log in immediately with new password", async () => {
        const email = "reset.loginnew@greenroots.farm";
        const user = await seedVerifiedUser(email, "OldPassword123!");
        const rawResetToken = randomBytes(32).toString("hex");
        const newPassword = "NewPassword123!";

        await db
          .update(users)
          .set({
            resetPasswordToken: sha256(rawResetToken),
            resetPasswordExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
          })
          .where(eq(users.id, user.id));

        await request(getHttpServer())
          .post("/api/v1/auth/reset-password")
          .send({
            token: rawResetToken,
            password: newPassword,
            confirmPassword: newPassword,
          });

        const loginRes = await request(getHttpServer())
          .post("/api/v1/auth/login")
          .send({ email, password: newPassword });

        expect(loginRes.status).toBe(200);
        const body = loginRes.body as ApiResponse<LoginData>;
        expect(body.success).toBe(true);
      });

      it("rejects login attempt with old password", async () => {
        const email = "reset.loginold@greenroots.farm";
        const oldPassword = "OldPassword123!";
        const user = await seedVerifiedUser(email, oldPassword);
        const rawResetToken = randomBytes(32).toString("hex");
        const newPassword = "NewPassword123!";

        await db
          .update(users)
          .set({
            resetPasswordToken: sha256(rawResetToken),
            resetPasswordExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
          })
          .where(eq(users.id, user.id));

        await request(getHttpServer())
          .post("/api/v1/auth/reset-password")
          .send({
            token: rawResetToken,
            password: newPassword,
            confirmPassword: newPassword,
          });

        const loginRes = await request(getHttpServer())
          .post("/api/v1/auth/login")
          .send({ email, password: oldPassword });

        expect(loginRes.status).toBe(401);
        const errorBody = loginRes.body as Rfc9457Error;
        expect(errorBody.code).toBe(API_ERROR_CODES.AUTH_INVALID_CREDENTIALS);
      });
    });
  });

  // =========================================================================
  // TIER 2: Boundary & Corner Cases (Boundary Value Analysis) — 45 Test Cases
  // =========================================================================
  describe("Boundary Validation & Sanitization", () => {
    // 1. Registration Boundaries & Sanitization (5 tests)
    describe("Registration Boundaries & Sanitization", () => {
      it("strips HTML/XSS tags and collapses whitespace in fullName", async () => {
        const email = "xss.clean@greenroots.farm";
        const res = await request(getHttpServer())
          .post("/api/v1/auth/register")
          .send({
            email,
            fullName:
              '<b>Farmer</b>   <script>alert(\'xss\')</script>   Bob   <img src="x" onerror="alert(1)">',
            phoneNumber: "0912345678",
            password: "Password123!",
            confirmPassword: "Password123!",
            agreeTerms: true,
          });

        expect(res.status).toBe(201);
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        expect(user?.fullName).toBe("Farmer Bob");
      });

      it("rejects registration when fullName is empty after tag stripping", async () => {
        const res = await request(getHttpServer())
          .post("/api/v1/auth/register")
          .send({
            email: "xss.pure@greenroots.farm",
            fullName: "<script>alert('xss')</script>",
            phoneNumber: "0912345678",
            password: "Password123!",
            confirmPassword: "Password123!",
            agreeTerms: true,
          });

        expect(res.status).toBe(400);
        const error = res.body as Rfc9457Error;
        expect(error.invalidParams?.some((p) => p.name === "fullName")).toBe(
          true,
        );

        const resImg = await request(getHttpServer())
          .post("/api/v1/auth/register")
          .send({
            email: "xss.img@greenroots.farm",
            fullName: '<img src="x" onerror="alert(1)">',
            phoneNumber: "0912345678",
            password: "Password123!",
            confirmPassword: "Password123!",
            agreeTerms: true,
          });

        expect(resImg.status).toBe(400);
        const errorImg = resImg.body as Rfc9457Error;
        expect(errorImg.invalidParams?.some((p) => p.name === "fullName")).toBe(
          true,
        );
      });

      it("safely handles SQL injection payloads in name and email", async () => {
        const email = "sqli.safe@greenroots.farm";
        const sqliName = "Admin' OR '1'='1 --";
        const res = await request(getHttpServer())
          .post("/api/v1/auth/register")
          .send({
            email,
            fullName: sqliName,
            phoneNumber: "0912345678",
            password: "Password123!",
            confirmPassword: "Password123!",
            agreeTerms: true,
          });

        expect(res.status).toBe(201);
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        expect(user?.fullName).toBe(sqliName);
      });

      it("enforces password length boundaries between 8 and 128 characters", async () => {
        // 7 chars: too short
        const shortRes = await request(getHttpServer())
          .post("/api/v1/auth/register")
          .send({
            email: "shortpass@greenroots.farm",
            fullName: "Short Pass",
            password: "Pass12!",
            confirmPassword: "Pass12!",
            agreeTerms: true,
          });
        expect(shortRes.status).toBe(400);

        // 129 chars: too long
        const longPass = `P1!${"a".repeat(126)}`;
        const longRes = await request(getHttpServer())
          .post("/api/v1/auth/register")
          .send({
            email: "longpass@greenroots.farm",
            fullName: "Long Pass",
            password: longPass,
            confirmPassword: longPass,
            agreeTerms: true,
          });
        expect(longRes.status).toBe(400);

        // 8 chars: minimum valid
        const minPass = "Passw12!";
        const validRes = await request(getHttpServer())
          .post("/api/v1/auth/register")
          .send({
            email: "minpass@greenroots.farm",
            fullName: "Min Pass",
            password: minPass,
            confirmPassword: minPass,
            agreeTerms: true,
          });
        expect(validRes.status).toBe(201);

        // 128 chars: maximum valid boundary
        const maxPass = `P1!${"a".repeat(125)}`;
        const maxRes = await request(getHttpServer())
          .post("/api/v1/auth/register")
          .send({
            email: "maxpass@greenroots.farm",
            fullName: "Max Pass",
            password: maxPass,
            confirmPassword: maxPass,
            agreeTerms: true,
          });
        expect(maxRes.status).toBe(201);
      });

      it("rejects registration on missing fields, terms declined, password mismatch, or duplicate email", async () => {
        // empty payload
        const emptyRes = await request(getHttpServer())
          .post("/api/v1/auth/register")
          .send({});
        expect(emptyRes.status).toBe(400);
        const emptyError = emptyRes.body as Rfc9457Error;
        expect(emptyError.code).toBe(API_ERROR_CODES.VALIDATION_FAILED);

        // missing password
        const missingPassRes = await request(getHttpServer())
          .post("/api/v1/auth/register")
          .send({
            email: "missingpass@greenroots.farm",
            fullName: "Missing Pass",
            agreeTerms: true,
          });
        expect(missingPassRes.status).toBe(400);
        const missingPassError = missingPassRes.body as Rfc9457Error;
        expect(missingPassError.code).toBe(API_ERROR_CODES.VALIDATION_FAILED);

        // missing email
        const missingEmailRes = await request(getHttpServer())
          .post("/api/v1/auth/register")
          .send({
            fullName: "Missing Email",
            password: "Password123!",
            confirmPassword: "Password123!",
            agreeTerms: true,
          });
        expect(missingEmailRes.status).toBe(400);
        const missingEmailError = missingEmailRes.body as Rfc9457Error;
        expect(missingEmailError.code).toBe(API_ERROR_CODES.VALIDATION_FAILED);

        // agreeTerms false
        const termsRes = await request(getHttpServer())
          .post("/api/v1/auth/register")
          .send({
            email: "noterms@greenroots.farm",
            fullName: "No Terms",
            password: "Password123!",
            confirmPassword: "Password123!",
            agreeTerms: false,
          });
        expect(termsRes.status).toBe(400);

        // confirmPassword mismatch
        const mismatchRes = await request(getHttpServer())
          .post("/api/v1/auth/register")
          .send({
            email: "mismatch@greenroots.farm",
            fullName: "Mismatch Pass",
            password: "Password123!",
            confirmPassword: "DifferentPassword123!",
            agreeTerms: true,
          });
        expect(mismatchRes.status).toBe(400);

        // duplicate email returns 409 Conflict
        const email = "dupe.boundary@greenroots.farm";
        await seedVerifiedUser(email);
        const dupeRes = await request(getHttpServer())
          .post("/api/v1/auth/register")
          .send({
            email,
            fullName: "Duplicate User",
            password: "Password123!",
            confirmPassword: "Password123!",
            agreeTerms: true,
          });
        expect(dupeRes.status).toBe(409);
        const dupeError = dupeRes.body as Rfc9457Error;
        expect(dupeError.code).toBe(API_ERROR_CODES.AUTH_EMAIL_ALREADY_EXISTS);
      });
    });

    // 2. Email Verification Boundaries (5 tests)
    describe("Email Verification Boundaries", () => {
      it("rejects expired verification token", async () => {
        const rawToken = randomBytes(32).toString("hex");
        await seedUnverifiedUser(
          "expired.ver@greenroots.farm",
          "Password123!",
          rawToken,
        );

        // Expire token in DB
        await db
          .update(users)
          .set({ verificationExpiresAt: new Date(Date.now() - 3600 * 1000) })
          .where(eq(users.verificationToken, sha256(rawToken)));

        const res = await request(getHttpServer())
          .post("/api/v1/auth/verify-email")
          .send({ token: rawToken });

        expect(res.status).toBe(400);
        const error = res.body as Rfc9457Error;
        expect(error.code).toBe(
          API_ERROR_CODES.AUTH_VERIFICATION_TOKEN_INVALID,
        );
      });

      it("rejects non-existent verification token", async () => {
        const fakeToken = "a".repeat(64);
        const res = await request(getHttpServer())
          .post("/api/v1/auth/verify-email")
          .send({ token: fakeToken });

        expect(res.status).toBe(400);
        const error = res.body as Rfc9457Error;
        expect(error.code).toBe(
          API_ERROR_CODES.AUTH_VERIFICATION_TOKEN_INVALID,
        );
      });

      it("rejects malformed or empty token", async () => {
        const res = await request(getHttpServer())
          .post("/api/v1/auth/verify-email")
          .send({ token: "" });

        expect(res.status).toBe(400);
      });

      it("rejects SQL injection token without leaking database error", async () => {
        const res = await request(getHttpServer())
          .post("/api/v1/auth/verify-email")
          .send({ token: "' OR 1=1 --" });

        expect(res.status).toBe(400);
        const error = res.body as Rfc9457Error;
        expect(error.detail).not.toContain("syntax error");
      });

      it("rejects request with missing body or unrecognized properties", async () => {
        const resMissing = await request(getHttpServer())
          .post("/api/v1/auth/verify-email")
          .send({});
        expect(resMissing.status).toBe(400);

        const { rawToken } = await seedUnverifiedUser(
          "verify.extra@greenroots.farm",
        );

        const resExtra = await request(getHttpServer())
          .post("/api/v1/auth/verify-email")
          .send({ token: rawToken, unexpectedProp: 123 });
        expect(resExtra.status).toBe(400);
        const error = resExtra.body as Rfc9457Error;
        expect(error.code).toBe(API_ERROR_CODES.VALIDATION_FAILED);
        expect(
          error.invalidParams?.some((p) => p.name === "unexpectedProp"),
        ).toBe(true);
      });
    });

    // 3. Resend Verification Boundaries (5 tests)
    describe("Resend Verification Boundaries", () => {
      it("silently succeeds without dispatching email for non-existent email", async () => {
        mailTokens.clear();
        const res = await request(getHttpServer())
          .post("/api/v1/auth/resend-verification")
          .send({ email: "nonexistent.user@greenroots.farm" });

        expect(res.status).toBe(200);
        const body = res.body as ApiResponse<null>;
        expect(body.success).toBe(true);
        expect(mailTokens.verificationTokens.length).toBe(0);
      });

      it("silently succeeds without dispatching email for already verified account", async () => {
        const email = "already.verified.resend@greenroots.farm";
        await seedVerifiedUser(email);
        mailTokens.clear();

        const res = await request(getHttpServer())
          .post("/api/v1/auth/resend-verification")
          .send({ email });

        expect(res.status).toBe(200);
        expect(mailTokens.verificationTokens.length).toBe(0);
      });

      it("rejects malformed email syntax", async () => {
        const res = await request(getHttpServer())
          .post("/api/v1/auth/resend-verification")
          .send({ email: "not-an-email" });

        expect(res.status).toBe(400);
      });

      it("normalizes mixed-case and untrimmed email addresses before lookup", async () => {
        const email = "normalize.resend@greenroots.farm";
        const { user } = await seedUnverifiedUser(email);
        mailTokens.clear();

        await db
          .update(users)
          .set({
            verificationExpiresAt: new Date(Date.now() + 23 * 3600 * 1000),
          })
          .where(eq(users.id, user.id));

        const res = await request(getHttpServer())
          .post("/api/v1/auth/resend-verification")
          .send({ email: "   NORMALIZE.RESEND@GreenRoots.Farm   " });

        expect(res.status).toBe(200);
        expect(mailTokens.verificationTokens.length).toBe(1);
      });

      it("rejects request with missing body or null email", async () => {
        const res = await request(getHttpServer())
          .post("/api/v1/auth/resend-verification")
          .send({});

        expect(res.status).toBe(400);

        const resNull = await request(getHttpServer())
          .post("/api/v1/auth/resend-verification")
          .send({ email: null });

        expect(resNull.status).toBe(400);
      });
    });

    // 4. Login Boundaries (5 tests)
    describe("Login Boundaries", () => {
      it("rejects non-existent email with generic unauthorized error", async () => {
        const res = await request(getHttpServer())
          .post("/api/v1/auth/login")
          .send({
            email: "ghost@greenroots.farm",
            password: "Password123!",
          });

        expect(res.status).toBe(401);
        const error = res.body as Rfc9457Error;
        expect(error.code).toBe(API_ERROR_CODES.AUTH_INVALID_CREDENTIALS);
      });

      it("rejects valid email with incorrect password", async () => {
        const email = "wrongpass@greenroots.farm";
        await seedVerifiedUser(email, "CorrectPassword123!");

        const res = await request(getHttpServer())
          .post("/api/v1/auth/login")
          .send({
            email,
            password: "IncorrectPassword456!",
          });

        expect(res.status).toBe(401);
        const error = res.body as Rfc9457Error;
        expect(error.code).toBe(API_ERROR_CODES.AUTH_INVALID_CREDENTIALS);
      });

      it("rejects credentials for suspended account", async () => {
        const email = "suspended@greenroots.farm";
        const password = "Password123!";
        await seedVerifiedUser(email, password, {
          status: UserStatus.SUSPENDED,
        });

        const res = await request(getHttpServer())
          .post("/api/v1/auth/login")
          .send({ email, password });

        expect(res.status).toBe(403);
        const error = res.body as Rfc9457Error;
        expect(error.code).toBe(API_ERROR_CODES.AUTH_ACCOUNT_SUSPENDED);
      });

      it("rejects credentials for unverified account", async () => {
        const email = "unverified.login@greenroots.farm";
        const password = "Password123!";
        await seedUnverifiedUser(email, password);

        const res = await request(getHttpServer())
          .post("/api/v1/auth/login")
          .send({ email, password });

        expect(res.status).toBe(403);
        const error = res.body as Rfc9457Error;
        expect(error.code).toBe(API_ERROR_CODES.AUTH_EMAIL_NOT_VERIFIED);
      });

      it("rejects oversized password payload and empty body", async () => {
        const emptyRes = await request(getHttpServer())
          .post("/api/v1/auth/login")
          .send({});
        expect(emptyRes.status).toBe(400);

        const oversizedRes = await request(getHttpServer())
          .post("/api/v1/auth/login")
          .send({
            email: "oversized@greenroots.farm",
            password: "a".repeat(10000),
          });
        expect(oversizedRes.status).toBe(400);
      });

      it("safely rejects SQL injection email payload without database error leakage", async () => {
        const res = await request(getHttpServer())
          .post("/api/v1/auth/login")
          .send({
            email: "' OR 1=1 --",
            password: "Password123!",
          });

        expect(res.status).toBe(400);
        const error = res.body as Rfc9457Error;
        expect(error.detail).not.toContain("syntax error");
      });
    });

    // 5. Refresh Boundaries (5 tests)
    describe("Refresh Boundaries", () => {
      it("rejects expired refresh token", async () => {
        const user = await seedVerifiedUser("refresh.expired@greenroots.farm");
        const rawToken = randomBytes(32).toString("hex");
        // Seed expired refresh token
        await seedRefreshTokenRecord(user.id, rawToken, -3600 * 1000);

        const res = await request(getHttpServer())
          .post("/api/v1/auth/refresh")
          .send({ refreshToken: rawToken });

        expect(res.status).toBe(401);
        const error = res.body as Rfc9457Error;
        expect(error.code).toBe(API_ERROR_CODES.AUTH_TOKEN_INVALID_OR_EXPIRED);
      });

      it("rejects non-existent or fabricated refresh token", async () => {
        const res = await request(getHttpServer())
          .post("/api/v1/auth/refresh")
          .send({ refreshToken: "f".repeat(64) });

        expect(res.status).toBe(401);
        const error = res.body as Rfc9457Error;
        expect(error.code).toBe(API_ERROR_CODES.AUTH_TOKEN_INVALID_OR_EXPIRED);
      });

      it("rejects refresh token when user is soft-deleted or suspended", async () => {
        const user = await seedVerifiedUser(
          "refresh.suspended@greenroots.farm",
          "Password123!",
          {
            status: UserStatus.SUSPENDED,
          },
        );
        const rawToken = randomBytes(32).toString("hex");
        await seedRefreshTokenRecord(user.id, rawToken);

        const res = await request(getHttpServer())
          .post("/api/v1/auth/refresh")
          .send({ refreshToken: rawToken });

        expect(res.status).toBe(401);
        const error = res.body as Rfc9457Error;
        expect([
          API_ERROR_CODES.AUTH_ACCOUNT_SUSPENDED,
          API_ERROR_CODES.AUTH_TOKEN_INVALID_OR_EXPIRED,
        ]).toContain(error.code!);
      });

      it("rejects malformed or empty refresh token", async () => {
        const res = await request(getHttpServer())
          .post("/api/v1/auth/refresh")
          .send({ refreshToken: "" });

        expect(res.status).toBe(400);
      });

      it("rejects request with missing body or empty JSON payload", async () => {
        const res = await request(getHttpServer())
          .post("/api/v1/auth/refresh")
          .send({});

        expect(res.status).toBe(400);
      });
    });

    // 6. Logout Boundaries (5 tests)
    describe("Logout Boundaries", () => {
      it("returns success idempotently when refresh token is unknown or already deleted", async () => {
        const res = await request(getHttpServer())
          .post("/api/v1/auth/logout")
          .send({ refreshToken: "e".repeat(64) });

        // Idempotent logout returns 200 OK per ADR-0016
        expect(res.status).toBe(200);
      });

      it("deletes refresh token even when Bearer token is expired", async () => {
        const user = await seedVerifiedUser(
          "logout.expiredbearer@greenroots.farm",
        );
        const rawToken = randomBytes(32).toString("hex");
        await seedRefreshTokenRecord(user.id, rawToken);

        const expiredToken = await jwtService.signAsync(
          {
            sub: user.id,
            email: user.email,
            role: user.role,
            jti: randomUUID(),
          },
          { expiresIn: -10 },
        );

        const res = await request(getHttpServer())
          .post("/api/v1/auth/logout")
          .set("Authorization", `Bearer ${expiredToken}`)
          .send({ refreshToken: rawToken });

        expect(res.status).toBe(200);

        const [deleted] = await db
          .select()
          .from(refreshTokens)
          .where(eq(refreshTokens.token, sha256(rawToken)))
          .limit(1);

        expect(deleted).toBeUndefined();
      });

      it("deletes refresh token even when Bearer token is malformed", async () => {
        const user = await seedVerifiedUser("logout.badbearer@greenroots.farm");
        const rawToken = randomBytes(32).toString("hex");
        await seedRefreshTokenRecord(user.id, rawToken);

        const res = await request(getHttpServer())
          .post("/api/v1/auth/logout")
          .set("Authorization", "Bearer not.a.valid.jwt")
          .send({ refreshToken: rawToken });

        expect(res.status).toBe(200);

        const [deleted] = await db
          .select()
          .from(refreshTokens)
          .where(eq(refreshTokens.token, sha256(rawToken)))
          .limit(1);

        expect(deleted).toBeUndefined();
      });

      it("rejects request when refreshToken field is missing", async () => {
        const res = await request(getHttpServer())
          .post("/api/v1/auth/logout")
          .send({});

        expect(res.status).toBe(400);
      });

      it("rejects request body containing unrecognized properties", async () => {
        const res = await request(getHttpServer())
          .post("/api/v1/auth/logout")
          .send({
            refreshToken: "a".repeat(64),
            unexpectedParam: "malicious",
          });

        expect(res.status).toBe(400);
      });
    });

    // 7. Logout-All Boundaries (5 tests)
    describe("Logout-All Boundaries", () => {
      it("rejects request when Authorization header is missing", async () => {
        const res = await request(getHttpServer()).post(
          "/api/v1/auth/logout-all",
        );

        expect(res.status).toBe(401);
        const error = res.body as Rfc9457Error;
        expect(error.detail).toContain(MESSAGES.AUTH.TOKEN_MISSING);
      });

      it("rejects request when Authorization scheme is not Bearer", async () => {
        const res = await request(getHttpServer())
          .post("/api/v1/auth/logout-all")
          .set("Authorization", "Basic dXNlcjpwYXNz");

        expect(res.status).toBe(401);
        const error = res.body as Rfc9457Error;
        expect(error.status).toBe(401);
        expect(error.detail).toContain(MESSAGES.AUTH.TOKEN_MISSING);
      });

      it("rejects request when Bearer token is expired", async () => {
        const user = await seedVerifiedUser("loa.expired@greenroots.farm");
        const expiredToken = await jwtService.signAsync(
          {
            sub: user.id,
            email: user.email,
            role: user.role,
            jti: randomUUID(),
          },
          { expiresIn: -10 },
        );

        const res = await request(getHttpServer())
          .post("/api/v1/auth/logout-all")
          .set("Authorization", `Bearer ${expiredToken}`);

        expect(res.status).toBe(401);
        const error = res.body as Rfc9457Error;
        expect(error.status).toBe(401);
        expect(error.detail).toContain(MESSAGES.AUTH.TOKEN_INVALID_OR_EXPIRED);
      });

      it("rejects request when Bearer token has invalid signature", async () => {
        const user = await seedVerifiedUser("loa.tampered@greenroots.farm");
        const validToken = await generateTestToken(jwtService, {
          sub: user.id,
          email: user.email,
          role: user.role,
        });

        // Tamper signature
        const tamperedToken = `${validToken.slice(0, -6)}xxxxxx`;

        const res = await request(getHttpServer())
          .post("/api/v1/auth/logout-all")
          .set("Authorization", `Bearer ${tamperedToken}`);

        expect(res.status).toBe(401);
        const error = res.body as Rfc9457Error;
        expect(error.status).toBe(401);
        expect(error.detail).toContain(MESSAGES.AUTH.TOKEN_INVALID_OR_EXPIRED);
      });

      it("rejects request when Bearer token has malformed JWT structure", async () => {
        const res = await request(getHttpServer())
          .post("/api/v1/auth/logout-all")
          .set("Authorization", "Bearer invalid-token-string");

        expect(res.status).toBe(401);
        const error = res.body as Rfc9457Error;
        expect(error.status).toBe(401);
        expect(error.detail).toContain(MESSAGES.AUTH.TOKEN_INVALID_OR_EXPIRED);
      });
    });

    // 8. Forgot Password Boundaries (5 tests)
    describe("Forgot Password Boundaries", () => {
      it("silently succeeds without dispatching email for non-existent email", async () => {
        mailTokens.clear();
        const res = await request(getHttpServer())
          .post("/api/v1/auth/forgot-password")
          .send({ email: "ghost.forgot@greenroots.farm" });

        expect(res.status).toBe(200);
        const body = res.body as ApiResponse<null>;
        expect(body.success).toBe(true);
        expect(mailTokens.recoveryTokens.length).toBe(0);
      });

      it("silently succeeds without dispatching email for suspended account", async () => {
        const email = "suspended.forgot@greenroots.farm";
        await seedVerifiedUser(email, "Password123!", {
          status: UserStatus.SUSPENDED,
        });
        mailTokens.clear();

        const res = await request(getHttpServer())
          .post("/api/v1/auth/forgot-password")
          .send({ email });

        expect(res.status).toBe(200);
        expect(mailTokens.recoveryTokens.length).toBe(0);
      });

      it("normalizes mixed-case and untrimmed email before lookup", async () => {
        const email = "normalize.forgot@greenroots.farm";
        await seedVerifiedUser(email);
        mailTokens.clear();

        const res = await request(getHttpServer())
          .post("/api/v1/auth/forgot-password")
          .send({ email: "   NORMALIZE.FORGOT@GreenRoots.Farm   " });

        expect(res.status).toBe(200);
        expect(mailTokens.recoveryTokens.length).toBe(1);
      });

      it("rejects malformed email format", async () => {
        const res = await request(getHttpServer())
          .post("/api/v1/auth/forgot-password")
          .send({ email: "invalid-email" });

        expect(res.status).toBe(400);
      });

      it("rejects request with missing body or unrecognized extra fields", async () => {
        const resMissing = await request(getHttpServer())
          .post("/api/v1/auth/forgot-password")
          .send({});
        expect(resMissing.status).toBe(400);

        const resExtra = await request(getHttpServer())
          .post("/api/v1/auth/forgot-password")
          .send({
            email: "extra@greenroots.farm",
            unknownField: "test",
          });
        expect(resExtra.status).toBe(400);
      });
    });

    // 9. Reset Password Boundaries (5 tests)
    describe("Reset Password Boundaries", () => {
      it("rejects expired reset password token", async () => {
        const email = "rst.expired@greenroots.farm";
        const user = await seedVerifiedUser(email);
        const rawToken = randomBytes(32).toString("hex");

        await db
          .update(users)
          .set({
            resetPasswordToken: sha256(rawToken),
            resetPasswordExpiresAt: new Date(Date.now() - 3600 * 1000), // expired 1h ago
          })
          .where(eq(users.id, user.id));

        const res = await request(getHttpServer())
          .post("/api/v1/auth/reset-password")
          .send({
            token: rawToken,
            password: "NewPassword123!",
            confirmPassword: "NewPassword123!",
          });

        expect(res.status).toBe(400);
        const error = res.body as Rfc9457Error;
        expect(error.code).toBe(API_ERROR_CODES.AUTH_RESET_TOKEN_INVALID);
      });

      it("rejects non-existent reset password token", async () => {
        const res = await request(getHttpServer())
          .post("/api/v1/auth/reset-password")
          .send({
            token: "b".repeat(64),
            password: "NewPassword123!",
            confirmPassword: "NewPassword123!",
          });

        expect(res.status).toBe(400);
        const error = res.body as Rfc9457Error;
        expect(error.code).toBe(API_ERROR_CODES.AUTH_RESET_TOKEN_INVALID);
      });

      it("rejects request when password and confirmPassword do not match", async () => {
        const res = await request(getHttpServer())
          .post("/api/v1/auth/reset-password")
          .send({
            token: "b".repeat(64),
            password: "NewPassword123!",
            confirmPassword: "MismatchPassword123!",
          });

        expect(res.status).toBe(400);
      });

      it("rejects weak password lacking uppercase, number, or special character", async () => {
        const res = await request(getHttpServer())
          .post("/api/v1/auth/reset-password")
          .send({
            token: "b".repeat(64),
            password: "simplepassword",
            confirmPassword: "simplepassword",
          });

        expect(res.status).toBe(400);
      });

      it("prevents token replay by rejecting already used reset token", async () => {
        const email = "rst.replay@greenroots.farm";
        const user = await seedVerifiedUser(email);
        const rawToken = randomBytes(32).toString("hex");

        await db
          .update(users)
          .set({
            resetPasswordToken: sha256(rawToken),
            resetPasswordExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
          })
          .where(eq(users.id, user.id));

        // First reset
        const firstRes = await request(getHttpServer())
          .post("/api/v1/auth/reset-password")
          .send({
            token: rawToken,
            password: "FirstNewPass123!",
            confirmPassword: "FirstNewPass123!",
          });
        expect(firstRes.status).toBe(200);

        // Replay reset
        const replayRes = await request(getHttpServer())
          .post("/api/v1/auth/reset-password")
          .send({
            token: rawToken,
            password: "SecondNewPass123!",
            confirmPassword: "SecondNewPass123!",
          });

        expect(replayRes.status).toBe(400);
        const error = replayRes.body as Rfc9457Error;
        expect(error.code).toBe(API_ERROR_CODES.AUTH_RESET_TOKEN_INVALID);
      });
    });
  });

  // =========================================================================
  // TIER 3: Cross-Feature Combinations & Invariants — 10 Test Cases
  // =========================================================================
  describe("Concurrency & Domain Invariants", () => {
    // Invariant: INV-AUTH-1 (Unique Active Email)
    it("enforces unique active email constraint while allowing re-registration after soft delete", async () => {
      const email = "inv.unique@greenroots.farm";
      const payload = {
        email,
        fullName: "First User",
        phoneNumber: "0912345678",
        password: "Password123!",
        confirmPassword: "Password123!",
        agreeTerms: true,
      };

      // Register first user
      const firstRes = await request(getHttpServer())
        .post("/api/v1/auth/register")
        .send(payload);
      expect(firstRes.status).toBe(201);

      // Attempt duplicate registration
      const dupRes = await request(getHttpServer())
        .post("/api/v1/auth/register")
        .send(payload);
      expect(dupRes.status).toBe(409);
      const dupError = dupRes.body as Rfc9457Error;
      expect(dupError.code).toBe(API_ERROR_CODES.AUTH_EMAIL_ALREADY_EXISTS);

      // Soft-delete first user
      await db
        .update(users)
        .set({ deletedAt: new Date() })
        .where(eq(users.email, email));

      // Re-registration with same email should now succeed
      const reRegRes = await request(getHttpServer())
        .post("/api/v1/auth/register")
        .send({
          ...payload,
          fullName: "Re-registered User",
        });
      expect(reRegRes.status).toBe(201);
    });

    // Invariant: INV-AUTH-2 (Unverified Login Barrier)
    it("enforces unverified login barrier before email verification", async () => {
      const email = "inv.barrier@greenroots.farm";
      const password = "Password123!";
      const { rawToken } = await seedUnverifiedUser(email, password);

      // Unverified login attempt rejected
      const barrierRes = await request(getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email, password });

      expect(barrierRes.status).toBe(403);
      const barrierError = barrierRes.body as Rfc9457Error;
      expect(barrierError.code).toBe(API_ERROR_CODES.AUTH_EMAIL_NOT_VERIFIED);

      // Verify email
      const verifyRes = await request(getHttpServer())
        .post("/api/v1/auth/verify-email")
        .send({ token: rawToken });
      expect(verifyRes.status).toBe(200);

      // Login now succeeds
      const loginRes = await request(getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email, password });

      expect(loginRes.status).toBe(200);
      expect((loginRes.body as ApiResponse<LoginData>).success).toBe(true);
    });

    // Invariant: INV-AUTH-3 (Single-Use Atomic Refresh Rotation Concurrency Race)
    it("handles concurrent refresh race condition where exactly one succeeds", async () => {
      const user = await seedVerifiedUser("inv.race@greenroots.farm");
      const r1 = randomBytes(32).toString("hex");
      await seedRefreshTokenRecord(user.id, r1);

      // Fire 2 concurrent requests with identical refresh token
      const [resA, resB] = await Promise.all([
        request(getHttpServer())
          .post("/api/v1/auth/refresh")
          .send({ refreshToken: r1 }),
        request(getHttpServer())
          .post("/api/v1/auth/refresh")
          .send({ refreshToken: r1 }),
      ]);

      const statuses = [resA.status, resB.status];
      expect(statuses).toContain(200);
      expect(statuses).toContain(401);

      // Verify exactly one active refresh token exists for user
      const tokensInDb = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.userId, user.id));

      expect(tokensInDb.length).toBe(1);
    });

    // Invariant: INV-AUTH-3 (Single-Use Refresh Rotation Serial Replay)
    it("rejects serial replay of already rotated refresh token", async () => {
      const user = await seedVerifiedUser("inv.replay@greenroots.farm");
      const r1 = randomBytes(32).toString("hex");
      await seedRefreshTokenRecord(user.id, r1);

      // First rotation
      const res1 = await request(getHttpServer())
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: r1 });
      expect(res1.status).toBe(200);

      // Second attempt with old r1
      const res2 = await request(getHttpServer())
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: r1 });

      expect(res2.status).toBe(401);
      const error = res2.body as Rfc9457Error;
      expect(error.code).toBe(API_ERROR_CODES.AUTH_TOKEN_INVALID_OR_EXPIRED);
    });

    // Invariant: INV-AUTH-4 (Single-Device Session Isolation)
    it("preserves concurrent device session when logging out a single device", async () => {
      const user = await seedVerifiedUser("inv.isolation@greenroots.farm");
      const rA = randomBytes(32).toString("hex");
      const rB = randomBytes(32).toString("hex");
      await seedRefreshTokenRecord(user.id, rA);
      await seedRefreshTokenRecord(user.id, rB);

      const tA = await generateTestToken(jwtService, {
        sub: user.id,
        email: user.email,
        role: user.role,
      });
      const tB = await generateTestToken(jwtService, {
        sub: user.id,
        email: user.email,
        role: user.role,
      });

      // Device A logs out
      const logoutARes = await request(getHttpServer())
        .post("/api/v1/auth/logout")
        .set("Authorization", `Bearer ${tA}`)
        .send({ refreshToken: rA });
      expect(logoutARes.status).toBe(200);

      // Device A access token revoked
      const testARes = await request(getHttpServer())
        .post("/api/v1/auth/logout-all")
        .set("Authorization", `Bearer ${tA}`);
      expect(testARes.status).toBe(401);

      // Device B refresh token remains functional in DB
      const testBRefreshRes = await request(getHttpServer())
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: rB });
      expect(testBRefreshRes.status).toBe(200);

      // Device B access token remains valid and functional for authenticated requests
      const testBAccessRes = await request(getHttpServer())
        .post("/api/v1/auth/logout-all")
        .set("Authorization", `Bearer ${tB}`);
      expect(testBAccessRes.status).toBe(200);
    });

    // Invariant: INV-AUTH-5 (Global Account Revocation on Logout-All)
    it("revokes all active sessions across all devices on global logout", async () => {
      const user = await seedVerifiedUser("inv.logoutall@greenroots.farm");
      const rA = randomBytes(32).toString("hex");
      const rB = randomBytes(32).toString("hex");
      await seedRefreshTokenRecord(user.id, rA);
      await seedRefreshTokenRecord(user.id, rB);

      const tA = await generateTestToken(jwtService, {
        sub: user.id,
        email: user.email,
        role: user.role,
      });
      const tB = await generateTestToken(jwtService, {
        sub: user.id,
        email: user.email,
        role: user.role,
      });

      // Device A calls logout-all
      const logoutAllRes = await request(getHttpServer())
        .post("/api/v1/auth/logout-all")
        .set("Authorization", `Bearer ${tA}`);
      expect(logoutAllRes.status).toBe(200);

      // Device A and Device B tokens both rejected immediately
      const testARes = await request(getHttpServer())
        .post("/api/v1/auth/logout-all")
        .set("Authorization", `Bearer ${tA}`);
      expect(testARes.status).toBe(401);

      const testBRes = await request(getHttpServer())
        .post("/api/v1/auth/logout-all")
        .set("Authorization", `Bearer ${tB}`);
      expect(testBRes.status).toBe(401);

      // All refresh tokens deleted from DB
      const dbTokens = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.userId, user.id));
      expect(dbTokens.length).toBe(0);
    });

    // Invariant: INV-AUTH-5 (Global Account Revocation on Reset Password)
    it("invalidates all device sessions upon password reset", async () => {
      const user = await seedVerifiedUser("inv.resetall@greenroots.farm");
      const rA = randomBytes(32).toString("hex");
      await seedRefreshTokenRecord(user.id, rA);

      const tA = await generateTestToken(jwtService, {
        sub: user.id,
        email: user.email,
        role: user.role,
      });

      const rawResetToken = randomBytes(32).toString("hex");
      await db
        .update(users)
        .set({
          resetPasswordToken: sha256(rawResetToken),
          resetPasswordExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
        })
        .where(eq(users.id, user.id));

      // Reset password
      const resetRes = await request(getHttpServer())
        .post("/api/v1/auth/reset-password")
        .send({
          token: rawResetToken,
          password: "BrandNewPassword123!",
          confirmPassword: "BrandNewPassword123!",
        });
      expect(resetRes.status).toBe(200);

      // Existing access token immediately rejected
      const testARes = await request(getHttpServer())
        .post("/api/v1/auth/logout-all")
        .set("Authorization", `Bearer ${tA}`);
      expect(testARes.status).toBe(401);

      // Refresh tokens purged
      const dbTokens = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.userId, user.id));
      expect(dbTokens.length).toBe(0);
    });

    // Invariant: INV-AUTH-6 (Anti-Enumeration Silence)
    it("returns identical success response for existing and non-existing emails", async () => {
      const existingEmail = "inv.exist@greenroots.farm";
      await seedVerifiedUser(existingEmail);
      const ghostEmail = "inv.ghost@greenroots.farm";

      // Forgot password comparison
      const forgotExisting = await request(getHttpServer())
        .post("/api/v1/auth/forgot-password")
        .send({ email: existingEmail });
      const forgotGhost = await request(getHttpServer())
        .post("/api/v1/auth/forgot-password")
        .send({ email: ghostEmail });

      expect(forgotExisting.status).toBe(200);
      expect(forgotGhost.status).toBe(200);
      expect(forgotExisting.body).toEqual(forgotGhost.body);

      // Resend verification comparison
      const resendExisting = await request(getHttpServer())
        .post("/api/v1/auth/resend-verification")
        .send({ email: existingEmail });
      const resendGhost = await request(getHttpServer())
        .post("/api/v1/auth/resend-verification")
        .send({ email: ghostEmail });

      expect(resendExisting.status).toBe(200);
      expect(resendGhost.status).toBe(200);
      expect(resendExisting.body).toEqual(resendGhost.body);
    });

    it("pipelines token and user blacklist checks through Redis", async () => {
      const user = await seedVerifiedUser("inv.pipelined@greenroots.farm");
      const jti = randomUUID();
      const token = await generateTestToken(jwtService, {
        sub: user.id,
        email: user.email,
        role: user.role,
        jti,
      });

      // 1. Initial valid request
      const validRes = await request(getHttpServer())
        .post("/api/v1/auth/logout-all")
        .set("Authorization", `Bearer ${token}`);
      expect(validRes.status).toBe(200);

      // 2. User-level revocation key in Redis
      await redisClient.set(`auth:revoked:user:${user.id}`, "1", "EX", 900);
      const userRevokedRes = await request(getHttpServer())
        .post("/api/v1/auth/logout-all")
        .set("Authorization", `Bearer ${token}`);
      expect(userRevokedRes.status).toBe(401);

      // 3. Clear user revocation, set token-level revocation
      await redisClient.del(`auth:revoked:user:${user.id}`);
      await redisClient.set(`auth:revoked:token:${jti}`, "1", "EX", 900);
      const tokenRevokedRes = await request(getHttpServer())
        .post("/api/v1/auth/logout-all")
        .set("Authorization", `Bearer ${token}`);
      expect(tokenRevokedRes.status).toBe(401);

      // 4. Clear token revocation -> works again
      await redisClient.del(`auth:revoked:token:${jti}`);
      const restoredRes = await request(getHttpServer())
        .post("/api/v1/auth/logout-all")
        .set("Authorization", `Bearer ${token}`);
      expect(restoredRes.status).toBe(200);
    });

    it("throttles verification resend within cooldown window", async () => {
      const email = "inv.cooldown@greenroots.farm";
      await seedUnverifiedUser(email);
      mailTokens.clear();

      // First resend call
      const res1 = await request(getHttpServer())
        .post("/api/v1/auth/resend-verification")
        .send({ email });
      expect(res1.status).toBe(200);
      expect(mailTokens.verificationTokens.length).toBe(1);

      // Second immediate call within 60s cooldown
      const res2 = await request(getHttpServer())
        .post("/api/v1/auth/resend-verification")
        .send({ email });
      expect(res2.status).toBe(200);

      // Email count should not increase due to cooldown protection
      expect(mailTokens.verificationTokens.length).toBe(1);
    });
  });

  // =========================================================================
  // TIER 4: Real-World Workload Scenarios — 4 Comprehensive Scenarios
  // =========================================================================
  describe("End-to-End Scenarios", () => {
    it("completes customer onboarding journey from registration to verified login", async () => {
      const email = "scenario1.customer@greenroots.farm";
      const password = "SecurePassword123!";
      mailTokens.clear();

      // Step 1: Customer registers
      const regRes = await request(getHttpServer())
        .post("/api/v1/auth/register")
        .send({
          email,
          fullName: "Customer Journey One",
          phoneNumber: "0912345678",
          password,
          confirmPassword: password,
          agreeTerms: true,
        });
      expect(regRes.status).toBe(201);

      // Step 2: Verification email captured by mail spy
      const verificationToken = mailTokens.getLatestVerificationToken(email);
      expect(verificationToken).toBeDefined();

      // Step 3: Customer attempts to log in before verifying email -> Blocked with 403
      const preVerifyLogin = await request(getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email, password });
      expect(preVerifyLogin.status).toBe(403);
      expect((preVerifyLogin.body as Rfc9457Error).code).toBe(
        API_ERROR_CODES.AUTH_EMAIL_NOT_VERIFIED,
      );

      // Step 3b: Customer requests resend verification email
      const resendRes = await request(getHttpServer())
        .post("/api/v1/auth/resend-verification")
        .send({ email });
      expect(resendRes.status).toBe(200);

      const latestVerificationToken =
        mailTokens.getLatestVerificationToken(email);
      expect(latestVerificationToken).toBeDefined();

      // Step 4: Customer clicks verification link
      const verifyRes = await request(getHttpServer())
        .post("/api/v1/auth/verify-email")
        .send({ token: latestVerificationToken! });
      expect(verifyRes.status).toBe(200);

      // Step 5: Customer logs in successfully
      const postVerifyLogin = await request(getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email, password });
      expect(postVerifyLogin.status).toBe(200);
      const { accessToken } = (postVerifyLogin.body as ApiResponse<LoginData>)
        .data;

      // Step 6: Customer accesses authenticated route with issued access token
      const authRouteRes = await request(getHttpServer())
        .post("/api/v1/auth/logout-all")
        .set("Authorization", `Bearer ${accessToken}`);
      expect(authRouteRes.status).toBe(200);
    });

    it("maintains multi-device session isolation through lifecycle events", async () => {
      const email = "scenario2.devices@greenroots.farm";
      const password = "Password123!";
      await seedVerifiedUser(email, password);

      // Step 1: Login on Laptop
      const laptopLogin = await request(getHttpServer())
        .post("/api/v1/auth/login")
        .set("User-Agent", "GreenRoots-Storefront/Desktop")
        .set("X-Forwarded-For", "10.0.0.1")
        .send({ email, password });
      expect(laptopLogin.status).toBe(200);
      const laptopTokens = (laptopLogin.body as ApiResponse<LoginData>).data;

      // Step 2: Login on Mobile
      const mobileLogin = await request(getHttpServer())
        .post("/api/v1/auth/login")
        .set("User-Agent", "GreenRoots-Storefront/Mobile")
        .set("X-Forwarded-For", "192.168.1.5")
        .send({ email, password });
      expect(mobileLogin.status).toBe(200);
      const mobileTokens = (mobileLogin.body as ApiResponse<LoginData>).data;

      // Step 3: Verify 2 distinct refresh tokens stored in DB
      const dbTokensBefore = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.userId, laptopTokens.user.id));
      expect(dbTokensBefore.length).toBe(2);

      // Step 4: Mobile session rotates refresh token
      const mobileRefresh = await request(getHttpServer())
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: mobileTokens.refreshToken });
      expect(mobileRefresh.status).toBe(200);
      const newMobileTokens = (mobileRefresh.body as ApiResponse<RefreshData>)
        .data;

      // Step 5: Laptop performs single logout
      const laptopLogout = await request(getHttpServer())
        .post("/api/v1/auth/logout")
        .set("Authorization", `Bearer ${laptopTokens.accessToken}`)
        .send({ refreshToken: laptopTokens.refreshToken });
      expect(laptopLogout.status).toBe(200);

      // Step 6: Verify Laptop access token rejected
      const laptopCheck = await request(getHttpServer())
        .post("/api/v1/auth/logout-all")
        .set("Authorization", `Bearer ${laptopTokens.accessToken}`);
      expect(laptopCheck.status).toBe(401);

      // Step 7: Verify Mobile session remains active
      const mobileCheck = await request(getHttpServer())
        .post("/api/v1/auth/logout-all")
        .set("Authorization", `Bearer ${newMobileTokens.accessToken}`);
      expect(mobileCheck.status).toBe(200);

      // Step 8: Verify all sessions are now terminated
      const finalCheck = await request(getHttpServer())
        .post("/api/v1/auth/logout-all")
        .set("Authorization", `Bearer ${newMobileTokens.accessToken}`);
      expect(finalCheck.status).toBe(401);
    });

    it("completes account recovery lifecycle with session invalidation", async () => {
      const email = "scenario3.recovery@greenroots.farm";
      const oldPassword = "OldPassword123!";
      const newPassword = "BrandNewPassword456!";
      const user = await seedVerifiedUser(email, oldPassword);

      // User has existing session
      const existingToken = await generateTestToken(jwtService, {
        sub: user.id,
        email: user.email,
        role: user.role,
      });
      await seedRefreshTokenRecord(user.id, randomBytes(32).toString("hex"));

      // Step 1: User requests password reset
      mailTokens.clear();
      const forgotRes = await request(getHttpServer())
        .post("/api/v1/auth/forgot-password")
        .send({ email });
      expect(forgotRes.status).toBe(200);

      // Step 2: Capture raw reset token
      const resetToken = mailTokens.getLatestResetToken(email);
      expect(resetToken).toBeDefined();

      // Step 3: Attacker attempts brute-force reset with bad token -> 400
      const badResetRes = await request(getHttpServer())
        .post("/api/v1/auth/reset-password")
        .send({
          token: "bad-token-12345",
          password: newPassword,
          confirmPassword: newPassword,
        });
      expect(badResetRes.status).toBe(400);

      // Step 4: Legitimate user resets password with valid token
      const legitResetRes = await request(getHttpServer())
        .post("/api/v1/auth/reset-password")
        .send({
          token: resetToken!,
          password: newPassword,
          confirmPassword: newPassword,
        });
      expect(legitResetRes.status).toBe(200);

      // Step 5: Verify existing sessions are invalidated immediately
      const oldSessionRes = await request(getHttpServer())
        .post("/api/v1/auth/logout-all")
        .set("Authorization", `Bearer ${existingToken}`);
      expect(oldSessionRes.status).toBe(401);

      // Step 6: Old password no longer works
      const oldLoginRes = await request(getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email, password: oldPassword });
      expect(oldLoginRes.status).toBe(401);

      // Step 7: New password works
      const newLoginRes = await request(getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email, password: newPassword });
      expect(newLoginRes.status).toBe(200);

      // Step 8: Replay of used reset token fails
      const replayResetRes = await request(getHttpServer())
        .post("/api/v1/auth/reset-password")
        .send({
          token: resetToken!,
          password: "AnotherPassword789!",
          confirmPassword: "AnotherPassword789!",
        });
      expect(replayResetRes.status).toBe(400);
    });

    it("defends against refresh token theft and replay attacks", async () => {
      const email = "scenario4.replay@greenroots.farm";
      const password = "Password123!";
      await seedVerifiedUser(email, password);

      // Step 1: Legitimate user logs in and acquires R1
      const loginRes = await request(getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email, password });
      expect(loginRes.status).toBe(200);
      const { refreshToken: r1 } = (loginRes.body as ApiResponse<LoginData>)
        .data;

      // Step 2: Attacker intercepts R1 (simulation)
      const interceptedR1 = r1;

      // Step 3: Legitimate user rotates R1 -> R2
      const legitimateRefreshRes = await request(getHttpServer())
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: r1 });
      expect(legitimateRefreshRes.status).toBe(200);
      const { refreshToken: r2 } = (
        legitimateRefreshRes.body as ApiResponse<RefreshData>
      ).data;

      // Step 4: Attacker attempts to replay intercepted R1
      const attackerRefreshRes = await request(getHttpServer())
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: interceptedR1 });

      // Immediate 401 rejection due to single-use atomic DELETE ... RETURNING
      expect(attackerRefreshRes.status).toBe(401);
      expect((attackerRefreshRes.body as Rfc9457Error).code).toBe(
        API_ERROR_CODES.AUTH_TOKEN_INVALID_OR_EXPIRED,
      );

      // Step 5: Legitimate user session with R2 remains intact and valid
      const legitUserCheck = await request(getHttpServer())
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: r2 });
      expect(legitUserCheck.status).toBe(200);
      const { accessToken: t3 } = (
        legitUserCheck.body as ApiResponse<RefreshData>
      ).data;

      // Step 6: Legitimate user invokes emergency global logout
      const emergencyLogoutRes = await request(getHttpServer())
        .post("/api/v1/auth/logout-all")
        .set("Authorization", `Bearer ${t3}`);
      expect(emergencyLogoutRes.status).toBe(200);
    });
  });
});
