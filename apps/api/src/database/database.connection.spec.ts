import { describe, expect, test } from "bun:test";
import { normalizeDatabaseUrl } from "./database-url.util";

describe("normalizeDatabaseUrl", () => {
  test("returns undefined without a URL", () => {
    expect(normalizeDatabaseUrl(undefined)).toBeUndefined();
  });

  test("strips Neon pooler subdomains", () => {
    expect(
      normalizeDatabaseUrl(
        "postgresql://user:pass@ep-123-pooler.us-east-2.aws.neon.tech/db",
      ),
    ).toBe("postgresql://user:pass@ep-123.us-east-2.aws.neon.tech/db");
  });

  test("upgrades legacy SSL modes to verify-full", () => {
    expect(
      normalizeDatabaseUrl(
        "postgresql://user:pass@localhost:5432/db?sslmode=require",
      ),
    ).toBe("postgresql://user:pass@localhost:5432/db?sslmode=verify-full");

    expect(
      normalizeDatabaseUrl(
        "postgresql://user:pass@localhost:5432/db?sslmode=prefer",
      ),
    ).toContain("sslmode=verify-full");
  });

  test("leaves other URLs untouched", () => {
    const url = "postgresql://postgres:postgres@localhost:5432/greenroots_farm";
    expect(normalizeDatabaseUrl(url)).toBe(url);
  });
});
