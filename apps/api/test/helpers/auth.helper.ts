import type { JwtService } from "@nestjs/jwt";
import type { DrizzleDB } from "@/database/database.module";
import type { User, NewUser } from "@/database/schemas";
import { createUser } from "../factories/user.factory";
import { UserRole } from "@greenroots/shared";

export interface AuthenticatedSession {
  user: User;
  token: string;
  authHeader: { Authorization: string };
}

export async function generateTestToken(
  jwtService: JwtService,
  payload: { sub: string; email: string; role: string },
): Promise<string> {
  return jwtService.signAsync(payload);
}

export async function createAuthenticatedUser(
  db: DrizzleDB,
  jwtService: JwtService,
  overrides: Partial<NewUser> = {},
): Promise<AuthenticatedSession> {
  const user = await createUser(db, {
    role: UserRole.CUSTOMER,
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
