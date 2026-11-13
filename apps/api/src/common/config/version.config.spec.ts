import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { API_VERSION } from "./version.config";

interface PackageManifest {
  version: string;
}

describe("API version", () => {
  test("matches the apps/api package manifest", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
    ) as PackageManifest;

    expect(API_VERSION).toBe(manifest.version);
  });
});
