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
  payload: { sub: string; email: string; role: string; jti?: string },
): Promise<string> {
  const { jti = randomUUID(), ...rest } = payload;
  return jwtService.signAsync(
    {
      jti,
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

export async function createAuthenticatedAdmin(
  db: DrizzleDB,
  jwtService: JwtService,
  overrides: Partial<NewUser> = {},
): Promise<AuthenticatedSession> {
  return createAuthenticatedUser(db, jwtService, {
    role: UserRole.SUPER_ADMIN,
    ...overrides,
  });
}

export interface CapturedMailTokens {
  verificationTokens: { to: string; fullName: string; token: string }[];
  passwordResetTokens: { to: string; fullName: string; token: string }[];
  getLatestVerificationToken: (email?: string) => string | undefined;
  getLatestResetToken: (email?: string) => string | undefined;
  clear: () => void;
  verificationSpy: ReturnType<typeof spyOn>;
  resetSpy: ReturnType<typeof spyOn>;
}

export function captureMailTokens(app: INestApplication): CapturedMailTokens {
  const mailService = app.get(MailService);
  const verificationTokens: {
    to: string;
    fullName: string;
    token: string;
  }[] = [];
  const passwordResetTokens: {
    to: string;
    fullName: string;
    token: string;
  }[] = [];

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
    passwordResetTokens.push({ to, fullName, token });
    return Promise.resolve();
  });

  return {
    verificationTokens,
    passwordResetTokens,
    getLatestVerificationToken(email?: string) {
      if (email) {
        const matching = verificationTokens.filter(
          (item) => item.to.toLowerCase() === email.toLowerCase(),
        );
        return matching[matching.length - 1]?.token;
      }
      return verificationTokens[verificationTokens.length - 1]?.token;
    },
    getLatestResetToken(email?: string) {
      if (email) {
        const matching = passwordResetTokens.filter(
          (item) => item.to.toLowerCase() === email.toLowerCase(),
        );
        return matching[matching.length - 1]?.token;
      }
      return passwordResetTokens[passwordResetTokens.length - 1]?.token;
    },
    clear() {
      verificationTokens.length = 0;
      passwordResetTokens.length = 0;
      verificationSpy.mockClear();
      resetSpy.mockClear();
    },
    verificationSpy,
    resetSpy,
  };
}
