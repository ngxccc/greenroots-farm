import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const REPO_ROOT = path.resolve(import.meta.dir, "..");
const UI_SCAN_ROOTS = [
  "apps/storefront/app",
  "apps/storefront/src",
  "apps/backoffice/src",
] as const;

const FORBIDDEN_NESTED_IN_LABEL = new Set([
  "input",
  "Input",
  "button",
  "Button",
  "select",
  "Select",
  "SelectTrigger",
  "textarea",
  "Textarea",
  "a",
  "Link",
]);

function collectSourceFiles(rootDir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(rootDir)) return results;

  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectSourceFiles(fullPath));
    } else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }

  return results.sort();
}

function hasHtmlForAttribute(node: ts.JsxOpeningElement): boolean {
  return node.attributes.properties.some(
    (attr) =>
      ts.isJsxAttribute(attr) &&
      ts.isIdentifier(attr.name) &&
      attr.name.text === "htmlFor",
  );
}

function containsNestedDisallowedTag(
  root: ts.Node,
  labelLine: number,
  sourceFile: ts.SourceFile,
): string | null {
  let nestedTag: string | null = null;

  function visit(node: ts.Node): void {
    if (nestedTag) return;
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile);
      if (FORBIDDEN_NESTED_IN_LABEL.has(tagName)) {
        nestedTag = `${tagName} at line ${labelLine}`;
        return;
      }
    }
    ts.forEachChild(node, visit);
  }

  ts.forEachChild(root, visit);
  return nestedTag;
}

/**
 * Inspects a TypeScript or TSX source string for raw `<label>` JSX elements, missing
 * `htmlFor` attributes on shared `<Label>` usages, and interactive controls nested inside `<Label>`.
 *
 * @param filePath Virtual or real workspace file path for TSX parser selection.
 * @param sourceText Source code text to scan via the TypeScript AST.
 * @returns Human-readable violation descriptors; empty when the file complies with UI-2.
 */
export function evaluateUiLabelHygiene(
  filePath: string,
  sourceText: string,
): string[] {
  const scriptKind = filePath.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const violations: string[] = [];

  function visit(node: ts.Node): void {
    if (ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile);
      const line =
        sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
          .line + 1;
      if (tagName === "label") {
        violations.push(`raw label element at line ${line}`);
      } else if (
        tagName === "Label" &&
        !node.attributes.properties.some(
          (attr) =>
            ts.isJsxAttribute(attr) &&
            ts.isIdentifier(attr.name) &&
            attr.name.text === "htmlFor",
        )
      ) {
        violations.push(`Label missing htmlFor at line ${line}`);
      }
    } else if (ts.isJsxElement(node)) {
      const opening = node.openingElement;
      const tagName = opening.tagName.getText(sourceFile);
      const line =
        sourceFile.getLineAndCharacterOfPosition(opening.getStart(sourceFile))
          .line + 1;

      if (tagName === "label") {
        violations.push(`raw label element at line ${line}`);
      } else if (tagName === "Label") {
        if (!hasHtmlForAttribute(opening)) {
          violations.push(`Label missing htmlFor at line ${line}`);
        }
        const nestedViolation = containsNestedDisallowedTag(
          node,
          line,
          sourceFile,
        );
        if (nestedViolation) {
          violations.push(`nested ${nestedViolation} inside Label`);
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

describe("Shared UI Primitives Hygiene", () => {
  describe("evaluateUiLabelHygiene", () => {
    it("rejects raw lowercase label tags, unbound Label elements, and nested search controls", () => {
      const rawTagResult = evaluateUiLabelHygiene(
        "sample.tsx",
        `<label htmlFor="q">Search</label>`,
      );
      const unboundWrapperResult = evaluateUiLabelHygiene(
        "sample.tsx",
        `<Label className="flex"><Input id="q" /><Button type="submit">Go</Button></Label>`,
      );

      expect(rawTagResult).toEqual(["raw label element at line 1"]);
      expect(unboundWrapperResult).toEqual([
        "Label missing htmlFor at line 1",
        "nested Input at line 1 inside Label",
      ]);
    });

    it("allows shared Label bound via htmlFor with Checkbox and external Input controls", () => {
      const violations = evaluateUiLabelHygiene(
        "valid.tsx",
        `<>
          <Label htmlFor="q" className="sr-only">Search</Label>
          <div><Input id="q" /><Button type="submit">Go</Button></div>
          <Label htmlFor="agree"><Checkbox id="agree" /><span>Accept</span></Label>
        </>`,
      );

      expect(violations).toEqual([]);
    });
  });

  describe("monorepo UI sources", () => {
    it("rejects raw label tags and nested wrapper Labels across storefront and backoffice", () => {
      const violations: string[] = [];

      for (const relativeRoot of UI_SCAN_ROOTS) {
        for (const file of collectSourceFiles(
          path.join(REPO_ROOT, relativeRoot),
        )) {
          const fileViolations = evaluateUiLabelHygiene(
            file,
            fs.readFileSync(file, "utf8"),
          );
          for (const violation of fileViolations) {
            violations.push(`${path.relative(REPO_ROOT, file)}: ${violation}`);
          }
        }
      }

      expect(violations).toEqual([]);
    });
  });
});
