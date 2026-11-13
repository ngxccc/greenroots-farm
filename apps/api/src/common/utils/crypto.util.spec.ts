import { describe, expect, test } from "bun:test";
import {
  generateRefreshToken,
  hashPassword,
  hashRefreshToken,
  sha256,
  verifyPassword,
} from "./crypto.util";

describe("password hashing (scrypt s1$<salt>$<hash>)", () => {
  test("produces a versioned scrypt hash", async () => {
    const hash = await hashPassword("GreenRoots@2026");

    expect(hash.startsWith("s1$")).toBe(true);
    expect(hash.split("$")).toHaveLength(3);
    expect(hash).toMatch(/^s1\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  });

  test("verifies the correct password", async () => {
    const hash = await hashPassword("GreenRoots@2026");
    expect(await verifyPassword("GreenRoots@2026", hash)).toBe(true);
  });

  test("rejects a wrong password and malformed hashes", async () => {
    const hash = await hashPassword("GreenRoots@2026");

    expect(await verifyPassword("wrong-password", hash)).toBe(false);
    expect(await verifyPassword("GreenRoots@2026", "plain")).toBe(false);
    expect(await verifyPassword("GreenRoots@2026", "s2$ab$cd")).toBe(false);
  });
});

describe("token hashing", () => {
  test("sha256 returns a deterministic 64-char digest", () => {
    expect(sha256("greenroots")).toBe(sha256("greenroots"));
    expect(sha256("greenroots")).toMatch(/^[0-9a-f]{64}$/);
  });

  test("refresh tokens are opaque 256-bit hex values", () => {
    const token = generateRefreshToken();

    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(new Set([token, generateRefreshToken()]).size).toBe(2);
    expect(hashRefreshToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRefreshToken(token)).not.toBe(token);
  });
});
