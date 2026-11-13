#!/usr/bin/env bun
/**
 * Single source of truth product version, mirrored across workspace manifests.
 *
 * Manifests synchronized:
 *   - package.json (root)
 *   - apps/api/package.json (when present)
 *   - apps/storefront/package.json (when present)
 *   - apps/backoffice/package.json (when present)
 *   - packages/shared/package.json
 *
 * The API OpenAPI document reads `apps/api/package.json` at runtime, so it
 * follows this script without a second version constant.
 *
 * Usage:
 *   bun scripts/version.ts check                    # exit 1 if manifests disagree
 *   bun scripts/version.ts current                  # print current root version
 *   bun scripts/version.ts bump <1.2.3|patch|minor|major>
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const CANDIDATES = [
  "package.json",
  "apps/api/package.json",
  "apps/storefront/package.json",
  "apps/backoffice/package.json",
  "packages/shared/package.json",
  "packages/ui/package.json",
] as const;

export const MANIFESTS = CANDIDATES.filter((path) => existsSync(path));

export const SEMVER =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/** Read the declared version from a package.json manifest. */
export function readVersion(path: string): string | undefined {
  try {
    const json = JSON.parse(readFileSync(path, "utf8")) as { version?: string };
    return json.version;
  } catch {
    return undefined;
  }
}

/** Version declared by the root package.json. */
export function currentVersion(): string | undefined {
  return readVersion(MANIFESTS[0] ?? "package.json");
}

/** Manifest paths whose version disagrees with the root package.json. */
export function mismatchedManifests(): string[] {
  const root = currentVersion();
  return MANIFESTS.filter((path) => readVersion(path) !== root);
}

/** Write the version into a single manifest, preserving formatting. */
export function writeManifest(path: string, version: string): void {
  const content = readFileSync(path, "utf8");
  const updated = content.replace(
    /("version"\s*:\s*)"[^"]+"/,
    `$1"${version}"`,
  );
  writeFileSync(path, updated, "utf8");
}

/** Write the version to every existing workspace manifest. */
export function setVersion(version: string): void {
  for (const path of MANIFESTS) {
    console.log(`  Writing v${version} -> ${path}`);
    writeManifest(path, version);
  }
}

/** -1 / 0 / 1 comparison across major, minor, patch. */
export function compareVersions(a: string, b: string): number {
  const clean = (v: string) => v.replace(/^v/, "").split("-")[0] ?? "";
  const left = clean(a).split(".").map(Number);
  const right = clean(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

/** Resolve a target version from an explicit semver or patch|minor|major. */
export function resolveTarget(
  input: string,
  baseVersion: string = currentVersion() ?? "0.1.0",
): string {
  const cleanInput = input.replace(/^v/, "");
  if (SEMVER.test(cleanInput)) return cleanInput;
  if (input === "patch" || input === "minor" || input === "major") {
    const clean = baseVersion.replace(/^v/, "").split("-")[0] ?? "0.0.0";
    const [major = 0, minor = 0, patch = 0] = clean.split(".").map(Number);
    if (input === "major") return `${major + 1}.0.0`;
    if (input === "minor") return `${major}.${minor + 1}.0`;
    return `${major}.${minor}.${patch + 1}`;
  }
  throw new Error(
    `Invalid version or bump type: ${input}. Expected semver or patch|minor|major.`,
  );
}

if (import.meta.main) {
  const [, , mode, target] = process.argv;

  if (mode === "check") {
    const root = currentVersion();
    const mismatched = mismatchedManifests();
    if (!root || mismatched.length > 0) {
      console.error(
        `version mismatch: ${MANIFESTS[0] ?? "package.json"} is ${root ?? "missing"}`,
      );
      for (const path of mismatched) {
        console.error(`  ${path}: ${readVersion(path) ?? "missing"}`);
      }
      console.error("run: bun scripts/version.ts bump <x.y.z>");
      process.exit(1);
    }
    console.log(`versions aligned at v${root}`);
  } else if (mode === "current") {
    console.log(currentVersion() ?? "0.0.0");
  } else if (mode === "bump") {
    if (!target) {
      console.error(
        "usage: bun scripts/version.ts bump <x.y.z|patch|minor|major>",
      );
      process.exit(1);
    }
    const resolved = resolveTarget(target);
    setVersion(resolved);
    console.log(`wrote v${resolved} to ${MANIFESTS.length} manifests`);
  } else {
    console.error(
      "usage: bun scripts/version.ts check | current | bump <x.y.z|patch|minor|major>",
    );
    process.exit(1);
  }
}
