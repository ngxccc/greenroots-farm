import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const REPO_ROOT = path.resolve(import.meta.dir, "..");

const SCAN_ROOTS = [
  "apps/api/src",
  "apps/api/test",
  "packages/shared/src",
  "apps/storefront/src",
  "apps/backoffice/src",
  "scripts",
] as const;

const TEST_FILE_PATTERN = /\.(spec|e2e-spec|test)\.tsx?$/;
const ERROR_DICTIONARY_PATH = path.join(
  REPO_ROOT,
  "packages/shared/src/error-dictionary.ts",
);
const INPUT_ALLOWLIST_FILES = new Set([
  "packages/shared/src/error-dictionary.spec.ts",
]);

const HTTP_STATUS_CODES =
  "(?:200|201|204|400|401|403|404|409|413|415|422|429|500|502|503)";
const HTTP_STATUS_PHRASES =
  "(?:Bad Request|Unauthorized|Forbidden|Not Found|Conflict|Unprocessable Entity|Too Many Requests|Service Unavailable)";
const HTTP_STATUS_CONTEXT_REGEX = new RegExp(
  `\\b(?:HTTP|status|with|returns|to)\\s+${HTTP_STATUS_CODES}\\b|\\b${HTTP_STATUS_CODES}\\s+(?:OK|Created|${HTTP_STATUS_PHRASES})\\b|\\b${HTTP_STATUS_PHRASES}\\b`,
);
const TEST_ID_REGEX = /\bT\d+-\d+\b|\[[A-Z]+-\d+\]/;
const INVARIANT_TAG_REGEX = /\bINV-[A-Z0-9-]+\b/i;
const FORBIDDEN_ADVERB_OR_SHOULD = /^(?:should|silently|atomically|safely)$/i;
const THIRD_PERSON_VERB_REGEX = /^[a-z]+(?:-[a-z]+)*s$/;
const INTEGRATION_SUFFIX_REGEX = /\b(?:Module|E2E)\b/;
const DESCRIBE_FORBIDDEN_UNIT_REGEX = /\b(?:Integration|Module|E2E)\b/i;

type SuiteKind = "describe" | "it" | "test";

function collectTestFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTestFiles(fullPath));
    } else if (entry.isFile() && TEST_FILE_PATTERN.test(entry.name)) {
      results.push(fullPath);
    }
  }

  return results.sort();
}

/**
 * Extracts all API_ERROR_CODES keys from packages/shared/src/error-dictionary.ts via AST.
 */
export function extractApiErrorCodeKeys(sourceText: string): Set<string> {
  const sf = ts.createSourceFile(
    "error-dictionary.ts",
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );
  const keys = new Set<string>();

  function visit(node: ts.Node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "API_ERROR_CODES" &&
      node.initializer
    ) {
      let expr: ts.Expression = node.initializer;
      while (
        ts.isAsExpression(expr) ||
        ts.isSatisfiesExpression(expr) ||
        ts.isParenthesizedExpression(expr)
      ) {
        expr = expr.expression;
      }
      if (ts.isObjectLiteralExpression(expr)) {
        for (const prop of expr.properties) {
          if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
            keys.add(prop.name.text);
          }
        }
      }
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(sf);
  return keys;
}

function getSuiteCallKind(expr: ts.Expression): SuiteKind | null {
  if (
    ts.isIdentifier(expr) &&
    (expr.text === "describe" || expr.text === "it" || expr.text === "test")
  ) {
    return expr.text;
  }

  // Only match direct describe/it/test modifiers (e.g., it.only, describe.skip),
  // ignoring arbitrary receiver .test() calls such as SEMVER.test("1.2.3").
  if (
    ts.isPropertyAccessExpression(expr) &&
    ts.isIdentifier(expr.expression) &&
    (expr.expression.text === "describe" ||
      expr.expression.text === "it" ||
      expr.expression.text === "test") &&
    ["only", "skip", "todo", "each", "concurrent", "serial"].includes(
      expr.name.text,
    )
  ) {
    return expr.expression.text;
  }

  return null;
}

/**
 * Evaluates a TypeScript test file AST against INV-TEST-1, INV-TEST-2, and INV-TEST-3.
 */
export function evaluateTestFileNaming(
  relativePath: string,
  sourceText: string,
  apiErrorCodes: ReadonlySet<string>,
): string[] {
  const sf = ts.createSourceFile(
    relativePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );
  const normalizedPath = relativePath.replace(/\\/g, "/");
  const isIntegrationSuite = normalizedPath.startsWith("apps/api/test/");
  const allowInputErrorCodes = INPUT_ALLOWLIST_FILES.has(normalizedPath);
  const violations: string[] = [];

  function checkForbiddenTokens(line: number, kind: SuiteKind, title: string) {
    if (TEST_ID_REGEX.test(title)) {
      violations.push(
        `${normalizedPath}:${line} [${kind}] embeds test ID in "${title}"`,
      );
    }
    if (INVARIANT_TAG_REGEX.test(title)) {
      violations.push(
        `${normalizedPath}:${line} [${kind}] embeds INV tag in "${title}"`,
      );
    }
    if (HTTP_STATUS_CONTEXT_REGEX.test(title)) {
      violations.push(
        `${normalizedPath}:${line} [${kind}] embeds HTTP status or phrase in "${title}"`,
      );
    }
    if (!allowInputErrorCodes) {
      const tokens = title.match(/\b[A-Z][A-Z0-9_]{2,}\b/g) ?? [];
      for (const token of tokens) {
        if (apiErrorCodes.has(token)) {
          violations.push(
            `${normalizedPath}:${line} [${kind}] embeds outcome error code ${token} in "${title}"`,
          );
        }
      }
    }
  }

  function visit(node: ts.Node, describeDepth: number) {
    let nextDepth = describeDepth;

    if (ts.isCallExpression(node)) {
      const kind = getSuiteCallKind(node.expression);
      if (kind && node.arguments.length > 0) {
        const firstArg = node.arguments[0];
        const line =
          sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

        if (
          !firstArg ||
          (!ts.isStringLiteral(firstArg) &&
            !ts.isNoSubstitutionTemplateLiteral(firstArg))
        ) {
          violations.push(
            `${normalizedPath}:${line} [${kind}] uses non-literal dynamic title`,
          );
        } else {
          const title = firstArg.text.trim();
          checkForbiddenTokens(line, kind, title);

          if (kind === "describe") {
            const level = describeDepth + 1;
            nextDepth = level;

            if (level > 2) {
              violations.push(
                `${normalizedPath}:${line} [describe L${level}] exceeds 3-level hierarchy in "${title}"`,
              );
            }

            if (isIntegrationSuite) {
              if (
                level === 1 &&
                (!title.endsWith(" Integration") ||
                  INTEGRATION_SUFFIX_REGEX.test(title))
              ) {
                violations.push(
                  `${normalizedPath}:${line} [describe L1] must end with " Integration" without Module/E2E in "${title}"`,
                );
              }
              if (
                level >= 2 &&
                (/^when\b/i.test(title) || /\(authenticated\)/i.test(title))
              ) {
                violations.push(
                  `${normalizedPath}:${line} [describe L${level}] must omit when/parenthetical clauses in "${title}"`,
                );
              }
            } else {
              if (
                DESCRIBE_FORBIDDEN_UNIT_REGEX.test(title) ||
                /^when\b/i.test(title)
              ) {
                violations.push(
                  `${normalizedPath}:${line} [describe L${level}] unit describe must omit Integration/Module/E2E/when in "${title}"`,
                );
              }
            }
          } else {
            const rawFirstWord = title.split(/\s+/)[0] ?? "";
            const firstWord = rawFirstWord.replace(/,+$/, "");
            if (
              FORBIDDEN_ADVERB_OR_SHOULD.test(firstWord) ||
              !THIRD_PERSON_VERB_REGEX.test(firstWord)
            ) {
              violations.push(
                `${normalizedPath}:${line} [${kind}] must start with a third-person active verb in "${title}"`,
              );
            }
          }
        }
      }
    }

    ts.forEachChild(node, (child) => visit(child, nextDepth));
  }

  visit(sf, 0);
  return violations;
}

const API_ERROR_CODE_KEYS = extractApiErrorCodeKeys(
  fs.readFileSync(ERROR_DICTIONARY_PATH, "utf8"),
);

describe("Test Naming Compliance", () => {
  describe("evaluateTestFileNaming", () => {
    it("rejects should prefixes, leading adverbs, and non-verb openers", () => {
      // Invariant: INV-TEST-1
      const sample = `
        describe("SampleService", () => {
          describe("run", () => {
            it("should return ok", () => {});
            it("silently returns ok", () => {});
            it("token hashes match", () => {});
          });
        });
      `;
      const issues = evaluateTestFileNaming(
        "apps/api/src/sample.spec.ts",
        sample,
        API_ERROR_CODE_KEYS,
      );
      expect(issues).toHaveLength(3);
    });

    it("rejects HTTP statuses, status phrases, INV tags, and outcome API error codes", () => {
      // Invariant: INV-TEST-2
      const sample = `
        describe("Sample Integration", () => {
          describe("POST /api/v1/sample", () => {
            it("rejects with 401 Unauthorized", () => {});
            it("throws ORDER_NOT_FOUND on missing order", () => {});
            it("enforces INV-ORD-1 on checkout", () => {});
          });
        });
      `;
      const issues = evaluateTestFileNaming(
        "apps/api/test/integration/sample.spec.ts",
        sample,
        API_ERROR_CODE_KEYS,
      );
      expect(issues).toHaveLength(3);
    });

    it("ignores non-test method calls such as regex.test and fails closed on dynamic titles", () => {
      // Invariant: INV-TEST-1, INV-TEST-3
      const sample = `
        describe("version scripts", () => {
          it("accepts valid semver", () => {
            expect(/a/.test("1.2.3")).toBe(true);
          });
          it(dynamicTitle, () => {});
        });
      `;
      const issues = evaluateTestFileNaming(
        "scripts/sample.test.ts",
        sample,
        API_ERROR_CODE_KEYS,
      );
      expect(issues).toHaveLength(1);
      expect(issues[0]).toContain("non-literal dynamic title");
    });

    it("enforces 3-level describe grammar for integration and unit suites", () => {
      // Invariant: INV-TEST-3
      const integrationBad = `
        describe("Media Module Integration", () => {
          describe("POST /media (authenticated)", () => {
            describe("nested", () => {
              it("rejects payload", () => {});
            });
          });
        });
      `;
      const issues = evaluateTestFileNaming(
        "apps/api/test/integration/media.spec.ts",
        integrationBad,
        API_ERROR_CODE_KEYS,
      );
      expect(issues).toHaveLength(3);
    });
  });

  describe("monorepo test suites", () => {
    it("enforces test naming rules across every workspace test file", () => {
      // Invariant: INV-TEST-1, INV-TEST-2, INV-TEST-3, INV-TEST-5
      expect(API_ERROR_CODE_KEYS.size).toBeGreaterThan(0);
      const files = SCAN_ROOTS.flatMap((root) =>
        collectTestFiles(path.join(REPO_ROOT, root)),
      );
      expect(files.length).toBeGreaterThan(0);

      const allViolations: string[] = [];
      for (const filePath of files) {
        const rel = path.relative(REPO_ROOT, filePath);
        const content = fs.readFileSync(filePath, "utf8");
        allViolations.push(
          ...evaluateTestFileNaming(rel, content, API_ERROR_CODE_KEYS),
        );
      }

      expect(allViolations).toEqual([]);
    });
  });
});
