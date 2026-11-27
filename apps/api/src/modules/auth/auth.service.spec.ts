import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import type { JwtService } from "@nestjs/jwt";
import {
  API_ERROR_CODES,
  AuthSurface,
  UserRole,
  UserStatus,
} from "@greenroots/shared";
import { PG_ERROR_CODE } from "@/common/constants/error.constant";
import { MESSAGES } from "@/common/constants/messages.constant";
import type { RedisService } from "@/common/services/redis.service";
import { hashPassword } from "@/common/utils/crypto.util";
import type { MailService } from "@/modules/mail/mail.service";
import { createMockDb } from "../../../test/mocks/mock-database";
import { AuthService } from "./auth.service";
import type {
  ForgotPasswordDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  ResendVerificationDto,
  ResetPasswordDto,
} from "./dto";

type MockDb = ReturnType<typeof createMockDb> & {
  mockInsertValues: ReturnType<typeof mock>;
  mockUpdateSet: ReturnType<typeof mock>;
  mockUpdateWhere: ReturnType<typeof mock>;
  mockDeleteWhere: ReturnType<typeof mock>;
  setSelectResult: (result: unknown[]) => void;
  setSelectResultsQueue: (results: unknown[][]) => void;
  clearAll: () => void;
};

describe("AuthService", () => {
  let service: AuthService;
  let mockDb: MockDb;
  const cachedPasswordHashes = new Map<string, Promise<string>>();

  function getCachedPasswordHash(password: string): Promise<string> {
    let cached = cachedPasswordHashes.get(password);
    if (!cached) {
      cached = hashPassword(password);
      cachedPasswordHashes.set(password, cached);
    }
    return cached;
  }

  const mockJwtService = {
    signAsync: mock((_payload?: Record<string, unknown>, _options?: unknown) =>
      Promise.resolve("mock_jwt_access_token"),
    ),
    verifyAsync: mock(() =>
      Promise.resolve({ sub: "user-id", email: "test@greenroots.farm" }),
    ),
    decode: mock((_token: string) => ({
      jti: "mock-jti-uuid",
      exp: Math.floor(Date.now() / 1000) + 900,
    })),
    clearAll() {
      this.signAsync.mockClear();
      this.verifyAsync.mockClear();
      this.decode.mockClear();
    },
  };

  const mockRedisClient = {
    get: mock((_key: string) => Promise.resolve<string | null>(null)),
    set: mock((_key: string, _val: string, _ex?: string, _ttl?: number) =>
      Promise.resolve("OK"),
    ),
    clearAll() {
      this.get.mockClear();
      this.set.mockClear();
    },
  };

  const mockRedisService = {
    revokeToken: mock(() => Promise.resolve()),
    revokeUser: mock(() => Promise.resolve()),
    isRevoked: mock(() => Promise.resolve(false)),
    getClient: mock(() => mockRedisClient),
    clearAll() {
      this.revokeToken.mockClear();
      this.revokeUser.mockClear();
      this.isRevoked.mockClear();
      this.getClient.mockClear();
      mockRedisClient.clearAll();
    },
  };

  const mockMailService = {
    sendVerificationEmail: mock(() => Promise.resolve()),
    sendPasswordResetEmail: mock(() => Promise.resolve()),
    clearAll() {
      this.sendVerificationEmail.mockClear();
      this.sendPasswordResetEmail.mockClear();
    },
  };

  beforeEach(() => {
    mockDb = createMockDb() as unknown as MockDb;
    mockJwtService.clearAll();
    mockRedisService.clearAll();
    mockMailService.clearAll();

    service = new AuthService(
      mockDb,
      mockJwtService as unknown as JwtService,
      mockRedisService as unknown as RedisService,
      mockMailService as unknown as MailService,
    );
  });

  it("initializes AuthService", () => {
    expect(service).toBeDefined();
  });

  // =========================================================================
  // 1. register
  // =========================================================================
  describe("register", () => {
    const registerDto: RegisterDto = {
      email: "Customer@GreenRoots.Farm",
      fullName: "Farmer Bob",
      phone: "0912345678",
      password: "SecurePassword123!",
      confirmPassword: "SecurePassword123!",
      agreeTerms: true,
    };

    it("registers an unverified customer and dispatches verification email", async () => {
      mockDb.setSelectResult([]);

      await service.register(registerDto);

      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.mockInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "customer@greenroots.farm",
          fullName: "Farmer Bob",
          phone: "0912345678",
          role: UserRole.CUSTOMER,
          status: UserStatus.ACTIVE,
          emailVerified: false,
          verificationToken: expect.stringMatching(/^[0-9a-f]{64}$/),
          password: expect.stringMatching(/^s1\$[0-9a-f]{32}\$[0-9a-f]{128}$/),
        }),
      );
      expect(mockMailService.sendVerificationEmail).toHaveBeenCalledWith(
        "customer@greenroots.farm",
        "Farmer Bob",
        expect.stringMatching(/^[0-9a-f]{64}$/),
      );
    });

    it("throws ConflictException when email already exists", async () => {
      mockDb.setSelectResult([{ id: "existing-user-id" }]);

      expect(service.register(registerDto)).rejects.toThrow(ConflictException);
      try {
        await service.register(registerDto);
      } catch (error) {
        const conflict = error as ConflictException;
        expect(conflict.getResponse()).toEqual({
          code: API_ERROR_CODES.AUTH_EMAIL_ALREADY_EXISTS,
          detail: MESSAGES.AUTH.EMAIL_ALREADY_EXISTS,
        });
      }
    });

    it("catches database unique violation (23505) and rethrows ConflictException", () => {
      mockDb.setSelectResult([]);
      mockDb.insert = mock(() => ({
        values: mock(() => {
          const pgError = new Error("Unique constraint violation");
          (pgError as unknown as { code: string }).code =
            PG_ERROR_CODE.UNIQUE_VIOLATION;
          return Promise.reject(pgError);
        }),
      })) as unknown as typeof mockDb.insert;

      expect(service.register(registerDto)).rejects.toThrow(ConflictException);
    });
  });

  // =========================================================================
  // 2. verifyEmail
  // =========================================================================
  describe("verifyEmail", () => {
    it("activates account and clears verification tokens", async () => {
      mockDb.setSelectResult([
        {
          id: "unverified-user-id",
          verificationExpiresAt: new Date(Date.now() + 86400000),
        },
      ]);

      await service.verifyEmail("valid_verification_token");

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          emailVerified: true,
          verificationToken: null,
          verificationExpiresAt: null,
        }),
      );
    });

    it("throws BadRequestException when verification token is not found", async () => {
      mockDb.setSelectResult([]);

      expect(service.verifyEmail("unknown_token")).rejects.toThrow(
        BadRequestException,
      );
      try {
        await service.verifyEmail("unknown_token");
      } catch (error) {
        const badRequest = error as BadRequestException;
        expect(badRequest.getResponse()).toEqual({
          code: API_ERROR_CODES.AUTH_VERIFICATION_TOKEN_INVALID,
          detail: MESSAGES.AUTH.VERIFICATION_TOKEN_INVALID,
        });
      }
    });

    it("throws BadRequestException when verification token is expired", () => {
      mockDb.setSelectResult([
        {
          id: "unverified-user-id",
          verificationExpiresAt: new Date(Date.now() - 1000),
        },
      ]);

      expect(service.verifyEmail("expired_token")).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // =========================================================================
  // 3. resendVerificationEmail
  // =========================================================================
  describe("resendVerificationEmail", () => {
    const dto: ResendVerificationDto = { email: "customer@greenroots.farm" };

    it("returns cleanly without sending email when user is not found", async () => {
      mockDb.setSelectResult([]);

      await service.resendVerificationEmail(dto);

      expect(mockMailService.sendVerificationEmail).not.toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it("returns cleanly without sending email when user is already verified", async () => {
      mockDb.setSelectResult([
        {
          id: "user-id",
          email: "customer@greenroots.farm",
          fullName: "Farmer Bob",
          status: UserStatus.ACTIVE,
          emailVerified: true,
        },
      ]);

      await service.resendVerificationEmail(dto);

      expect(mockMailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it("returns cleanly without sending email when account is suspended", async () => {
      mockDb.setSelectResult([
        {
          id: "user-id",
          email: "customer@greenroots.farm",
          fullName: "Farmer Bob",
          status: UserStatus.SUSPENDED,
          emailVerified: false,
        },
      ]);

      await service.resendVerificationEmail(dto);

      expect(mockMailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it("returns cleanly without sending email when account is inactive", async () => {
      mockDb.setSelectResult([
        {
          id: "user-id",
          email: "customer@greenroots.farm",
          fullName: "Farmer Bob",
          status: UserStatus.INACTIVE,
          emailVerified: false,
        },
      ]);

      await service.resendVerificationEmail(dto);

      expect(mockMailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it("returns cleanly without sending email when Redis cooldown key is active", async () => {
      mockDb.setSelectResult([
        {
          id: "user-id",
          email: "customer@greenroots.farm",
          fullName: "Farmer Bob",
          status: UserStatus.ACTIVE,
          emailVerified: false,
        },
      ]);
      mockRedisClient.get.mockImplementationOnce(() => Promise.resolve("1"));

      await service.resendVerificationEmail(dto);

      expect(mockMailService.sendVerificationEmail).not.toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it("regenerates token, updates DB, sends email, and sets Redis cooldown when eligible", async () => {
      mockDb.setSelectResult([
        {
          id: "user-id",
          email: "customer@greenroots.farm",
          fullName: "Farmer Bob",
          status: UserStatus.ACTIVE,
          emailVerified: false,
        },
      ]);

      await service.resendVerificationEmail(dto);

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockMailService.sendVerificationEmail).toHaveBeenCalledWith(
        "customer@greenroots.farm",
        "Farmer Bob",
        expect.stringMatching(/^[0-9a-f]{64}$/),
      );
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        "auth:cooldown:resend:user-id",
        "1",
        "EX",
        60,
      );
    });
  });

  // =========================================================================
  // 4. login
  // =========================================================================
  describe("login", () => {
    const loginDto: LoginDto = {
      email: "customer@greenroots.farm",
      password: "Password123!",
    };

    it("authenticates valid verified user and issues tokens", async () => {
      const hashedPassword = await getCachedPasswordHash("Password123!");
      mockDb.setSelectResult([
        {
          id: "019315bc-3e9a-7a1b-8f3e-2b1d0a5c4e9f",
          email: "customer@greenroots.farm",
          fullName: "Farmer Bob",
          role: UserRole.CUSTOMER,
          status: UserStatus.ACTIVE,
          password: hashedPassword,
          emailVerified: true,
        },
      ]);

      const result = await service.login(loginDto, AuthSurface.CUSTOMER, {
        deviceName: "Desktop Chrome",
        ipAddress: "192.168.1.1",
      });

      expect(result.accessToken).toBe("mock_jwt_access_token");
      expect(result.refreshToken).toMatch(/^[0-9a-f]{64}$/);
      expect(result.user).toEqual({
        id: "019315bc-3e9a-7a1b-8f3e-2b1d0a5c4e9f",
        email: "customer@greenroots.farm",
        fullName: "Farmer Bob",
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
      });
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("authenticates valid verified staff user on staff surface", async () => {
      const hashedPassword = await getCachedPasswordHash("Password123!");
      mockDb.setSelectResult([
        {
          id: "019315bc-3e9a-7a1b-8f3e-2b1d0a5c4e9a",
          email: "admin@greenroots.farm",
          fullName: "Admin User",
          role: UserRole.ADMIN,
          status: UserStatus.ACTIVE,
          password: hashedPassword,
          emailVerified: true,
        },
      ]);

      const result = await service.login(loginDto, AuthSurface.STAFF);

      expect(result.accessToken).toBe("mock_jwt_access_token");
      expect(result.user.role).toBe(UserRole.ADMIN);
    });

    it("throws ForbiddenException when staff logs in on customer surface even if unverified", async () => {
      const hashedPassword = await getCachedPasswordHash("Password123!");
      mockDb.setSelectResult([
        {
          id: "staff-id",
          email: "sales@greenroots.farm",
          fullName: "Sales Staff",
          role: UserRole.SALES,
          status: UserStatus.SUSPENDED,
          password: hashedPassword,
          emailVerified: false,
        },
      ]);

      try {
        await service.login(loginDto, AuthSurface.CUSTOMER);
        expect.unreachable("Expected ForbiddenException");
      } catch (error) {
        const forbidden = error as ForbiddenException;
        expect(forbidden).toBeInstanceOf(ForbiddenException);
        expect(forbidden.getResponse()).toEqual({
          code: API_ERROR_CODES.AUTH_SURFACE_FORBIDDEN,
          detail: MESSAGES.AUTH.SURFACE_FORBIDDEN,
        });
      }
    });

    it("throws ForbiddenException when customer logs in on staff surface", async () => {
      const hashedPassword = await getCachedPasswordHash("Password123!");
      mockDb.setSelectResult([
        {
          id: "customer-id",
          email: "customer@greenroots.farm",
          fullName: "Farmer Bob",
          role: UserRole.CUSTOMER,
          status: UserStatus.ACTIVE,
          password: hashedPassword,
          emailVerified: true,
        },
      ]);

      try {
        await service.login(loginDto, AuthSurface.STAFF);
        expect.unreachable("Expected ForbiddenException");
      } catch (error) {
        const forbidden = error as ForbiddenException;
        expect(forbidden).toBeInstanceOf(ForbiddenException);
        expect(forbidden.getResponse()).toEqual({
          code: API_ERROR_CODES.AUTH_SURFACE_FORBIDDEN,
          detail: MESSAGES.AUTH.SURFACE_FORBIDDEN,
        });
      }
    });

    it("throws UnauthorizedException when user does not exist", () => {
      mockDb.setSelectResult([]);

      expect(service.login(loginDto, AuthSurface.CUSTOMER)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("throws UnauthorizedException when password does not match", async () => {
      const hashedPassword = await getCachedPasswordHash(
        "DifferentPassword123!",
      );
      mockDb.setSelectResult([
        {
          id: "user-id",
          email: "customer@greenroots.farm",
          fullName: "Farmer Bob",
          role: UserRole.CUSTOMER,
          status: UserStatus.ACTIVE,
          password: hashedPassword,
          emailVerified: true,
        },
      ]);

      expect(service.login(loginDto, AuthSurface.CUSTOMER)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("throws ForbiddenException when emailVerified is false", async () => {
      const hashedPassword = await getCachedPasswordHash("Password123!");
      mockDb.setSelectResult([
        {
          id: "user-id",
          email: "customer@greenroots.farm",
          fullName: "Farmer Bob",
          role: UserRole.CUSTOMER,
          status: UserStatus.ACTIVE,
          password: hashedPassword,
          emailVerified: false,
        },
      ]);

      expect(service.login(loginDto, AuthSurface.CUSTOMER)).rejects.toThrow(
        ForbiddenException,
      );
      try {
        await service.login(loginDto, AuthSurface.CUSTOMER);
      } catch (error) {
        const forbidden = error as ForbiddenException;
        expect(forbidden.getResponse()).toEqual({
          code: API_ERROR_CODES.AUTH_EMAIL_NOT_VERIFIED,
          detail: MESSAGES.AUTH.EMAIL_NOT_VERIFIED,
        });
      }
    });

    it("throws ForbiddenException when account is suspended", async () => {
      const hashedPassword = await getCachedPasswordHash("Password123!");
      mockDb.setSelectResult([
        {
          id: "user-id",
          email: "customer@greenroots.farm",
          fullName: "Farmer Bob",
          role: UserRole.CUSTOMER,
          status: UserStatus.SUSPENDED,
          password: hashedPassword,
          emailVerified: true,
        },
      ]);

      expect(service.login(loginDto, AuthSurface.CUSTOMER)).rejects.toThrow(
        ForbiddenException,
      );
      try {
        await service.login(loginDto, AuthSurface.CUSTOMER);
      } catch (error) {
        const forbidden = error as ForbiddenException;
        expect(forbidden.getResponse()).toEqual({
          code: API_ERROR_CODES.AUTH_ACCOUNT_SUSPENDED,
          detail: MESSAGES.AUTH.ACCOUNT_SUSPENDED,
        });
      }
    });
  });

  // =========================================================================
  // 5. refreshToken
  // =========================================================================
  describe("refreshToken", () => {
    const refreshDto: RefreshTokenDto = {
      refreshToken: "a".repeat(64),
    };

    it("rotates refresh token atomically and returns fresh pair", async () => {
      mockDb.setSelectResultsQueue([
        [
          {
            id: "old-token-id",
            userId: "user-id",
            surface: AuthSurface.CUSTOMER,
            expiresAt: new Date(Date.now() + 86400000),
          },
        ],
        [
          {
            id: "user-id",
            email: "customer@greenroots.farm",
            role: UserRole.CUSTOMER,
            status: UserStatus.ACTIVE,
          },
        ],
        [{ id: "new-session-id" }],
      ]);

      const result = await service.refreshToken(
        refreshDto,
        AuthSurface.CUSTOMER,
      );

      expect(mockDb.delete).toHaveBeenCalled();
      expect(result.accessToken).toBe("mock_jwt_access_token");
      expect(result.refreshToken).toMatch(/^[0-9a-f]{64}$/);
    });

    it("throws ForbiddenException when refresh token surface mismatches", async () => {
      mockDb.setSelectResultsQueue([
        [
          {
            id: "staff-token-id",
            userId: "staff-id",
            surface: AuthSurface.STAFF,
            expiresAt: new Date(Date.now() + 86400000),
          },
        ],
      ]);

      try {
        await service.refreshToken(refreshDto, AuthSurface.CUSTOMER);
        expect.unreachable("Expected ForbiddenException");
      } catch (error) {
        const forbidden = error as ForbiddenException;
        expect(forbidden).toBeInstanceOf(ForbiddenException);
        expect(forbidden.getResponse()).toEqual({
          code: API_ERROR_CODES.AUTH_SURFACE_FORBIDDEN,
          detail: MESSAGES.AUTH.SURFACE_FORBIDDEN,
        });
      }
      expect(mockDb.delete).toHaveBeenCalled();
    });

    it("throws ForbiddenException when user role drifted off the refresh surface", async () => {
      mockDb.setSelectResultsQueue([
        [
          {
            id: "old-token-id",
            userId: "user-id",
            surface: AuthSurface.CUSTOMER,
            expiresAt: new Date(Date.now() + 86400000),
          },
        ],
        [
          {
            id: "user-id",
            email: "promoted@greenroots.farm",
            role: UserRole.SALES,
            status: UserStatus.ACTIVE,
          },
        ],
      ]);

      try {
        await service.refreshToken(refreshDto, AuthSurface.CUSTOMER);
        expect.unreachable("Expected ForbiddenException");
      } catch (error) {
        const forbidden = error as ForbiddenException;
        expect(forbidden).toBeInstanceOf(ForbiddenException);
        expect(forbidden.getResponse()).toEqual({
          code: API_ERROR_CODES.AUTH_SURFACE_FORBIDDEN,
          detail: MESSAGES.AUTH.SURFACE_FORBIDDEN,
        });
      }
    });

    it("throws UnauthorizedException when refresh token was already rotated or invalid", () => {
      mockDb.setSelectResultsQueue([[]]);

      expect(
        service.refreshToken(refreshDto, AuthSurface.CUSTOMER),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("throws UnauthorizedException when refresh token is expired", () => {
      mockDb.setSelectResultsQueue([
        [
          {
            id: "expired-token-id",
            userId: "user-id",
            surface: AuthSurface.CUSTOMER,
            expiresAt: new Date(Date.now() - 1000),
          },
        ],
      ]);

      expect(
        service.refreshToken(refreshDto, AuthSurface.CUSTOMER),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("throws UnauthorizedException when user is suspended", () => {
      mockDb.setSelectResultsQueue([
        [
          {
            id: "token-id",
            userId: "user-id",
            surface: AuthSurface.CUSTOMER,
            expiresAt: new Date(Date.now() + 86400000),
          },
        ],
        [
          {
            id: "user-id",
            email: "customer@greenroots.farm",
            role: UserRole.CUSTOMER,
            status: UserStatus.SUSPENDED,
          },
        ],
      ]);

      expect(
        service.refreshToken(refreshDto, AuthSurface.CUSTOMER),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // =========================================================================
  // 6. logout
  // =========================================================================
  describe("logout", () => {
    it("deletes refresh token from DB and blacklists active Bearer token in Redis", async () => {
      await service.logout("refresh_token_to_purge", "bearer_access_token");

      expect(mockDb.delete).toHaveBeenCalled();
      expect(mockRedisService.revokeToken).toHaveBeenCalledWith(
        "mock-jti-uuid",
        expect.any(Number),
      );
    });

    it("succeeds gracefully when Authorization header is omitted", async () => {
      await service.logout("refresh_token_to_purge", undefined);

      expect(mockDb.delete).toHaveBeenCalled();
      expect(mockRedisService.revokeToken).not.toHaveBeenCalled();
    });

    it("skips Redis revocation when Bearer token is already expired", async () => {
      mockJwtService.decode.mockImplementationOnce(() => ({
        jti: "expired-jti",
        exp: Math.floor(Date.now() / 1000) - 10,
      }));

      await service.logout("refresh_token", "expired_bearer_token");

      expect(mockDb.delete).toHaveBeenCalled();
      expect(mockRedisService.revokeToken).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 7. logoutAll
  // =========================================================================
  describe("logoutAll", () => {
    it("purges all DB refresh tokens for user and blacklists user in Redis for 15m", async () => {
      await service.logoutAll("019315bc-user-id");

      expect(mockDb.delete).toHaveBeenCalled();
      expect(mockRedisService.revokeUser).toHaveBeenCalledWith(
        "019315bc-user-id",
        900,
      );
    });

    it("throws UnauthorizedException when userId is missing", () => {
      expect(service.logoutAll("")).rejects.toThrow(UnauthorizedException);
    });
  });

  // =========================================================================
  // 8. forgotPassword
  // =========================================================================
  describe("forgotPassword", () => {
    const dto: ForgotPasswordDto = { email: "customer@greenroots.farm" };

    it("returns silently without sending email when account does not exist", async () => {
      mockDb.setSelectResult([]);

      await service.forgotPassword(dto);

      expect(mockMailService.sendPasswordResetEmail).not.toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it("returns silently when account is suspended or inactive", async () => {
      for (const status of [UserStatus.SUSPENDED, UserStatus.INACTIVE]) {
        mockDb.setSelectResult([
          {
            id: "user-id",
            fullName: "Blocked User",
            status,
          },
        ]);

        await service.forgotPassword(dto);
      }

      expect(mockMailService.sendPasswordResetEmail).not.toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it("stores 15m reset token hash and dispatches password reset email for active user", async () => {
      mockDb.setSelectResult([
        {
          id: "user-id",
          fullName: "Farmer Bob",
          role: UserRole.CUSTOMER,
          status: UserStatus.ACTIVE,
        },
      ]);

      await service.forgotPassword(dto);

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          resetPasswordToken: expect.stringMatching(/^[0-9a-f]{64}$/),
          resetPasswordExpiresAt: expect.any(Date),
        }),
      );
      expect(mockMailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        "customer@greenroots.farm",
        "Farmer Bob",
        expect.stringMatching(/^[0-9a-f]{64}$/),
        false,
      );
    });

    it("passes isStaff=true when dispatching password reset email for staff roles", async () => {
      // Invariant: INV-3
      mockDb.setSelectResult([
        {
          id: "staff-id",
          fullName: "Staff Alice",
          role: UserRole.ADMIN,
          status: UserStatus.ACTIVE,
        },
      ]);

      await service.forgotPassword({ email: "staff@greenroots.farm" });

      expect(mockMailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        "staff@greenroots.farm",
        "Staff Alice",
        expect.stringMatching(/^[0-9a-f]{64}$/),
        true,
      );
    });
  });

  // =========================================================================
  // 9. resetPassword
  // =========================================================================
  describe("resetPassword", () => {
    const resetDto: ResetPasswordDto = {
      token: "valid_reset_token",
      password: "NewSecurePassword123!",
      confirmPassword: "NewSecurePassword123!",
    };

    it("resets password, verifies email, clears reset tokens, and revokes all active sessions", async () => {
      mockDb.setSelectResult([
        {
          id: "user-id",
          status: UserStatus.ACTIVE,
          resetPasswordExpiresAt: new Date(Date.now() + 900000),
        },
      ]);

      await service.resetPassword(resetDto);

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          password: expect.stringMatching(/^s1\$[0-9a-f]{32}\$[0-9a-f]{128}$/),
          emailVerified: true,
          resetPasswordToken: null,
          resetPasswordExpiresAt: null,
        }),
      );
      expect(mockDb.delete).toHaveBeenCalled();
      expect(mockRedisService.revokeUser).toHaveBeenCalledWith("user-id", 900);
    });

    it("rejects password reset when account is suspended or inactive", async () => {
      for (const status of [UserStatus.SUSPENDED, UserStatus.INACTIVE]) {
        mockDb.setSelectResult([
          {
            id: "user-id",
            status,
            resetPasswordExpiresAt: new Date(Date.now() + 900000),
          },
        ]);

        try {
          await service.resetPassword(resetDto);
          expect.unreachable("Expected ForbiddenException");
        } catch (error) {
          expect(error).toBeInstanceOf(ForbiddenException);
          expect((error as ForbiddenException).getResponse()).toEqual({
            code: API_ERROR_CODES.AUTH_ACCOUNT_SUSPENDED,
            detail: MESSAGES.AUTH.ACCOUNT_SUSPENDED,
          });
        }
      }
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it("throws BadRequestException when reset token is not found", () => {
      mockDb.setSelectResult([]);

      expect(service.resetPassword(resetDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("throws BadRequestException when reset token is expired", () => {
      mockDb.setSelectResult([
        {
          id: "user-id",
          status: UserStatus.ACTIVE,
          resetPasswordExpiresAt: new Date(Date.now() - 1000),
        },
      ]);

      expect(service.resetPassword(resetDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("login", () => {
    it("embeds inserted refresh session id as sid claim alongside independent jti", async () => {
      const hashedPassword = await getCachedPasswordHash("Password123!");
      const sessionId = "019fa8bc-8f4d-7000-b366-e691f45cfb91";
      mockDb.setSelectResultsQueue([
        [
          {
            id: "user-id",
            email: "customer@greenroots.farm",
            fullName: "Farmer Bob",
            role: UserRole.CUSTOMER,
            status: UserStatus.ACTIVE,
            password: hashedPassword,
            emailVerified: true,
          },
        ],
        [{ id: sessionId }],
      ]);

      await service.login(
        { email: "customer@greenroots.farm", password: "Password123!" },
        AuthSurface.CUSTOMER,
      );

      expect(mockJwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: "user-id",
          email: "customer@greenroots.farm",
          role: UserRole.CUSTOMER,
          sid: sessionId,
          jti: expect.any(String),
        }),
        expect.any(Object),
      );
      const signedPayload = mockJwtService.signAsync.mock.calls[0]?.[0] as
        | { jti?: string; sid?: string }
        | undefined;
      expect(signedPayload?.jti).not.toBe(sessionId);
    });
  });

  describe("listCustomerSessions", () => {
    it("returns closed projection with isCurrent matching current sid", async () => {
      const createdAt1 = new Date("2026-11-27T10:00:00.000Z");
      const expiresAt1 = new Date("2026-12-04T10:00:00.000Z");
      const createdAt2 = new Date("2026-11-26T10:00:00.000Z");
      const expiresAt2 = new Date("2026-12-03T10:00:00.000Z");
      const currentSid = "019fa8bc-8f4d-7000-b366-e691f45cfb91";
      const otherSid = "019fa8bc-8f4d-7000-b366-e691f45cfb92";

      mockDb.setSelectResult([
        {
          id: currentSid,
          deviceName: "Chrome on Linux",
          ipAddress: "203.0.113.10",
          createdAt: createdAt1,
          expiresAt: expiresAt1,
        },
        {
          id: otherSid,
          deviceName: null,
          ipAddress: null,
          createdAt: createdAt2,
          expiresAt: expiresAt2,
        },
      ]);

      const result = await service.listCustomerSessions("user-id", currentSid);

      expect(result).toEqual([
        {
          id: currentSid,
          deviceName: "Chrome on Linux",
          ipAddress: "203.0.113.10",
          createdAt: createdAt1.toISOString(),
          expiresAt: expiresAt1.toISOString(),
          isCurrent: true,
        },
        {
          id: otherSid,
          deviceName: null,
          ipAddress: null,
          createdAt: createdAt2.toISOString(),
          expiresAt: expiresAt2.toISOString(),
          isCurrent: false,
        },
      ]);
      expect(Object.keys(result[0] ?? {}).sort()).toEqual([
        "createdAt",
        "deviceName",
        "expiresAt",
        "id",
        "ipAddress",
        "isCurrent",
      ]);
    });

    it("marks all sessions as not current when sid does not match any active row", async () => {
      const createdAt = new Date("2026-11-27T10:00:00.000Z");
      const expiresAt = new Date("2026-12-04T10:00:00.000Z");
      mockDb.setSelectResult([
        {
          id: "019fa8bc-8f4d-7000-b366-e691f45cfb91",
          deviceName: "Mobile Safari",
          ipAddress: "198.51.100.5",
          createdAt,
          expiresAt,
        },
      ]);

      const result = await service.listCustomerSessions(
        "user-id",
        "019fa8bc-8f4d-7000-b366-e691f45cfb99",
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.isCurrent).toBe(false);
    });
  });
});
