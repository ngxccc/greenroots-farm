import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import type { JwtService } from "@nestjs/jwt";
import { API_ERROR_CODES, UserRole, UserStatus } from "@greenroots/shared";
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

  const mockJwtService = {
    signAsync: mock(() => Promise.resolve("mock_jwt_access_token")),
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
      const hashedPassword = await hashPassword("Password123!");
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

      const result = await service.login(loginDto, {
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

    it("throws UnauthorizedException when user does not exist", () => {
      mockDb.setSelectResult([]);

      expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it("throws UnauthorizedException when password does not match", async () => {
      const hashedPassword = await hashPassword("DifferentPassword123!");
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

      expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it("throws ForbiddenException when emailVerified is false", async () => {
      const hashedPassword = await hashPassword("Password123!");
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

      expect(service.login(loginDto)).rejects.toThrow(ForbiddenException);
      try {
        await service.login(loginDto);
      } catch (error) {
        const forbidden = error as ForbiddenException;
        expect(forbidden.getResponse()).toEqual({
          code: API_ERROR_CODES.AUTH_EMAIL_NOT_VERIFIED,
          detail: MESSAGES.AUTH.EMAIL_NOT_VERIFIED,
        });
      }
    });

    it("throws ForbiddenException when account is suspended", async () => {
      const hashedPassword = await hashPassword("Password123!");
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

      expect(service.login(loginDto)).rejects.toThrow(ForbiddenException);
      try {
        await service.login(loginDto);
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
      ]);

      const result = await service.refreshToken(refreshDto);

      expect(mockDb.delete).toHaveBeenCalled();
      expect(result.accessToken).toBe("mock_jwt_access_token");
      expect(result.refreshToken).toMatch(/^[0-9a-f]{64}$/);
    });

    it("throws UnauthorizedException when refresh token was already rotated or invalid", () => {
      mockDb.setSelectResultsQueue([[]]);

      expect(service.refreshToken(refreshDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("throws UnauthorizedException when refresh token is expired", () => {
      mockDb.setSelectResultsQueue([
        [
          {
            id: "expired-token-id",
            userId: "user-id",
            expiresAt: new Date(Date.now() - 1000),
          },
        ],
      ]);

      expect(service.refreshToken(refreshDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("throws UnauthorizedException when user is suspended", () => {
      mockDb.setSelectResultsQueue([
        [
          {
            id: "token-id",
            userId: "user-id",
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

      expect(service.refreshToken(refreshDto)).rejects.toThrow(
        UnauthorizedException,
      );
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
});
