import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const SRC_ROOT = path.resolve(import.meta.dir, "..");

function collectFiles(dir: string, suffixes: readonly string[]): string[] {
  const results: string[] = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath, suffixes));
    } else if (
      entry.isFile() &&
      suffixes.some((suffix) => entry.name.endsWith(suffix))
    ) {
      results.push(fullPath);
    }
  }

  return results.sort();
}

function hasInterfaceDeclaration(node: ts.Node): boolean {
  if (ts.isInterfaceDeclaration(node)) {
    return true;
  }

  let found = false;
  ts.forEachChild(node, (child) => {
    if (!found && hasInterfaceDeclaration(child)) {
      found = true;
    }
  });
  return found;
}

describe("API Interface Purity", () => {
  describe("src/**/*.interface.ts and src/**/*.type.ts", () => {
    it("emits zero runtime JavaScript across every interface and type file", () => {
      // Invariant: ADR-0035 — *.interface.ts and *.type.ts must remain compile-time-only with zero runtime JS.
      const typeOnlyFiles = collectFiles(SRC_ROOT, [
        ".interface.ts",
        ".type.ts",
      ]);
      expect(typeOnlyFiles.length).toBeGreaterThan(0);

      const violations: string[] = [];

      for (const filePath of typeOnlyFiles) {
        const source = fs.readFileSync(filePath, "utf8");
        const { outputText } = ts.transpileModule(source, {
          compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ESNext,
            verbatimModuleSyntax: true,
            removeComments: true,
          },
          fileName: filePath,
        });

        const runtimeCode = outputText
          .replace(/^export\s*\{\s*\};?\s*$/gm, "")
          .trim();

        if (runtimeCode.length > 0) {
          violations.push(
            `${path.relative(SRC_ROOT, filePath)}: ${runtimeCode}`,
          );
        }
      }

      expect(violations).toEqual([]);
    });
  });

  describe("src/**/*.constant.ts", () => {
    it("omits standalone interface declarations from constant files", () => {
      // Invariant: ADR-0035 — *.constant.ts owns runtime constants and derived unions, not standalone interfaces.
      const constantFiles = collectFiles(SRC_ROOT, [".constant.ts"]);
      expect(constantFiles.length).toBeGreaterThan(0);

      const violations: string[] = [];

      for (const filePath of constantFiles) {
        const source = fs.readFileSync(filePath, "utf8");
        const sourceFile = ts.createSourceFile(
          filePath,
          source,
          ts.ScriptTarget.ESNext,
          true,
        );

        if (hasInterfaceDeclaration(sourceFile)) {
          violations.push(path.relative(SRC_ROOT, filePath));
        }
      }

      expect(violations).toEqual([]);
    });
  });
});
