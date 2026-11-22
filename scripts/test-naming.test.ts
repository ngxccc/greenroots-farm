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
const INPUT_ERROR_CODE_ALLOWLIST: Record<string, ReadonlySet<string>> = {
  "packages/shared/src/error-dictionary.spec.ts": new Set([
    "TOO_SMALL",
    "TOO_BIG",
    "ORDER_BELOW_MINIMUM_VALUE",
    "NETWORK_ERROR",
  ]),
};

const HTTP_STATUS_CODES =
  "(?:200|201|204|400|401|403|404|409|413|415|422|429|500|502|503)";
const MULTI_WORD_HTTP_PHRASES =
  "(?:no content|bad request|payload too large|unsupported media type|too many requests|internal server error|bad gateway|service unavailable)";
const CAPITALIZED_HTTP_PHRASES =
  "(?:Unauthorized|Forbidden|Conflict|Not Found|Unprocessable Entity)";
const HTTP_STATUS_CONTEXT_REGEX = new RegExp(
  `\\b(?:http|status|with|returns|throws|rejects|responds|to)\\s+${HTTP_STATUS_CODES}\\b|\\b${HTTP_STATUS_CODES}\\s+(?:ok|created|${MULTI_WORD_HTTP_PHRASES}|not found|unprocessable entity|unauthorized|forbidden|conflict)\\b|\\b${MULTI_WORD_HTTP_PHRASES}\\b`,
  "i",
);
const CAPITALIZED_HTTP_PHRASE_REGEX = new RegExp(
  `\\b${CAPITALIZED_HTTP_PHRASES}\\b`,
);
const STANDALONE_HTTP_CODE_REGEX = new RegExp(`\\b${HTTP_STATUS_CODES}\\b`);

const TEST_ID_REGEX = /\bT\d+-\d+\b|\[[A-Z]+-\d+\]/;
const INVARIANT_TAG_REGEX = /\bINV-[A-Z0-9-]+\b/i;
const FORBIDDEN_OPENERS =
  /^(?:should|silently|atomically|safely|always|never|also|only|quietly|gracefully|correctly|properly|tokens|users|batches|requests|responses|errors|status|access|success|it|this|that)$/i;
const THIRD_PERSON_VERB_REGEX = /^[a-z]+(?:-[a-z]+)*s$/;
const INTEGRATION_SUFFIX_REGEX = /\b(?:Module|E2E)\b/i;
const DESCRIBE_FORBIDDEN_UNIT_REGEX = /\b(?:Integration|Module|E2E)\b/i;
const SUITE_MODIFIERS = new Set([
  "only",
  "skip",
  "todo",
  "concurrent",
  "serial",
]);

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
 * Extracts all `API_ERROR_CODES` property keys from the shared error dictionary module via AST.
 *
 * @param sourceText Raw TypeScript source of `packages/shared/src/error-dictionary.ts`.
 * @returns Set of exported error code member names defined in `API_ERROR_CODES`.
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
          if (ts.isPropertyAssignment(prop)) {
            if (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) {
              keys.add(prop.name.text);
            }
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

function unwrapSuiteCalleeChain(expr: ts.Expression): SuiteKind | null {
  let current: ts.Expression = expr;
  while (ts.isPropertyAccessExpression(current)) {
    if (!SUITE_MODIFIERS.has(current.name.text)) {
      return null;
    }
    current = current.expression;
  }
  if (
    ts.isIdentifier(current) &&
    (current.text === "describe" ||
      current.text === "it" ||
      current.text === "test")
  ) {
    return current.text;
  }
  return null;
}

function getSuiteCallKind(expr: ts.Expression): SuiteKind | null {
  const direct = unwrapSuiteCalleeChain(expr);
  if (direct) return direct;

  // Handle curried `it.each(cases)("title", fn)` / `describe.each(cases)("title", fn)`
  // by recognizing the outer CallExpression and ignoring arbitrary `receiver.test()`.
  if (
    ts.isCallExpression(expr) &&
    ts.isPropertyAccessExpression(expr.expression) &&
    expr.expression.name.text === "each"
  ) {
    return unwrapSuiteCalleeChain(expr.expression.expression);
  }

  return null;
}

/**
 * Evaluates a TypeScript test file AST against `INV-TEST-1`, `INV-TEST-2`, and `INV-TEST-3`.
 *
 * @param relativePath Repository-relative POSIX or platform path of the test file.
 * @param sourceText TypeScript source contents of the test file.
 * @param apiErrorCodes Set of `API_ERROR_CODES` keys extracted from `@greenroots/shared`.
 * @returns List of human-readable naming violation messages (`file:line ...`).
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
  const allowedInputErrorCodes =
    INPUT_ERROR_CODE_ALLOWLIST[normalizedPath] ?? new Set<string>();
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
    if (
      HTTP_STATUS_CONTEXT_REGEX.test(title) ||
      CAPITALIZED_HTTP_PHRASE_REGEX.test(title) ||
      (kind === "describe" && STANDALONE_HTTP_CODE_REGEX.test(title))
    ) {
      violations.push(
        `${normalizedPath}:${line} [${kind}] embeds HTTP status or phrase in "${title}"`,
      );
    }
    const tokens = title.match(/\b[A-Z][A-Z0-9_]{2,}\b/g) ?? [];
    for (const token of tokens) {
      if (apiErrorCodes.has(token) && !allowedInputErrorCodes.has(token)) {
        violations.push(
          `${normalizedPath}:${line} [${kind}] embeds outcome error code ${token} in "${title}"`,
        );
      }
    }
  }

  function visit(node: ts.Node, describeDepth: number) {
    let nextDepth = describeDepth;
    let skipCallee = false;

    if (ts.isCallExpression(node)) {
      const kind = getSuiteCallKind(node.expression);
      if (kind && node.arguments.length > 0) {
        // Prevent visiting the inner `it.each(cases)` CallExpression as a separate test call.
        skipCallee = ts.isCallExpression(node.expression);
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
                (/\bwhen\b/i.test(title) || /\([^)]+\)/.test(title))
              ) {
                violations.push(
                  `${normalizedPath}:${line} [describe L${level}] must omit when/parenthetical modifiers in "${title}"`,
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
              FORBIDDEN_OPENERS.test(firstWord) ||
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

    ts.forEachChild(node, (child) => {
      if (
        skipCallee &&
        ts.isCallExpression(node) &&
        child === node.expression
      ) {
        return;
      }
      visit(child, nextDepth);
    });
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
            it("always returns ok", () => {});
            it("tokens match digest", () => {});
            it("token hashes match", () => {});
          });
        });
      `;
      const issues = evaluateTestFileNaming(
        "apps/api/src/sample.spec.ts",
        sample,
        API_ERROR_CODE_KEYS,
      );
      expect(issues).toHaveLength(5);
    });

    it("rejects HTTP statuses, status phrases, INV tags, and un-allowlisted API error codes", () => {
      // Invariant: INV-TEST-2
      const sample = `
        describe("Sample Integration", () => {
          describe("POST /api/v1/sample", () => {
            it("throws 401 when unauthenticated", () => {});
            it("returns bad request on invalid input", () => {});
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
      expect(issues).toHaveLength(4);

      const dictionarySample = `
        describe("resolveSharedApiErrorMessage", () => {
          it("interpolates TOO_SMALL and throws ORDER_NOT_FOUND", () => {});
        });
      `;
      const dictIssues = evaluateTestFileNaming(
        "packages/shared/src/error-dictionary.spec.ts",
        dictionarySample,
        API_ERROR_CODE_KEYS,
      );
      expect(dictIssues).toHaveLength(1);
      expect(dictIssues[0]).toContain("ORDER_NOT_FOUND");
    });

    it("ignores non-test method calls, supports curried .each calls, and fails closed on dynamic titles", () => {
      // Invariant: INV-TEST-1, INV-TEST-3
      const sample = `
        describe("version scripts", () => {
          it("accepts valid semver", () => {
            expect(/a/.test("1.2.3")).toBe(true);
          });
          it.each([1, 2])("parses valid input", () => {});
          it.skip.only("skips safely", () => {});
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

    it("enforces 3-level describe grammar and clean Level 2 titles for integration suites", () => {
      // Invariant: INV-TEST-3
      const integrationBad = `
        describe("Media module Integration", () => {
          describe("POST /media (admin)", () => {
            describe("nested", () => {
              it("rejects payload", () => {});
            });
          });
          describe("POST /orders when unauthenticated", () => {
            it("rejects caller", () => {});
          });
          describe("POST /orders - 400", () => {
            it("rejects payload", () => {});
          });
        });
      `;
      const issues = evaluateTestFileNaming(
        "apps/api/test/integration/media.spec.ts",
        integrationBad,
        API_ERROR_CODE_KEYS,
      );
      expect(issues).toHaveLength(5);
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
