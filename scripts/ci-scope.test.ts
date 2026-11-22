import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ALL_TRUE_CI_SCOPE,
  classifyChangedPaths,
  detectScopeFromGit,
  formatGithubOutput,
  parseNullDelimitedDiffPaths,
} from "./ci-scope";

describe("ci-scope", () => {
  describe("parseNullDelimitedDiffPaths", () => {
    it("extracts trimmed non-empty file paths across NUL delimiters", () => {
      const raw =
        "apps/storefront/src/app.tsx\0.github/PULL_REQUEST_TEMPLATE.md\0\0";
      expect(parseNullDelimitedDiffPaths(raw)).toEqual([
        "apps/storefront/src/app.tsx",
        ".github/PULL_REQUEST_TEMPLATE.md",
      ]);
    });

    it("returns an empty list when raw diff output contains only delimiters or whitespace", () => {
      expect(parseNullDelimitedDiffPaths("\0\n  \0")).toEqual([]);
    });
  });

  describe("formatGithubOutput", () => {
    it("serializes every scope flag as newline-delimited key=value pairs", () => {
      const output = formatGithubOutput(ALL_TRUE_CI_SCOPE);
      const lines = output.trim().split("\n");
      expect(lines).toContain("run_all=true");
      expect(lines).toContain("trivy=true");
      expect(lines).toContain("codeql_js=true");
      expect(lines).toContain("codeql_actions=true");
      expect(lines).toContain("database=true");
    });
  });

  describe("classifyChangedPaths", () => {
    it("falls back to full scope when changed path list is empty", () => {
      // Invariant: Missing or empty diff input must fail safe to running the full pipeline.
      expect(classifyChangedPaths([])).toEqual(ALL_TRUE_CI_SCOPE);
    });

    it("enables only lightweight formatting and Trivy on Markdown or PR template edits", () => {
      const scope = classifyChangedPaths([
        ".github/PULL_REQUEST_TEMPLATE.md",
        "docs/design/overview.md",
      ]);

      expect(scope.run_all).toBe(false);
      expect(scope.shared_package).toBe(true);
      expect(scope.format_check).toBe(true);
      expect(scope.syncpack).toBe(false);
      expect(scope.shared_checks).toBe(false);
      expect(scope.ui_checks).toBe(false);
      expect(scope.scripts_checks).toBe(false);
      expect(scope.tailwind).toBe(false);
      expect(scope.version_consistency).toBe(false);
      expect(scope.api).toBe(false);
      expect(scope.database).toBe(false);
      expect(scope.storefront).toBe(false);
      expect(scope.backoffice).toBe(false);
      expect(scope.trivy).toBe(true);
      expect(scope.bun_audit).toBe(false);
      expect(scope.codeql_js).toBe(true);
      expect(scope.codeql_actions).toBe(true);
    });

    it("enables scripts test-naming checks when any workspace test file changes", () => {
      const scope = classifyChangedPaths([
        "apps/storefront/src/stores/cart.store.spec.ts",
      ]);

      expect(scope.run_all).toBe(false);
      expect(scope.storefront).toBe(true);
      expect(scope.scripts_checks).toBe(true);
      expect(scope.tailwind).toBe(true);
      expect(scope.api).toBe(false);
      expect(scope.codeql_js).toBe(true);
      expect(scope.codeql_actions).toBe(true);
    });

    it("triggers UI dependents and tailwind checks when packages/ui changes", () => {
      const scope = classifyChangedPaths([
        "packages/ui/src/components/ui/button.tsx",
      ]);

      expect(scope.run_all).toBe(false);
      expect(scope.shared_package).toBe(true);
      expect(scope.ui_checks).toBe(true);
      expect(scope.tailwind).toBe(true);
      expect(scope.storefront).toBe(true);
      expect(scope.backoffice).toBe(true);
      expect(scope.api).toBe(false);
      expect(scope.database).toBe(false);
      expect(scope.codeql_js).toBe(true);
    });

    it("triggers API, database, and JS CodeQL when apps/api changes without UI impact", () => {
      const scope = classifyChangedPaths([
        "apps/api/src/modules/orders/orders.service.ts",
      ]);

      expect(scope.run_all).toBe(false);
      expect(scope.api).toBe(true);
      expect(scope.database).toBe(true);
      expect(scope.storefront).toBe(false);
      expect(scope.backoffice).toBe(false);
      expect(scope.tailwind).toBe(false);
      expect(scope.codeql_js).toBe(true);
      expect(scope.bun_audit).toBe(false);
    });

    it("skips format check when only .oxfmtrc.json ignored changelog files change", () => {
      const scope = classifyChangedPaths(["CHANGELOG.md"]);

      expect(scope.format_check).toBe(false);
      expect(scope.shared_package).toBe(false);
      expect(scope.trivy).toBe(true);
      expect(scope.codeql_js).toBe(true);
      expect(scope.codeql_actions).toBe(true);
    });

    it("keeps CodeQL checks enabled while skipping app builds on non-security workflow changes", () => {
      const scope = classifyChangedPaths([".github/workflows/labels.yml"]);

      expect(scope.run_all).toBe(false);
      expect(scope.shared_package).toBe(true);
      expect(scope.format_check).toBe(true);
      expect(scope.scripts_checks).toBe(true);
      expect(scope.codeql_actions).toBe(true);
      expect(scope.codeql_js).toBe(true);
      expect(scope.api).toBe(false);
      expect(scope.storefront).toBe(false);
    });

    it("triggers both CodeQL JS, actions analysis, and Bun Audit when security.yml changes", () => {
      const scope = classifyChangedPaths([".github/workflows/security.yml"]);

      expect(scope.run_all).toBe(false);
      expect(scope.codeql_actions).toBe(true);
      expect(scope.codeql_js).toBe(true);
      expect(scope.bun_audit).toBe(true);
    });

    it("promotes packages/shared, root config, lockfile, and ci.yml changes to full suite", () => {
      for (const criticalPath of [
        "packages/shared/src/domain.enums.ts",
        "package.json",
        "bun.lock",
        ".github/workflows/ci.yml",
        ".github/actions/setup-environment/action.yml",
        "scripts/ci-scope.ts",
        ".oxlintrc.json",
      ]) {
        expect(classifyChangedPaths([criticalPath])).toEqual(ALL_TRUE_CI_SCOPE);
      }
    });

    it("triggers Bun Audit and version check on workspace package.json changes without promoting to full CI", () => {
      const scope = classifyChangedPaths(["apps/storefront/package.json"]);

      expect(scope.run_all).toBe(false);
      expect(scope.version_consistency).toBe(true);
      expect(scope.syncpack).toBe(true);
      expect(scope.bun_audit).toBe(true);
      expect(scope.storefront).toBe(true);
      expect(scope.api).toBe(false);
    });
  });

  describe("detectScopeFromGit", () => {
    it("returns full scope when base revision is blank or unknown to git", () => {
      // Invariant: Missing or failing git diffs must fail safe to running all checks.
      expect(detectScopeFromGit("")).toEqual(ALL_TRUE_CI_SCOPE);
      expect(
        detectScopeFromGit("0000000000000000000000000000000000000000"),
      ).toEqual(ALL_TRUE_CI_SCOPE);
    });

    it("includes source workspace paths when git renames a file out of packages/ui", () => {
      const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "ci-scope-git-"));
      try {
        const runGit = (args: string[]) => {
          const res = spawnSync("git", args, {
            cwd: tmpRepo,
            encoding: "utf8",
          });
          if (res.status !== 0) {
            throw new Error(res.stderr || `git ${args.join(" ")} failed`);
          }
        };

        runGit(["init", "-q"]);
        runGit(["config", "user.email", "test@example.com"]);
        runGit(["config", "user.name", "Test"]);

        const srcDir = path.join(tmpRepo, "packages/ui/src");
        fs.mkdirSync(srcDir, { recursive: true });
        fs.writeFileSync(
          path.join(srcDir, "widget.tsx"),
          "export const x = 1;\n",
        );
        runGit(["add", "."]);
        runGit(["commit", "-q", "-m", "init"]);

        const docsDir = path.join(tmpRepo, "docs");
        fs.mkdirSync(docsDir, { recursive: true });
        runGit(["mv", "packages/ui/src/widget.tsx", "docs/widget.md"]);
        runGit(["commit", "-q", "-m", "move"]);

        const scope = detectScopeFromGit("HEAD~1", "HEAD", tmpRepo);
        expect(scope.ui_checks).toBe(true);
        expect(scope.storefront).toBe(true);
        expect(scope.backoffice).toBe(true);
        expect(scope.tailwind).toBe(true);
        expect(scope.format_check).toBe(true);
        expect(scope.api).toBe(false);
      } finally {
        fs.rmSync(tmpRepo, { recursive: true, force: true });
      }
    });
  });
});
