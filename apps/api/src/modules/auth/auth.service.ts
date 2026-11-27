import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { randomBytes, randomUUID } from "node:crypto";
import {
  API_ERROR_CODES,
  AuthSurface,
  isStaffRole,
  UserRole,
  UserStatus,
} from "@greenroots/shared";
import { env } from "@/common/config/env.config";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  AUTH_REVOCATION_TTL_SECONDS,
  RESEND_VERIFICATION_COOLDOWN_SECONDS,
  RESET_PASSWORD_TOKEN_BYTES,
  STAFF_INVITE_TOKEN_TTL_SECONDS,
} from "@/common/constants/auth.constant";
import { PG_ERROR_CODE } from "@/common/constants/error.constant";
import { MESSAGES } from "@/common/constants/messages.constant";
import { RedisService } from "@/common/services/redis.service";
import type { ClientMetadata } from "@/common/utils/client-info.util";
import {
  generateRefreshToken,
  hashPassword,
  sha256,
  verifyPassword,
} from "@/common/utils/crypto.util";
import { extractDatabaseErrorDetails } from "@/common/utils/error.util";
import { getExpiryDate } from "@/common/utils/time.util";
import {
  DATABASE_CONNECTION,
  type DrizzleDB,
  type DrizzleTx,
} from "@/database/database.module";
import { refreshTokens, users } from "@/database/schemas";
import { STAFF_USER_COLUMNS } from "@/database/utils/user-projections";
import { MailService } from "@/modules/mail/mail.service";
import { MAX_ACTIVE_SESSIONS_LIST } from "./auth.constant";
import type {
  ActiveSession,
  ForgotPasswordDto,
  LoginDto,
  LoginResponseDto,
  RefreshTokenDto,
  RegisterDto,
  ResendVerificationDto,
  ResetPasswordDto,
} from "./dto";

@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DrizzleDB,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly mailService: MailService,
  ) {}

  /**
   * Checks whether a user's role is permitted on the given authentication surface.
   */
  private isRoleAllowedForSurface(
    role: UserRole,
    surface: AuthSurface,
  ): boolean {
    if (surface === AuthSurface.CUSTOMER) {
      return role === UserRole.CUSTOMER;
    }
    return isStaffRole(role);
  }

  /**
   * Generates a short-lived access token with standard claims and an opaque refresh token.
   */
  private async createTokenSession(
    userId: string,
    email: string,
    role: UserRole,
    surface: AuthSurface,
    metadata?: ClientMetadata,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const refreshToken = generateRefreshToken();
    const tokenHash = sha256(refreshToken);
    const expiresAt = getExpiryDate("7d");

    // Persist the refresh session first so its UUIDv7 id can be embedded as the JWT `sid` claim.
    const [insertedSession] = await this.db
      .insert(refreshTokens)
      .values({
        userId,
        token: tokenHash,
        surface,
        deviceName: metadata?.deviceName ?? null,
        ipAddress: metadata?.ipAddress ?? null,
        expiresAt,
      })
      .returning({ id: refreshTokens.id });

    if (!insertedSession) {
      throw new Error("Failed to create refresh token session.");
    }

    const jti = randomUUID();
    const payload = {
      sub: userId,
      email,
      role,
      jti,
      sid: insertedSession.id,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: env.JWT_ACCESS_SECRET,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });

    return { accessToken, refreshToken };
  }

  /**
   * Lists non-expired active customer sessions for the authenticated user.
   *
   * @param userId Authenticated customer UUID (`jwt.sub`).
   * @param currentSessionId Refresh session ID from `jwt.sid` to flag `isCurrent`.
   * @returns Bounded closed projection ordered newest-first.
   */
  async listCustomerSessions(
    userId: string,
    currentSessionId: string,
  ): Promise<ActiveSession[]> {
    const rows = await this.db
      .select({
        id: refreshTokens.id,
        deviceName: refreshTokens.deviceName,
        ipAddress: refreshTokens.ipAddress,
        createdAt: refreshTokens.createdAt,
        expiresAt: refreshTokens.expiresAt,
      })
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.userId, userId),
          eq(refreshTokens.surface, AuthSurface.CUSTOMER),
          gt(refreshTokens.expiresAt, sql`NOW()`),
        ),
      )
      .orderBy(desc(refreshTokens.createdAt), desc(refreshTokens.id))
      .limit(MAX_ACTIVE_SESSIONS_LIST);

    return rows.map((row) => ({
      id: row.id,
      deviceName: row.deviceName,
      ipAddress: row.ipAddress,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      isCurrent: row.id === currentSessionId,
    }));
  }

  /**
   * Registers a customer account with unverified status and dispatches an activation email.
   */
  async register(dto: RegisterDto): Promise<void> {
    const normalizedEmail = dto.email.toLowerCase().trim();

    const [existingUser] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, normalizedEmail), isNull(users.deletedAt)))
      .limit(1);

    if (existingUser) {
      throw new ConflictException({
        code: API_ERROR_CODES.AUTH_EMAIL_ALREADY_EXISTS,
        detail: MESSAGES.AUTH.EMAIL_ALREADY_EXISTS,
      });
    }

    const passwordHash = await hashPassword(dto.password);
    const rawVerificationToken = randomBytes(32).toString("hex");
    const verificationExpiresAt = getExpiryDate("24h");
    const phone = dto.phone ?? null;

    try {
      await this.db.insert(users).values({
        email: normalizedEmail,
        fullName: dto.fullName.trim(),
        phone,
        password: passwordHash,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerified: false,
        verificationToken: sha256(rawVerificationToken),
        verificationExpiresAt,
      });
    } catch (error) {
      const dbError = extractDatabaseErrorDetails(error);
      if (dbError.code === PG_ERROR_CODE.UNIQUE_VIOLATION) {
        throw new ConflictException({
          code: API_ERROR_CODES.AUTH_EMAIL_ALREADY_EXISTS,
          detail: MESSAGES.AUTH.EMAIL_ALREADY_EXISTS,
        });
      }
      throw error;
    }

    await this.mailService.sendVerificationEmail(
      normalizedEmail,
      dto.fullName.trim(),
      rawVerificationToken,
    );
  }

  /**
   * Verifies email token, activating the account for login.
   */
  async verifyEmail(token: string): Promise<void> {
    const hashedToken = sha256(token);

    const [user] = await this.db
      .select({
        id: users.id,
        verificationExpiresAt: users.verificationExpiresAt,
      })
      .from(users)
      .where(
        and(eq(users.verificationToken, hashedToken), isNull(users.deletedAt)),
      )
      .limit(1);

    if (!user) {
      throw new BadRequestException({
        code: API_ERROR_CODES.AUTH_VERIFICATION_TOKEN_INVALID,
        detail: MESSAGES.AUTH.VERIFICATION_TOKEN_INVALID,
      });
    }

    if (user.verificationExpiresAt && user.verificationExpiresAt < new Date()) {
      throw new BadRequestException({
        code: API_ERROR_CODES.AUTH_VERIFICATION_TOKEN_INVALID,
        detail: MESSAGES.AUTH.VERIFICATION_TOKEN_INVALID,
      });
    }

    await this.db
      .update(users)
      .set({
        emailVerified: true,
        verificationToken: null,
        verificationExpiresAt: null,
      })
      .where(eq(users.id, user.id));
  }

  /**
   * Resends verification email with anti-enumeration protection and 60-second cooldown.
   */
  async resendVerificationEmail(dto: ResendVerificationDto): Promise<void> {
    const normalizedEmail = dto.email.toLowerCase().trim();

    const [user] = await this.db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        status: users.status,
        emailVerified: users.emailVerified,
        verificationExpiresAt: users.verificationExpiresAt,
      })
      .from(users)
      .where(and(eq(users.email, normalizedEmail), isNull(users.deletedAt)))
      .limit(1);

    // Anti-enumeration silence: exit cleanly if user missing, already verified, suspended, or inactive
    if (
      !user ||
      user.emailVerified ||
      user.status === UserStatus.SUSPENDED ||
      user.status === UserStatus.INACTIVE
    ) {
      return;
    }

    // Enforce 60-second cooldown between resend attempts via Redis
    const cooldownKey = `auth:cooldown:resend:${user.id}`;
    let inCooldown = false;
    try {
      const client = this.redisService.getClient();
      const flag = await client.get(cooldownKey);
      if (flag) {
        inCooldown = true;
      }
    } catch {
      // Degraded/unreachable Redis fails open for resilience
    }

    if (inCooldown) {
      return;
    }

    const rawToken = randomBytes(32).toString("hex");
    const verificationExpiresAt = getExpiryDate("24h");

    await this.db
      .update(users)
      .set({
        verificationToken: sha256(rawToken),
        verificationExpiresAt,
      })
      .where(eq(users.id, user.id));

    await this.mailService.sendVerificationEmail(
      user.email,
      user.fullName,
      rawToken,
    );

    try {
      const client = this.redisService.getClient();
      await client.set(
        cooldownKey,
        "1",
        "EX",
        RESEND_VERIFICATION_COOLDOWN_SECONDS,
      );
    } catch {
      // Best-effort cooldown key storage
    }
  }

  /**
   * Authenticates credentials, verifying surface role, email verification, and active status.
   */
  async login(
    dto: LoginDto,
    surface: AuthSurface,
    metadata?: ClientMetadata,
  ): Promise<LoginResponseDto> {
    const normalizedEmail = dto.email.toLowerCase().trim();

    const [user] = await this.db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        role: users.role,
        status: users.status,
        password: users.password,
        emailVerified: users.emailVerified,
      })
      .from(users)
      .where(and(eq(users.email, normalizedEmail), isNull(users.deletedAt)))
      .limit(1);

    if (!user?.password) {
      throw new UnauthorizedException({
        code: API_ERROR_CODES.AUTH_INVALID_CREDENTIALS,
        detail: MESSAGES.AUTH.INVALID_CREDENTIALS,
      });
    }

    const isMatch = await verifyPassword(dto.password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException({
        code: API_ERROR_CODES.AUTH_INVALID_CREDENTIALS,
        detail: MESSAGES.AUTH.INVALID_CREDENTIALS,
      });
    }

    // Check surface role before emailVerified/status to prevent cross-surface status leakage.
    if (!this.isRoleAllowedForSurface(user.role, surface)) {
      throw new ForbiddenException({
        code: API_ERROR_CODES.AUTH_SURFACE_FORBIDDEN,
        detail: MESSAGES.AUTH.SURFACE_FORBIDDEN,
      });
    }

    if (!user.emailVerified) {
      throw new ForbiddenException({
        code: API_ERROR_CODES.AUTH_EMAIL_NOT_VERIFIED,
        detail: MESSAGES.AUTH.EMAIL_NOT_VERIFIED,
      });
    }

    if (
      user.status === UserStatus.SUSPENDED ||
      user.status === UserStatus.INACTIVE
    ) {
      throw new ForbiddenException({
        code: API_ERROR_CODES.AUTH_ACCOUNT_SUSPENDED,
        detail: MESSAGES.AUTH.ACCOUNT_SUSPENDED,
      });
    }

    const { accessToken, refreshToken } = await this.createTokenSession(
      user.id,
      user.email,
      user.role,
      surface,
      metadata,
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        status: user.status,
      },
    };
  }

  /**
   * Rotates surface-bound refresh token atomically via DELETE ... RETURNING and issues a new pair.
   */
  async refreshToken(
    dto: RefreshTokenDto,
    surface: AuthSurface,
    metadata?: ClientMetadata,
  ): Promise<LoginResponseDto> {
    const hashedIncoming = sha256(dto.refreshToken);

    const [deletedToken] = await this.db
      .delete(refreshTokens)
      .where(eq(refreshTokens.token, hashedIncoming))
      .returning({
        id: refreshTokens.id,
        userId: refreshTokens.userId,
        surface: refreshTokens.surface,
        expiresAt: refreshTokens.expiresAt,
      });

    if (!deletedToken || deletedToken.expiresAt < new Date()) {
      throw new UnauthorizedException({
        code: API_ERROR_CODES.AUTH_TOKEN_INVALID_OR_EXPIRED,
        detail: MESSAGES.AUTH.TOKEN_INVALID_OR_EXPIRED,
      });
    }

    if (deletedToken.surface !== surface) {
      throw new ForbiddenException({
        code: API_ERROR_CODES.AUTH_SURFACE_FORBIDDEN,
        detail: MESSAGES.AUTH.SURFACE_FORBIDDEN,
      });
    }

    const [user] = await this.db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        role: users.role,
        status: users.status,
      })
      .from(users)
      .where(and(eq(users.id, deletedToken.userId), isNull(users.deletedAt)))
      .limit(1);

    if (!user) {
      throw new UnauthorizedException({
        code: API_ERROR_CODES.AUTH_TOKEN_INVALID_OR_EXPIRED,
        detail: MESSAGES.AUTH.TOKEN_INVALID_OR_EXPIRED,
      });
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException({
        code: API_ERROR_CODES.AUTH_ACCOUNT_SUSPENDED,
        detail: MESSAGES.AUTH.ACCOUNT_SUSPENDED,
      });
    }

    if (!this.isRoleAllowedForSurface(user.role, surface)) {
      throw new ForbiddenException({
        code: API_ERROR_CODES.AUTH_SURFACE_FORBIDDEN,
        detail: MESSAGES.AUTH.SURFACE_FORBIDDEN,
      });
    }

    const { accessToken, refreshToken } = await this.createTokenSession(
      user.id,
      user.email,
      user.role,
      surface,
      metadata,
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        status: user.status,
      },
    };
  }

  /**
   * Revokes current refresh session and optionally blacklists active access token in Redis.
   */
  async logout(refreshToken?: string, accessToken?: string): Promise<void> {
    if (refreshToken) {
      const hashedIncoming = sha256(refreshToken);
      await this.db
        .delete(refreshTokens)
        .where(eq(refreshTokens.token, hashedIncoming));
    }

    if (accessToken) {
      try {
        const decoded = this.jwtService.decode<{
          jti?: string;
          exp?: number;
        } | null>(accessToken);

        if (decoded?.jti) {
          const remainingSeconds = decoded.exp
            ? Math.max(decoded.exp - Math.floor(Date.now() / 1000), 0)
            : AUTH_REVOCATION_TTL_SECONDS;
          if (remainingSeconds > 0) {
            await this.redisService.revokeToken(decoded.jti, remainingSeconds);
          }
        }
      } catch {
        // Best effort: ignore malformed or un-decodable bearer token on logout
      }
    }
  }

  /**
   * Revokes all active refresh sessions for user and records global Redis blacklist key.
   */
  async logoutAll(userId: string): Promise<void> {
    if (!userId) {
      throw new UnauthorizedException({
        code: API_ERROR_CODES.AUTH_TOKEN_INVALID_OR_EXPIRED,
        detail: MESSAGES.AUTH.TOKEN_INVALID_OR_EXPIRED,
      });
    }

    await this.db.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
    await this.redisService.revokeUser(userId, AUTH_REVOCATION_TTL_SECONDS);
  }

  /**
   * Generates password recovery token with anti-enumeration protection.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const normalizedEmail = dto.email.toLowerCase().trim();

    const [user] = await this.db
      .select({
        id: users.id,
        fullName: users.fullName,
        role: users.role,
        status: users.status,
      })
      .from(users)
      .where(and(eq(users.email, normalizedEmail), isNull(users.deletedAt)))
      .limit(1);

    if (
      !user ||
      user.status === UserStatus.SUSPENDED ||
      user.status === UserStatus.INACTIVE
    ) {
      return;
    }

    const rawToken = randomBytes(32).toString("hex");
    const resetPasswordExpiresAt = getExpiryDate("15m");

    await this.db
      .update(users)
      .set({
        resetPasswordToken: sha256(rawToken),
        resetPasswordExpiresAt,
      })
      .where(eq(users.id, user.id));

    await this.mailService.sendPasswordResetEmail(
      normalizedEmail,
      user.fullName,
      rawToken,
      isStaffRole(user.role),
    );
  }

  /**
   * Resets password with valid token, marks email verified, and invalidates all existing sessions globally.
   */
  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const hashedToken = sha256(dto.token);

    const [user] = await this.db
      .select({
        id: users.id,
        status: users.status,
        resetPasswordExpiresAt: users.resetPasswordExpiresAt,
      })
      .from(users)
      .where(
        and(eq(users.resetPasswordToken, hashedToken), isNull(users.deletedAt)),
      )
      .limit(1);

    if (
      !user?.resetPasswordExpiresAt ||
      user.resetPasswordExpiresAt < new Date()
    ) {
      throw new BadRequestException({
        code: API_ERROR_CODES.AUTH_RESET_TOKEN_INVALID,
        detail: MESSAGES.AUTH.RESET_TOKEN_INVALID,
      });
    }

    if (
      user.status === UserStatus.SUSPENDED ||
      user.status === UserStatus.INACTIVE
    ) {
      throw new ForbiddenException({
        code: API_ERROR_CODES.AUTH_ACCOUNT_SUSPENDED,
        detail: MESSAGES.AUTH.ACCOUNT_SUSPENDED,
      });
    }

    const passwordHash = await hashPassword(dto.password);

    await this.db
      .update(users)
      .set({
        password: passwordHash,
        emailVerified: true,
        resetPasswordToken: null,
        resetPasswordExpiresAt: null,
      })
      .where(eq(users.id, user.id));

    // Invalidate all active sessions in DB and access tokens in Redis
    await this.db
      .delete(refreshTokens)
      .where(eq(refreshTokens.userId, user.id));
    await this.redisService.revokeUser(user.id, AUTH_REVOCATION_TTL_SECONDS);
  }

  /**
   * Generates cryptographic credentials outside a database transaction for staff onboarding or resets.
   *
   * @returns Unusable scrypt password hash plus 24-hour raw/hashed reset token pair.
   */
  async prepareStaffCredentials(): Promise<{
    unusablePasswordHash: string;
    rawToken: string;
    tokenHash: string;
    expiresAt: Date;
  }> {
    const unusableSecret = randomBytes(RESET_PASSWORD_TOKEN_BYTES).toString(
      "hex",
    );
    const unusablePasswordHash = await hashPassword(unusableSecret);
    const tokenPair = this.generateStaffResetToken();
    return {
      unusablePasswordHash,
      ...tokenPair,
    };
  }

  /**
   * Generates a fresh 24-hour staff reset token pair outside a database transaction.
   *
   * @returns Raw hex token, SHA-256 digest, and 24-hour expiration date.
   */
  generateStaffResetToken(): {
    rawToken: string;
    tokenHash: string;
    expiresAt: Date;
  } {
    const rawToken = randomBytes(RESET_PASSWORD_TOKEN_BYTES).toString("hex");
    return {
      rawToken,
      tokenHash: sha256(rawToken),
      expiresAt: getExpiryDate(STAFF_INVITE_TOKEN_TTL_SECONDS),
    };
  }

  /**
   * Creates an invited staff user row inside the caller's transaction per ADR-0020.
   *
   * @param tx Active database transaction.
   * @param input Normalized staff identity and hashed reset credentials.
   * @returns Created staff projection excluding secret columns.
   */
  async createStaffIdentity(
    tx: DrizzleTx,
    input: {
      email: string;
      fullName: string;
      phone: string | null;
      role: UserRole;
      passwordHash: string;
      tokenHash: string;
      expiresAt: Date;
    },
  ) {
    const [created] = await tx
      .insert(users)
      .values({
        email: input.email,
        fullName: input.fullName,
        phone: input.phone,
        password: input.passwordHash,
        role: input.role,
        status: UserStatus.ACTIVE,
        emailVerified: false,
        resetPasswordToken: input.tokenHash,
        resetPasswordExpiresAt: input.expiresAt,
      })
      .returning(STAFF_USER_COLUMNS);

    if (!created) {
      throw new Error("Failed to insert staff identity row.");
    }

    return created;
  }

  /**
   * Persists a SHA-256 credential-reset token inside the caller's transaction per ADR-0020.
   *
   * @param tx Active database transaction.
   * @param userId Target staff user ID.
   * @param tokenHash SHA-256 digest of the new reset token.
   * @param expiresAt Expiration timestamp for the reset token.
   */
  async issueStaffResetToken(
    tx: DrizzleTx,
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await tx
      .update(users)
      .set({
        resetPasswordToken: tokenHash,
        resetPasswordExpiresAt: expiresAt,
      })
      .where(and(eq(users.id, userId), isNull(users.deletedAt)));
  }
}
