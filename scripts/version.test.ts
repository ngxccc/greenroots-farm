import { describe, expect, it } from "bun:test";
import {
  compareVersions,
  currentVersion,
  mismatchedManifests,
  resolveTarget,
  SEMVER,
} from "./version";

describe("version scripts", () => {
  it("accepts valid semver and rejects invalid versions", () => {
    expect(SEMVER.test("1.2.3")).toBe(true);
    expect(SEMVER.test("v1.2.3")).toBe(false);
    expect(SEMVER.test("1.2")).toBe(false);
    expect(SEMVER.test("1.2.3-beta.1")).toBe(true);
  });

  it("resolves patch, minor, and major bumps from a base version", () => {
    expect(resolveTarget("patch", "1.2.3")).toBe("1.2.4");
    expect(resolveTarget("minor", "1.2.3")).toBe("1.3.0");
    expect(resolveTarget("major", "1.2.3")).toBe("2.0.0");
  });

  it("resolves explicit versions with or without a leading v", () => {
    expect(resolveTarget("1.2.3")).toBe("1.2.3");
    expect(resolveTarget("v1.2.3")).toBe("1.2.3");
  });

  it("rejects unknown bump inputs", () => {
    expect(() => resolveTarget("banana", "1.2.3")).toThrow();
  });

  it("compares versions by major, minor, and patch", () => {
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
    expect(compareVersions("1.2.4", "1.2.3")).toBe(1);
    expect(compareVersions("1.2.3", "1.3.0")).toBe(-1);
  });

  it("keeps every workspace manifest aligned with the root version", () => {
    expect(currentVersion()).toMatch(/^\d+\.\d+\.\d+/);
    expect(mismatchedManifests()).toEqual([]);
  });
});
