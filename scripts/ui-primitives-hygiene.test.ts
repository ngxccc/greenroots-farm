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

const BACKOFFICE_SCAN_ROOT = "apps/backoffice/src";
const STOREFRONT_SCAN_ROOTS = [
  "apps/storefront/app",
  "apps/storefront/src",
] as const;
const SHARED_UI_SCAN_ROOT = "packages/ui/src";

const LEGACY_DOM_MOUNT_TEST_ALLOWLIST = new Set([
  "apps/storefront/src/components/common/header-auth.spec.ts",
  "apps/storefront/src/features/account/components/account-addresses.spec.ts",
  "apps/storefront/src/features/account/components/account-profile.spec.ts",
  "apps/storefront/src/features/orders/components/header-cart-popover.spec.ts",
  "apps/storefront/src/features/product-detail/components/product-detail-hero.spec.ts",
]);

function evaluateDomMountTestHygiene(
  relativePath: string,
  sourceText: string,
): string[] {
  if (
    !relativePath.endsWith(".spec.ts") &&
    !relativePath.endsWith(".spec.tsx") &&
    !relativePath.endsWith(".test.ts") &&
    !relativePath.endsWith(".test.tsx")
  ) {
    return [];
  }
  if (LEGACY_DOM_MOUNT_TEST_ALLOWLIST.has(relativePath)) {
    return [];
  }

  const sourceFile = ts.createSourceFile(
    relativePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );
  const violations: string[] = [];

  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      const specifier = statement.moduleSpecifier.text;
      if (specifier === "happy-dom" || specifier === "react-dom/client") {
        const line =
          sourceFile.getLineAndCharacterOfPosition(statement.getStart()).line +
          1;
        violations.push(
          `Forbidden DOM mount import "${specifier}" at line ${line} (UI-5: unit-test pure logic/stores/actions only; cover UI mounts in Playwright E2E)`,
        );
      }
    }
  }

  return violations;
}

const FORBIDDEN_BACKOFFICE_RAW_ELEMENTS = new Set([
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "caption",
  "textarea",
  "button",
  "input",
  "select",
]);

const FORBIDDEN_STOREFRONT_RAW_ELEMENTS = new Set(["button"]);

const STOREFRONT_RSC_UNCACHED_LOADERS = new Set([
  "getServerSession",
  "fetchApiHealth",
  "getAccountProfileSession",
  "getAccountProfileWithSessions",
  "getHeaderAddresses",
  "getAccountAddressesSession",
]);

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

function hasHtmlForAttribute(attributes: ts.JsxAttributes): boolean {
  return attributes.properties.some(
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

function parseSourceFile(filePath: string, sourceText: string): ts.SourceFile {
  const scriptKind = filePath.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS;
  return ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
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
  const sourceFile = parseSourceFile(filePath, sourceText);
  return collectLabelViolations(sourceFile);
}

function collectLabelViolations(sourceFile: ts.SourceFile): string[] {
  const violations: string[] = [];

  function visit(node: ts.Node): void {
    if (ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile);
      const line =
        sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
          .line + 1;
      if (tagName === "label") {
        violations.push(`raw label element at line ${line}`);
      } else if (tagName === "Label" && !hasHtmlForAttribute(node.attributes)) {
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
        if (!hasHtmlForAttribute(opening.attributes)) {
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

/**
 * Inspects a Backoffice TypeScript or TSX source string for raw HTML table, button,
 * and textarea elements that bypass `@greenroots/ui` primitives.
 *
 * @param filePath Virtual or real workspace file path for TSX parser selection.
 * @param sourceText Source code text to scan via the TypeScript AST.
 * @returns Human-readable violation descriptors; empty when only shared primitives are used.
 */
export function evaluateBackofficePrimitiveHygiene(
  filePath: string,
  sourceText: string,
): string[] {
  return collectRawElementViolations(
    parseSourceFile(filePath, sourceText),
    FORBIDDEN_BACKOFFICE_RAW_ELEMENTS,
  );
}

/**
 * Inspects a Storefront TypeScript or TSX source string for raw HTML `<button>` elements
 * that bypass `@greenroots/ui` `Button` / `DropdownMenuTrigger` primitives.
 *
 * @param filePath Virtual or real workspace file path for TSX parser selection.
 * @param sourceText Source code text to scan via the TypeScript AST.
 * @returns Human-readable violation descriptors; empty when no raw `<button>` tags exist.
 */
export function evaluateStorefrontButtonHygiene(
  filePath: string,
  sourceText: string,
): string[] {
  return collectRawElementViolations(
    parseSourceFile(filePath, sourceText),
    FORBIDDEN_STOREFRONT_RAW_ELEMENTS,
  );
}

/**
 * Inspects a Storefront Server Component or app route for uncached server session/API
 * loader calls without an explicit `await connection()` outside `try/catch` (`UI-3`).
 *
 * @param filePath Virtual or real workspace file path for TSX parser selection.
 * @param sourceText Source code text to scan via the TypeScript AST.
 * @returns Violation descriptors when an RSC references `getServerSession`/`fetchApiHealth` without top-level `connection()`.
 */
export function evaluateStorefrontConnectionHygiene(
  filePath: string,
  sourceText: string,
): string[] {
  if (filePath.endsWith(".spec.ts") || filePath.endsWith(".spec.tsx")) {
    return [];
  }

  const sourceFile = parseSourceFile(filePath, sourceText);
  const firstStmt = sourceFile.statements[0];
  if (
    firstStmt &&
    ts.isExpressionStatement(firstStmt) &&
    ts.isStringLiteral(firstStmt.expression) &&
    (firstStmt.expression.text === "use client" ||
      firstStmt.expression.text === "use server")
  ) {
    return [];
  }

  let callsUncachedLoader = false;
  let hasSafeConnectionCall = false;
  let connectionInsideTry = false;

  function visit(node: ts.Node, inTryBlock: boolean): void {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const callee = node.expression.text;
      if (STOREFRONT_RSC_UNCACHED_LOADERS.has(callee)) {
        callsUncachedLoader = true;
      } else if (callee === "connection") {
        if (inTryBlock) {
          connectionInsideTry = true;
        } else {
          hasSafeConnectionCall = true;
        }
      }
    }

    if (ts.isTryStatement(node)) {
      visit(node.tryBlock, true);
      if (node.catchClause) visit(node.catchClause, inTryBlock);
      if (node.finallyBlock) visit(node.finallyBlock, inTryBlock);
      return;
    }

    ts.forEachChild(node, (child) => visit(child, inTryBlock));
  }

  visit(sourceFile, false);

  if (callsUncachedLoader && connectionInsideTry && !hasSafeConnectionCall) {
    return [
      "connection() must run outside try/catch before uncached server API reads",
    ];
  }
  if (callsUncachedLoader && !hasSafeConnectionCall) {
    return [
      "missing await connection() before uncached server API reads (getServerSession/fetchApiHealth)",
    ];
  }
  return [];
}

function collectRawElementViolations(
  sourceFile: ts.SourceFile,
  forbiddenElements: ReadonlySet<string>,
): string[] {
  const violations: string[] = [];

  function visit(node: ts.Node): void {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tagName = node.tagName.getText(sourceFile);
      if (forbiddenElements.has(tagName)) {
        const line =
          sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
            .line + 1;
        violations.push(`raw ${tagName} element at line ${line}`);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

/**
 * Inspects a shared UI package source string for `@/*` cross-app path alias imports
 * that resolve into the consuming application's `./src/*` directory instead of `packages/ui/src/*`.
 *
 * @param filePath Virtual or real workspace file path for TSX parser selection.
 * @param sourceText Source code text to scan via the TypeScript AST.
 * @returns Human-readable violation descriptors; empty when no `@/*` alias imports exist.
 */
export function evaluateUiAliasHygiene(
  filePath: string,
  sourceText: string,
): string[] {
  const sourceFile = parseSourceFile(filePath, sourceText);
  const violations: string[] = [];

  function recordIfCrossAppAlias(specifier: ts.Expression): void {
    if (ts.isStringLiteralLike(specifier) && specifier.text.startsWith("@/")) {
      const line =
        sourceFile.getLineAndCharacterOfPosition(specifier.getStart(sourceFile))
          .line + 1;
      violations.push(
        `forbidden @/* alias import "${specifier.text}" at line ${line}`,
      );
    }
  }

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) {
        recordIfCrossAppAlias(node.moduleSpecifier);
      }
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require"))
    ) {
      const firstArg = node.arguments[0];
      if (firstArg) {
        recordIfCrossAppAlias(firstArg);
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

  describe("evaluateBackofficePrimitiveHygiene", () => {
    it("rejects raw table, textarea, and button tags while ignoring JSX components", () => {
      const violations = evaluateBackofficePrimitiveHygiene(
        "sample.tsx",
        `<div>
          <Table><TableBody><TableRow><TableCell>OK</TableCell></TableRow></TableBody></Table>
          <table><tbody><tr><td>Bad</td></tr></tbody></table>
          <textarea rows={3} />
          <button type="button">Raw</button>
        </div>`,
      );

      expect(violations).toEqual([
        "raw table element at line 3",
        "raw tbody element at line 3",
        "raw tr element at line 3",
        "raw td element at line 3",
        "raw textarea element at line 4",
        "raw button element at line 5",
      ]);
    });
  });

  describe("evaluateUiAliasHygiene", () => {
    it("rejects static, re-export, and dynamic @/* imports while allowing package and relative imports", () => {
      const violations = evaluateUiAliasHygiene(
        "table.tsx",
        `import { cn } from "cn";
         import { Button } from "@/components/ui/button";
         export { utils } from "@/lib/utils";
         const lazy = () => import("@/hooks/use-mobile");
         import { Card } from "./card";`,
      );

      expect(violations).toEqual([
        'forbidden @/* alias import "@/components/ui/button" at line 2',
        'forbidden @/* alias import "@/lib/utils" at line 3',
        'forbidden @/* alias import "@/hooks/use-mobile" at line 4',
      ]);
    });
  });

  describe("evaluateStorefrontButtonHygiene", () => {
    it("rejects raw button elements while allowing shared Button and DropdownMenuTrigger", () => {
      const violations = evaluateStorefrontButtonHygiene(
        "header.tsx",
        `<div>
          <Button type="button">OK</Button>
          <DropdownMenuTrigger render={<Button type="button" />} />
          <button type="button">Raw</button>
        </div>`,
      );

      expect(violations).toEqual(["raw button element at line 4"]);
    });
  });

  describe("evaluateStorefrontConnectionHygiene", () => {
    it("rejects uncached server loader calls missing connection() or wrapping connection() inside try", () => {
      const missingConn = evaluateStorefrontConnectionHygiene(
        "slot.tsx",
        `export async function Slot() { return await getServerSession(); }`,
      );
      const insideTry = evaluateStorefrontConnectionHygiene(
        "slot.tsx",
        `export async function Slot() { try { await connection(); return await getServerSession(); } catch { return null; } }`,
      );
      const valid = evaluateStorefrontConnectionHygiene(
        "slot.tsx",
        `export async function Slot() { await connection(); return await getServerSession(); }`,
      );

      expect(missingConn).toEqual([
        "missing await connection() before uncached server API reads (getServerSession/fetchApiHealth)",
      ]);
      expect(insideTry).toEqual([
        "connection() must run outside try/catch before uncached server API reads",
      ]);
      expect(valid).toEqual([]);
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

    it("rejects raw HTML table, form, and button tags across backoffice sources", () => {
      const violations: string[] = [];

      for (const file of collectSourceFiles(
        path.join(REPO_ROOT, BACKOFFICE_SCAN_ROOT),
      )) {
        const fileViolations = evaluateBackofficePrimitiveHygiene(
          file,
          fs.readFileSync(file, "utf8"),
        );
        for (const violation of fileViolations) {
          violations.push(`${path.relative(REPO_ROOT, file)}: ${violation}`);
        }
      }

      expect(violations).toEqual([]);
    });

    it("rejects raw HTML button tags across storefront sources", () => {
      const violations: string[] = [];

      for (const relativeRoot of STOREFRONT_SCAN_ROOTS) {
        for (const file of collectSourceFiles(
          path.join(REPO_ROOT, relativeRoot),
        )) {
          const fileViolations = evaluateStorefrontButtonHygiene(
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

    it("enforces await connection() outside try/catch for uncached storefront server loaders", () => {
      const violations: string[] = [];

      for (const relativeRoot of STOREFRONT_SCAN_ROOTS) {
        for (const file of collectSourceFiles(
          path.join(REPO_ROOT, relativeRoot),
        )) {
          const fileViolations = evaluateStorefrontConnectionHygiene(
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

    it("rejects @/* cross-app alias imports across packages/ui sources", () => {
      const violations: string[] = [];

      for (const file of collectSourceFiles(
        path.join(REPO_ROOT, SHARED_UI_SCAN_ROOT),
      )) {
        const fileViolations = evaluateUiAliasHygiene(
          file,
          fs.readFileSync(file, "utf8"),
        );
        for (const violation of fileViolations) {
          violations.push(`${path.relative(REPO_ROOT, file)}: ${violation}`);
        }
      }

      expect(violations).toEqual([]);
    });

    it("rejects new happy-dom or react-dom/client mount tests outside the legacy allowlist", () => {
      expect(
        evaluateDomMountTestHygiene(
          "apps/storefront/src/features/orders/components/new-ui.spec.ts",
          'import { Window } from "happy-dom";\nimport { createRoot } from "react-dom/client";',
        ),
      ).toHaveLength(2);

      const violations: string[] = [];
      for (const relativeRoot of UI_SCAN_ROOTS) {
        for (const file of collectSourceFiles(
          path.join(REPO_ROOT, relativeRoot),
        )) {
          const relativePath = path
            .relative(REPO_ROOT, file)
            .split(path.sep)
            .join("/");
          const fileViolations = evaluateDomMountTestHygiene(
            relativePath,
            fs.readFileSync(file, "utf8"),
          );
          for (const violation of fileViolations) {
            violations.push(`${relativePath}: ${violation}`);
          }
        }
      }

      expect(violations).toEqual([]);
    });
  });
});
