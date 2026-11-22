import { beforeAll, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  areCandidatesCssEquivalent,
  areCssValuesEquivalent,
  checkTailwindCanonical,
  collectRootCssVariables,
  evaluateCssLength,
  loadTailwindTooling,
  offsetToLineColumn,
  parseWorkerViolations,
  runCheckTailwindCli,
  type CanonicalViolation,
  type TailwindTooling,
  UI_WORKSPACES,
} from "./check-tailwind-canonical";

const REPO_ROOT = path.resolve(import.meta.dir, "..");

describe("check-tailwind-canonical", () => {
  describe("collectRootCssVariables", () => {
    it("extracts root custom properties across imported workspace stylesheets", () => {
      // Invariant: Storefront and Backoffice inherit :root --radius from @greenroots/ui/globals.css.
      const storefrontVars = collectRootCssVariables(
        path.join(REPO_ROOT, "apps/storefront/src/styles/globals.css"),
      );
      const backofficeVars = collectRootCssVariables(
        path.join(REPO_ROOT, "apps/backoffice/src/styles/globals.css"),
      );

      expect(storefrontVars.get("--radius")).toBe("0.75rem");
      expect(backofficeVars.get("--radius")).toBe("0.75rem");
    });

    it("resolves later stylesheet declarations over earlier imported root values", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tw-canon-css-"));
      try {
        const baseCss = path.join(tmpDir, "base.css");
        const appCss = path.join(tmpDir, "app.css");
        fs.writeFileSync(
          baseCss,
          ":root {\n  --radius: 0.25rem;\n  --gap-unit: 4px;\n}\n",
        );
        fs.writeFileSync(
          appCss,
          '@import "./base.css";\n:root {\n  --radius: 0.75rem;\n}\n',
        );

        const vars = collectRootCssVariables(appCss);
        expect(vars.get("--radius")).toBe("0.75rem");
        expect(vars.get("--gap-unit")).toBe("4px");
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("extracts root declarations nested inside unconditional layer blocks", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tw-canon-layer-"));
      try {
        const layeredCss = path.join(tmpDir, "layered.css");
        fs.writeFileSync(
          layeredCss,
          "@layer base {\n  :root {\n    --radius: 0.75rem;\n  }\n}\n@media (prefers-color-scheme: dark) {\n  :root {\n    --radius: 1rem;\n  }\n}\n",
        );

        const vars = collectRootCssVariables(layeredCss);
        expect(vars.get("--radius")).toBe("0.75rem");
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe("evaluateCssLength", () => {
    const vars = new Map<string, string>([
      ["--spacing", "0.25rem"],
      ["--radius", "0.75rem"],
      ["--radius-lg", "var(--radius)"],
      ["--cycle-a", "var(--cycle-b)"],
      ["--cycle-b", "var(--cycle-a)"],
    ]);

    it("converts spacing calc expressions and rem units into pixels", () => {
      expect(evaluateCssLength("calc(var(--spacing) * 0.75)", vars)).toBe(3);
      expect(evaluateCssLength("calc(var(--spacing) * 27.5)", vars)).toBe(110);
      expect(evaluateCssLength("2.5rem", vars)).toBe(40);
    });

    it("computes negative arithmetic expressions and zero pixel literals", () => {
      expect(evaluateCssLength("calc(7px * -1)", vars)).toBe(-7);
      expect(evaluateCssLength("calc(var(--spacing) * -1.75)", vars)).toBe(-7);
      expect(evaluateCssLength("0px", vars)).toBe(0);
      expect(evaluateCssLength("0", vars)).toBe(0);
    });

    it("substitutes nested custom properties with root overrides", () => {
      expect(evaluateCssLength("var(--radius-lg)", vars)).toBe(12);
    });

    it("returns null when expression contains unresolved custom properties", () => {
      expect(evaluateCssLength("var(--unknown-token)", vars)).toBeNull();
      expect(areCssValuesEquivalent("4px", "var(--unknown-token)", vars)).toBe(
        false,
      );
    });

    it("returns null when custom properties form a circular reference", () => {
      expect(evaluateCssLength("var(--cycle-a)", vars)).toBeNull();
    });

    it("returns null when calc mixes length units with unitless numbers in addition", () => {
      expect(evaluateCssLength("calc(10px + 5)", vars)).toBeNull();
    });
  });

  describe("offsetToLineColumn", () => {
    it("computes 1-based line and column across multi-byte UTF-8 and emoji text", () => {
      const sample =
        'const label = "Tài khoản 🥬";\nconst cls = "max-w-[110px]";\n';
      const offset = sample.indexOf("max-w-[110px]");

      expect(offsetToLineColumn(sample, offset)).toEqual({
        line: 2,
        column: 14,
      });
    });
  });

  describe("checkTailwindCanonical", () => {
    let sharedTooling: TailwindTooling;

    beforeAll(async () => {
      const baseTooling = await loadTailwindTooling();
      const designSystemCache = new Map<
        string,
        ReturnType<TailwindTooling["loadDesignSystem"]>
      >();

      sharedTooling = {
        createScanner: baseTooling.createScanner,
        loadDesignSystem: (css, opts) => {
          // Reuse loaded DesignSystem instances across tests so Tailwind builds its canonicalize lookup map once.
          const key = `${opts.base}\0${css}`;
          let cached = designSystemCache.get(key);
          if (!cached) {
            cached = baseTooling.loadDesignSystem(css, opts);
            designSystemCache.set(key, cached);
          }
          return cached;
        },
      };
    });

    it("accepts CSS hex-escaped selectors for digit-prefixed utilities and suppresses root radius false positives", async () => {
      // Invariant: Custom :root --radius overrides must never be forced to mismatching rounded-* classes.
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tw-canon-fp-"));
      try {
        const uiTarget = UI_WORKSPACES.find((w) => w.name === "packages/ui");
        expect(uiTarget).toBeDefined();

        const absCss = path.join(REPO_ROOT, uiTarget!.cssEntrypoint);
        const ds = await sharedTooling.loadDesignSystem(
          fs.readFileSync(absCss, "utf8"),
          { base: path.dirname(absCss) },
        );
        const rootVars = new Map<string, string>([
          ["--spacing", "0.25rem"],
          ["--radius", "0.75rem"],
        ]);

        expect(
          areCandidatesCssEquivalent(ds, "2xl:p-[4px]", "2xl:p-1", rootVars),
        ).toBe(true);
        expect(
          areCandidatesCssEquivalent(
            ds,
            "rounded-[4px]",
            "rounded-lg",
            rootVars,
          ),
        ).toBe(false);

        const componentFile = path.join(tmpDir, "card.tsx");
        fs.writeFileSync(
          componentFile,
          'export const cls = "rounded-[4px] rounded-[8px] rounded-[12px] rounded-[0px] 2xl:p-[4px]";\n',
        );

        const violations = await checkTailwindCanonical(
          [
            {
              name: "tmp-fp",
              cssEntrypoint: absCss,
              scanRoots: [tmpDir],
            },
          ],
          sharedTooling,
        );

        expect(violations).toEqual([
          {
            workspace: "tmp-fp",
            filePath: componentFile,
            line: 1,
            column: 64,
            original: "rounded-[0px]",
            canonical: "rounded-none",
          },
          {
            workspace: "tmp-fp",
            filePath: componentFile,
            line: 1,
            column: 78,
            original: "2xl:p-[4px]",
            canonical: "2xl:p-1",
          },
        ]);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("detects canonical spacing and selector simplifications while ignoring test files", async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tw-canon-det-"));
      try {
        const uiTarget = UI_WORKSPACES.find((w) => w.name === "packages/ui");
        expect(uiTarget).toBeDefined();

        const sourceFile = path.join(tmpDir, "widget.tsx");
        fs.writeFileSync(
          sourceFile,
          'const title = "Nông sản";\nexport const a = "p-[3px] sm:max-w-[140px] group-has-[:focus-visible]/field-label:ring-0";\n',
        );
        const testFile = path.join(tmpDir, "widget.spec.tsx");
        fs.writeFileSync(testFile, 'export const fixture = "-left-[7px]";\n');
        const declFile = path.join(tmpDir, "types.d.ts");
        fs.writeFileSync(declFile, 'export type Cls = "p-[3px]";\n');

        const violations = await checkTailwindCanonical(
          [
            {
              name: "tmp-det",
              cssEntrypoint: path.join(REPO_ROOT, uiTarget!.cssEntrypoint),
              scanRoots: [tmpDir],
            },
          ],
          sharedTooling,
        );

        expect(violations).toHaveLength(3);
        expect(violations.map((v) => `${v.original}->${v.canonical}`)).toEqual([
          "p-[3px]->p-0.75",
          "sm:max-w-[140px]->sm:max-w-35",
          "group-has-[:focus-visible]/field-label:ring-0->group-has-focus-visible/field-label:ring-0",
        ]);
        expect(violations.every((v) => v.filePath === sourceFile)).toBe(true);
        expect(violations[0]?.line).toBe(2);
        expect(violations[0]?.column).toBe(19);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe("parseWorkerViolations", () => {
    it("parses valid worker JSON violation arrays", () => {
      const payload: CanonicalViolation[] = [
        {
          workspace: "apps/storefront",
          filePath: "/repo/apps/storefront/src/a.tsx",
          line: 4,
          column: 12,
          original: "p-[4px]",
          canonical: "p-1",
        },
      ];

      expect(
        parseWorkerViolations(JSON.stringify(payload), "apps/storefront"),
      ).toEqual(payload);
    });

    it("rejects malformed JSON and non-violation worker payloads", () => {
      expect(() => parseWorkerViolations("{broken", "packages/ui")).toThrow(
        'Invalid JSON from Tailwind worker for "packages/ui"',
      );
      expect(() =>
        parseWorkerViolations(
          JSON.stringify([{ workspace: "packages/ui", line: "bad" }]),
          "packages/ui",
        ),
      ).toThrow(
        'Malformed violation payload from Tailwind worker for "packages/ui".',
      );
    });
  });

  describe("runCheckTailwindCli", () => {
    it("merges and sorts violations deterministically across parallel workspace workers", async () => {
      const stdout: string[] = [];
      const stderr: string[] = [];
      const invoked: string[] = [];

      const exitCode = await runCheckTailwindCli([], {
        runWorker: async (workspaceName) => {
          invoked.push(workspaceName);
          if (workspaceName === "apps/backoffice") {
            return [
              {
                workspace: "apps/backoffice",
                filePath: path.join(REPO_ROOT, "apps/backoffice/src/b.tsx"),
                line: 2,
                column: 5,
                original: "m-[4px]",
                canonical: "m-1",
              },
            ];
          }
          if (workspaceName === "packages/ui") {
            return [
              {
                workspace: "packages/ui",
                filePath: path.join(REPO_ROOT, "packages/ui/src/a.tsx"),
                line: 10,
                column: 3,
                original: "p-[4px]",
                canonical: "p-1",
              },
              {
                workspace: "packages/ui",
                filePath: path.join(REPO_ROOT, "packages/ui/src/a.tsx"),
                line: 1,
                column: 8,
                original: "gap-[8px]",
                canonical: "gap-2",
              },
            ];
          }
          return [];
        },
        writeStdout: (line) => stdout.push(line),
        writeStderr: (line) => stderr.push(line),
      });

      expect(exitCode).toBe(1);
      expect(invoked).toEqual(UI_WORKSPACES.map((w) => w.name));
      expect(stdout).toEqual([]);
      expect(stderr).toEqual([
        "Found 3 non-canonical Tailwind CSS class(es):",
        "  apps/backoffice/src/b.tsx:2:5  m-[4px] -> m-1",
        "  packages/ui/src/a.tsx:1:8  gap-[8px] -> gap-2",
        "  packages/ui/src/a.tsx:10:3  p-[4px] -> p-1",
      ]);
    });

    it("aborts with failure status when a workspace worker throws", async () => {
      const stdout: string[] = [];
      const stderr: string[] = [];

      const exitCode = await runCheckTailwindCli([], {
        runWorker: async (workspaceName) => {
          if (workspaceName === "apps/storefront") {
            throw new Error(
              'Tailwind worker for "apps/storefront" exited with code 1: boom',
            );
          }
          return [];
        },
        writeStdout: (line) => stdout.push(line),
        writeStderr: (line) => stderr.push(line),
      });

      expect(exitCode).toBe(1);
      expect(stdout).toEqual([]);
      expect(stderr).toEqual([
        'Tailwind worker for "apps/storefront" exited with code 1: boom',
      ]);
    });

    it("runs a single workspace in-process and serializes JSON output when requested", async () => {
      const stdout: string[] = [];
      const stderr: string[] = [];
      const checked: string[] = [];

      const exitCode = await runCheckTailwindCli(
        ["--workspace", "packages/ui", "--json"],
        {
          checkWorkspaces: async (targets) => {
            checked.push(...targets.map((t) => t.name));
            return [
              {
                workspace: "packages/ui",
                filePath: "/repo/packages/ui/src/button.tsx",
                line: 3,
                column: 9,
                original: "p-[4px]",
                canonical: "p-1",
              },
            ];
          },
          runWorker: async () => {
            throw new Error("worker should not be spawned in --workspace mode");
          },
          writeStdout: (line) => stdout.push(line),
          writeStderr: (line) => stderr.push(line),
        },
      );

      expect(exitCode).toBe(0);
      expect(checked).toEqual(["packages/ui"]);
      expect(stderr).toEqual([]);
      expect(JSON.parse(stdout[0] ?? "null")).toEqual([
        {
          workspace: "packages/ui",
          filePath: "/repo/packages/ui/src/button.tsx",
          line: 3,
          column: 9,
          original: "p-[4px]",
          canonical: "p-1",
        },
      ]);
    });

    it("rejects unknown workspace targets and unknown CLI flags", async () => {
      const stderrUnknownWs: string[] = [];
      const codeWs = await runCheckTailwindCli(["--workspace", "apps/nope"], {
        writeStderr: (line) => stderrUnknownWs.push(line),
      });
      expect(codeWs).toBe(1);
      expect(stderrUnknownWs).toEqual(['Unknown workspace "apps/nope".']);

      const stderrUnknownFlag: string[] = [];
      const codeFlag = await runCheckTailwindCli(["--bogus"], {
        writeStderr: (line) => stderrUnknownFlag.push(line),
      });
      expect(codeFlag).toBe(1);
      expect(stderrUnknownFlag).toEqual(["Unknown CLI flag: --bogus"]);
    });
  });
});
