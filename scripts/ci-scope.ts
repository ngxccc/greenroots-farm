#!/usr/bin/env bun
/**
 * Computes job- and step-level CI execution flags from changed repository paths
 * so pull requests touching unrelated files skip redundant builds while keeping
 * formatting, secret scanning, and transitive workspace checks fail-closed.
 *
 * Usage:
 *   bun scripts/ci-scope.ts --base <sha> --head <ref>
 *   bun scripts/ci-scope.ts --all
 */
import { spawnSync } from "node:child_process";

/** Boolean execution gates emitted to `GITHUB_OUTPUT` for `ci.yml` and `security.yml`. */
export interface CiScope {
  readonly run_all: boolean;
  readonly version_consistency: boolean;
  readonly shared_package: boolean;
  readonly format_check: boolean;
  readonly syncpack: boolean;
  readonly shared_checks: boolean;
  readonly ui_checks: boolean;
  readonly scripts_checks: boolean;
  readonly tailwind: boolean;
  readonly api: boolean;
  readonly database: boolean;
  readonly storefront: boolean;
  readonly backoffice: boolean;
  readonly trivy: boolean;
  readonly bun_audit: boolean;
  readonly codeql_js: boolean;
  readonly codeql_actions: boolean;
}

/** Fail-safe scope enabling every CI and Security Scan gate. */
export const ALL_TRUE_CI_SCOPE: CiScope = {
  run_all: true,
  version_consistency: true,
  shared_package: true,
  format_check: true,
  syncpack: true,
  shared_checks: true,
  ui_checks: true,
  scripts_checks: true,
  tailwind: true,
  api: true,
  database: true,
  storefront: true,
  backoffice: true,
  trivy: true,
  bun_audit: true,
  codeql_js: true,
  codeql_actions: true,
};

const FULL_CI_EXACT_FILES = new Set([
  "package.json",
  "bun.lock",
  ".oxlintrc.json",
  ".oxfmtrc.json",
  ".syncpackrc",
  "docker-compose.yml",
  ".github/workflows/ci.yml",
]);

const FULL_CI_PREFIXES = [".github/actions/", ".husky/", "packages/shared/"];
const ROOT_TSCONFIG_PATTERN = /^tsconfig[^/]*\.json$/;
const CI_SCOPE_SCRIPT_PATTERN = /^scripts\/ci-scope\.(?:ts|test\.ts)$/;
const TEST_FILE_PATTERN = /\.(?:spec|e2e-spec|test)\.tsx?$/;
const IGNORED_OXFMT_PATTERNS = [
  /^CHANGELOG\.md$/,
  /(?:^|\/)(?:api-schema\.d\.ts|api-enums\.ts|openapi\.json|routeTree\.gen\.ts)$/,
  /(?:^|\/)src\/generated\//,
  /(?:^|\/)\.engineered-config\.json$/,
  // Matches .oxfmtrc.json ignorePatterns (`".*/**"`, `"!/.github/**"`).
  /^\.(?!github\/)[^/]+\//,
];

function isFullCiTrigger(filePath: string): boolean {
  if (FULL_CI_EXACT_FILES.has(filePath)) return true;
  if (ROOT_TSCONFIG_PATTERN.test(filePath)) return true;
  if (CI_SCOPE_SCRIPT_PATTERN.test(filePath)) return true;
  return FULL_CI_PREFIXES.some((prefix) => filePath.startsWith(prefix));
}

function isOxfmtTarget(filePath: string): boolean {
  return !IGNORED_OXFMT_PATTERNS.some((pattern) => pattern.test(filePath));
}

function isPackageManifest(filePath: string): boolean {
  return filePath === "package.json" || filePath.endsWith("/package.json");
}

function isGithubWorkflowOrAction(filePath: string): boolean {
  return (
    filePath.startsWith(".github/workflows/") ||
    filePath.startsWith(".github/actions/")
  );
}

/**
 * Splits raw `git diff --name-only -z` output into normalized POSIX file paths.
 *
 * @param rawDiff Raw NUL-delimited stdout captured from `git diff --name-only -z`.
 * @returns Normalized non-empty relative paths.
 */
export function parseNullDelimitedDiffPaths(rawDiff: string): string[] {
  return rawDiff
    .split("\0")
    .map((entry) => entry.trim().replace(/\\/g, "/"))
    .filter((entry) => entry.length > 0);
}

/**
 * Maps changed repository paths to CI and Security Scan execution flags using
 * workspace dependency edges and fail-closed defaults on empty diffs.
 *
 * @param paths Normalized repository-relative changed paths from `git diff`.
 * @returns Computed boolean gate flags for `ci.yml` and `security.yml`.
 */
export function classifyChangedPaths(paths: readonly string[]): CiScope {
  if (paths.length === 0) {
    return ALL_TRUE_CI_SCOPE;
  }

  for (const filePath of paths) {
    if (isFullCiTrigger(filePath)) {
      return ALL_TRUE_CI_SCOPE;
    }
  }

  let versionConsistency = false;
  let formatCheck = false;
  let syncpack = false;
  let uiChecks = false;
  let scriptsChecks = false;
  let tailwind = false;
  let api = false;
  let database = false;
  let storefront = false;
  let backoffice = false;
  let bunAudit = false;

  for (const filePath of paths) {
    if (isOxfmtTarget(filePath)) {
      formatCheck = true;
    }

    if (isPackageManifest(filePath)) {
      versionConsistency = true;
      syncpack = true;
      scriptsChecks = true;
      bunAudit = true;
    }

    if (filePath.startsWith("scripts/version.")) {
      versionConsistency = true;
    }

    if (filePath.startsWith("scripts/check-tailwind-canonical.")) {
      tailwind = true;
    }

    if (
      filePath.startsWith("scripts/") ||
      isGithubWorkflowOrAction(filePath) ||
      TEST_FILE_PATTERN.test(filePath)
    ) {
      scriptsChecks = true;
    }

    if (filePath.startsWith("packages/ui/")) {
      uiChecks = true;
      tailwind = true;
      storefront = true;
      backoffice = true;
    }

    if (filePath.startsWith("apps/api/")) {
      api = true;
      database = true;
    }

    if (filePath.startsWith("apps/storefront/")) {
      storefront = true;
      tailwind = true;
    }

    if (filePath.startsWith("apps/backoffice/")) {
      backoffice = true;
      tailwind = true;
    }

    if (filePath === ".github/workflows/security.yml") {
      bunAudit = true;
    }
  }

  const sharedPackage =
    formatCheck || syncpack || uiChecks || scriptsChecks || tailwind;

  return {
    run_all: false,
    version_consistency: versionConsistency,
    shared_package: sharedPackage,
    format_check: formatCheck,
    syncpack,
    // packages/shared/** already returns ALL_TRUE_CI_SCOPE early above.
    shared_checks: false,
    ui_checks: uiChecks,
    scripts_checks: scriptsChecks,
    tailwind,
    api,
    database,
    storefront,
    backoffice,
    // Trivy and both CodeQL languages always run to preserve PR SARIF baseline parity with main.
    trivy: true,
    bun_audit: bunAudit,
    codeql_js: true,
    codeql_actions: true,
  };
}

/**
 * Serializes a `CiScope` object into `key=value` lines formatted for `$GITHUB_OUTPUT`.
 *
 * @param scope Computed CI scope flags.
 * @returns Newline-terminated `key=value` block.
 */
export function formatGithubOutput(scope: CiScope): string {
  const entries = Object.entries(scope) as Array<[keyof CiScope, boolean]>;
  return `${entries.map(([key, enabled]) => `${key}=${enabled}`).join("\n")}\n`;
}

/**
 * Runs `git diff --name-only --no-renames -z` between `baseRef` and `headRef` and
 * computes CI flags, failing safe to `ALL_TRUE_CI_SCOPE` if git returns a non-zero exit code.
 *
 * @param baseRef Base commit SHA or branch reference.
 * @param headRef Head commit reference (defaults to `"HEAD"`).
 * @param cwd Optional working directory for git execution.
 * @returns Computed `CiScope` for the revision range.
 */
export function detectScopeFromGit(
  baseRef: string,
  headRef: string = "HEAD",
  cwd?: string,
): CiScope {
  if (!baseRef.trim()) {
    return ALL_TRUE_CI_SCOPE;
  }

  // Pass --no-renames so files moved out of a workspace emit both old and new paths.
  const res = spawnSync(
    "git",
    [
      "diff",
      "--name-only",
      "--no-renames",
      "-z",
      baseRef.trim(),
      headRef.trim(),
    ],
    { encoding: "utf8", cwd },
  );
  if (res.status !== 0) {
    return ALL_TRUE_CI_SCOPE;
  }

  const changedPaths = parseNullDelimitedDiffPaths(res.stdout ?? "");
  return classifyChangedPaths(changedPaths);
}

function parseCliArgs(argv: readonly string[]): {
  all: boolean;
  base: string;
  head: string;
} {
  let all = false;
  let base = "";
  let head = "HEAD";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--all") {
      all = true;
    } else if (arg === "--base" && argv[i + 1]) {
      base = argv[i + 1] ?? "";
      i++;
    } else if (arg === "--head" && argv[i + 1]) {
      head = argv[i + 1] ?? "HEAD";
      i++;
    }
  }

  return { all, base, head };
}

if (import.meta.main) {
  const args = parseCliArgs(process.argv.slice(2));
  const scope = args.all
    ? ALL_TRUE_CI_SCOPE
    : detectScopeFromGit(args.base, args.head);
  process.stdout.write(formatGithubOutput(scope));
}
