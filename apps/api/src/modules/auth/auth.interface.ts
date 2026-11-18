import type { UserRole, UserStatus } from "@greenroots/shared";

/**
 * Authentication tokens returned upon successful login and token refresh.
 */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType?: string;
  expiresIn?: number;
}

/**
 * Public, sanitized user profile for authentication responses and session context.
 * Excludes sensitive credentials (password, verificationToken, resetPasswordToken).
 */
export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  status: UserStatus;
  emailVerified: boolean;
  phone?: string | null;
  rewardPoints?: number;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

/**
 * Client connection and device audit metadata.
 * Compatible with extractClientMetadata from @/common/utils/client-info.util.
 */
export interface ClientMetadata {
  ip?: string;
  ipAddress?: string;
  userAgent?: string;
  deviceName?: string;
}

/**
 * Refresh token session representation matching the database refresh_tokens schema.
 */
export interface AuthSession {
  id: string;
  sessionId?: string;
  userId: string;
  token?: string;
  clientMetadata?: ClientMetadata;
  deviceName?: string | null;
  ipAddress?: string | null;
  createdAt?: Date | string;
  expiresAt: Date | string;
}

/**
 * Decoded JWT access token claims matching RFC 7519 and JwtAuthGuard requirements.
 */
export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  jti: string;
  iat?: number;
  exp?: number;
  [key: string]: unknown;
}
