import type { UserRole } from "@greenroots/shared";

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
  sid?: string;
  iat?: number;
  exp?: number;
  [key: string]: unknown;
}
