import { randomUUID } from "node:crypto";
import { spyOn } from "bun:test";
import type { INestApplication } from "@nestjs/common";
import type { JwtService } from "@nestjs/jwt";
import type { DrizzleDB } from "@/database/database.module";
import type { User, NewUser } from "@/database/schemas";
import { createUser } from "../factories/user.factory";
import { UserRole } from "@greenroots/shared";
import { MailService } from "@/modules/mail/mail.service";

export interface AuthenticatedSession {
  user: User;
  token: string;
  authHeader: { Authorization: string };
}

export async function generateTestToken(
  jwtService: JwtService,
  payload: {
    sub: string;
    email: string;
    role: string;
    jti?: string;
    sid?: string;
  },
): Promise<string> {
  const { jti = randomUUID(), sid = randomUUID(), ...rest } = payload;
  return jwtService.signAsync(
    {
      jti,
      sid,
      ...rest,
    },
    {
      expiresIn: "15m",
    },
  );
}

export async function createAuthenticatedUser(
  db: DrizzleDB,
  jwtService: JwtService,
  overrides: Partial<NewUser> = {},
): Promise<AuthenticatedSession> {
  const user = await createUser(db, {
    role: UserRole.CUSTOMER,
    emailVerified: true,
    ...overrides,
  });

  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
  };

  const token = await generateTestToken(jwtService, payload);

  return {
    user,
    token,
    authHeader: { Authorization: `Bearer ${token}` },
  };
}

/**
 * Creates an authenticated staff/admin test session with an explicit role (defaults to `super_admin`).
 * Supports both `(db, jwtService, role, overrides)` and backward-compatible `(db, jwtService, overrides)`.
 *
 * @param db Drizzle client.
 * @param jwtService NestJS JWT service.
 * @param role Explicit `UserRole` for RBAC matrix coverage, or column overrides when omitted.
 * @param overrides Optional user column overrides.
 * @returns Authenticated user, signed JWT, and bearer authorization header.
 */
export async function createAuthenticatedAdmin(
  db: DrizzleDB,
  jwtService: JwtService,
  role?: UserRole,
  overrides?: Partial<NewUser>,
): Promise<AuthenticatedSession>;
export async function createAuthenticatedAdmin(
  db: DrizzleDB,
  jwtService: JwtService,
  overrides: Partial<NewUser>,
): Promise<AuthenticatedSession>;
export async function createAuthenticatedAdmin(
  db: DrizzleDB,
  jwtService: JwtService,
  roleOrOverrides: UserRole | Partial<NewUser> = UserRole.SUPER_ADMIN,
  overrides: Partial<NewUser> = {},
): Promise<AuthenticatedSession> {
  if (typeof roleOrOverrides === "string") {
    return createAuthenticatedUser(db, jwtService, {
      role: roleOrOverrides,
      ...overrides,
    });
  }
  return createAuthenticatedUser(db, jwtService, {
    role: UserRole.SUPER_ADMIN,
    ...roleOrOverrides,
  });
}

/**
 * Spy registry capturing outbound authentication and staff onboarding/reset tokens in integration tests.
 */
export interface CapturedMailTokens {
  verificationTokens: { to: string; fullName: string; token: string }[];
  recoveryTokens: { to: string; fullName: string; token: string }[];
  staffInviteTokens: { to: string; fullName: string; token: string }[];
  staffResetTokens: { to: string; fullName: string; token: string }[];
  getLatestVerificationToken: (email?: string) => string | undefined;
  getLatestResetToken: (email?: string) => string | undefined;
  getLatestStaffInviteToken: (email?: string) => string | undefined;
  getLatestStaffResetToken: (email?: string) => string | undefined;
  clear: () => void;
  verificationSpy: ReturnType<typeof spyOn>;
  resetSpy: ReturnType<typeof spyOn>;
  staffInviteSpy: ReturnType<typeof spyOn>;
  staffResetSpy: ReturnType<typeof spyOn>;
}

/**
 * Intercepts outbound verification, password-reset, and staff onboarding/reset mail tokens in tests.
 *
 * @param app Initialized NestJS test application.
 * @returns Token capture registry and spy handles.
 */
export function captureMailTokens(app: INestApplication): CapturedMailTokens {
  const mailService = app.get(MailService);
  const verificationTokens: {
    to: string;
    fullName: string;
    token: string;
  }[] = [];
  const recoveryTokens: {
    to: string;
    fullName: string;
    token: string;
  }[] = [];
  const staffInviteTokens: {
    to: string;
    fullName: string;
    token: string;
  }[] = [];
  const staffResetTokens: {
    to: string;
    fullName: string;
    token: string;
  }[] = [];

  const findLatest = (
    items: { to: string; token: string }[],
    email?: string,
  ): string | undefined => {
    if (email) {
      const matching = items.filter(
        (item) => item.to.toLowerCase() === email.toLowerCase(),
      );
      return matching[matching.length - 1]?.token;
    }
    return items[items.length - 1]?.token;
  };

  const verificationSpy = spyOn(
    mailService,
    "sendVerificationEmail",
  ).mockImplementation((to: string, fullName: string, token: string) => {
    verificationTokens.push({ to, fullName, token });
    return Promise.resolve();
  });

  const resetSpy = spyOn(
    mailService,
    "sendPasswordResetEmail",
  ).mockImplementation((to: string, fullName: string, token: string) => {
    recoveryTokens.push({ to, fullName, token });
    return Promise.resolve();
  });

  const staffInviteSpy = spyOn(
    mailService,
    "sendStaffInvitationEmail",
  ).mockImplementation((to: string, fullName: string, token: string) => {
    staffInviteTokens.push({ to, fullName, token });
    recoveryTokens.push({ to, fullName, token });
    return Promise.resolve();
  });

  const staffResetSpy = spyOn(
    mailService,
    "sendStaffCredentialResetEmail",
  ).mockImplementation((to: string, fullName: string, token: string) => {
    staffResetTokens.push({ to, fullName, token });
    recoveryTokens.push({ to, fullName, token });
    return Promise.resolve();
  });

  return {
    verificationTokens,
    recoveryTokens,
    staffInviteTokens,
    staffResetTokens,
    getLatestVerificationToken(email?: string) {
      return findLatest(verificationTokens, email);
    },
    getLatestResetToken(email?: string) {
      return findLatest(recoveryTokens, email);
    },
    getLatestStaffInviteToken(email?: string) {
      return findLatest(staffInviteTokens, email);
    },
    getLatestStaffResetToken(email?: string) {
      return findLatest(staffResetTokens, email);
    },
    clear() {
      verificationTokens.length = 0;
      recoveryTokens.length = 0;
      staffInviteTokens.length = 0;
      staffResetTokens.length = 0;
      verificationSpy.mockClear();
      resetSpy.mockClear();
      staffInviteSpy.mockClear();
      staffResetSpy.mockClear();
    },
    verificationSpy,
    resetSpy,
    staffInviteSpy,
    staffResetSpy,
  };
}
