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
      sharedTooling = await loadTailwindTooling();
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
});
