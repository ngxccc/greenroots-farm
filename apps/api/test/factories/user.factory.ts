import { randomUUID } from "node:crypto";
import type { DrizzleDB } from "@/database/database.module";
import { users, type User, type NewUser } from "@/database/schemas";
import { UserRole, UserStatus } from "@greenroots/shared";

export async function createUser(
  db: DrizzleDB,
  overrides: Partial<NewUser> = {},
): Promise<User> {
  const uid = randomUUID().slice(0, 8);

  const [user] = await db
    .insert(users)
    .values({
      email: `customer-${uid}@greenroots.farm`,
      fullName: `User Test ${uid}`,
      phone: `090${uid.slice(0, 7)}`,
      role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
      password: "$scrypt$mockPasswordHash",
      ...overrides,
    })
    .returning();

  if (!user) {
    throw new Error("Failed to create User entity in test factory");
  }

  return user;
}
