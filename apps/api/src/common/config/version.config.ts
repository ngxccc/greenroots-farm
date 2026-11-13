import { readFileSync } from "node:fs";

interface PackageManifest {
  version?: string;
}

const FALLBACK_VERSION = "0.0.0";

/**
 * Reads the API workspace version from its package manifest.
 *
 * The path resolves identically from `src/common/config` and
 * `dist/common/config`, so the OpenAPI document follows the version written by
 * `scripts/version.ts bump` without a second source of truth.
 */
export function readApiVersion(): string {
  try {
    const manifest = JSON.parse(
      readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
    ) as PackageManifest;

    return manifest.version ?? FALLBACK_VERSION;
  } catch {
    return FALLBACK_VERSION;
  }
}

export const API_VERSION = readApiVersion();
