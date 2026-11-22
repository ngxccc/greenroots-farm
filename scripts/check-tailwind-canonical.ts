#!/usr/bin/env bun
/**
 * Detects non-canonical Tailwind CSS v4 utility classes across UI workspaces while
 * suppressing false positives caused by runtime `:root` CSS variable overrides.
 *
 * Usage:
 *   bun scripts/check-tailwind-canonical.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const DEFAULT_REM_PX = 16;
const FLOAT_EPSILON = 1e-4;
const MAX_VAR_DEPTH = 10;
const REPO_ROOT = path.resolve(import.meta.dir, "..");
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".css", ".mdx", ".html"]);
const TEST_FILE_PATTERN = /\.(?:spec|test)\.[^.]+$/i;
const DECLARATION_FILE_PATTERN = /\.d\.[^.]+$/i;
const IGNORED_PATH_SEGMENTS = new Set(["node_modules", ".next", "dist"]);

/** Workspace CSS entrypoint and source directory roots scanned for Tailwind classes. */
export interface WorkspaceTarget {
  readonly name: string;
  readonly cssEntrypoint: string;
  readonly scanRoots: readonly string[];
}

/** Single verified non-canonical utility class occurrence in a source file. */
export interface CanonicalViolation {
  readonly workspace: string;
  readonly filePath: string;
  readonly line: number;
  readonly column: number;
  readonly original: string;
  readonly canonical: string;
}

interface CandidateWithPosition {
  readonly candidate: string;
  readonly position: number;
}

interface TailwindScanner {
  scan(): string[];
  getCandidatesWithPositions(input: {
    file?: string;
    content?: string;
    extension: string;
  }): CandidateWithPosition[];
  readonly files: string[];
}

interface TailwindDesignSystem {
  canonicalizeCandidates(
    candidates: string[],
    options?: { rem?: number },
  ): string[];
  candidatesToCss(candidates: string[]): (string | null)[];
  readonly theme: {
    entries(): Iterable<[string, { value: string }]>;
  };
}

/** Runtime loaders resolved from `@tailwindcss/node` and `@tailwindcss/oxide`. */
export interface TailwindTooling {
  loadDesignSystem(
    css: string,
    opts: { base: string },
  ): Promise<TailwindDesignSystem>;
  createScanner(opts: {
    sources: Array<{ base: string; pattern: string; negated: boolean }>;
  }): TailwindScanner;
}

/** Configured UI workspaces checked by default. */
export const UI_WORKSPACES: readonly WorkspaceTarget[] = [
  {
    name: "packages/ui",
    cssEntrypoint: "packages/ui/src/styles/globals.css",
    scanRoots: ["packages/ui/src"],
  },
  {
    name: "apps/storefront",
    cssEntrypoint: "apps/storefront/src/styles/globals.css",
    scanRoots: ["apps/storefront/src", "apps/storefront/app"],
  },
  {
    name: "apps/backoffice",
    cssEntrypoint: "apps/backoffice/src/styles/globals.css",
    scanRoots: ["apps/backoffice/src"],
  },
];

/**
 * Dynamically loads the Tailwind v4 Node design-system compiler and Oxide scanner.
 *
 * @returns Loaded runtime tooling wrappers for design-system loading and scanning.
 */
export async function loadTailwindTooling(): Promise<TailwindTooling> {
  const twNode = (await import("@tailwindcss/node")) as unknown as {
    __unstable__loadDesignSystem?: TailwindTooling["loadDesignSystem"];
  };
  const twOxide = (await import("@tailwindcss/oxide")) as unknown as {
    Scanner?: new (opts: {
      sources: Array<{ base: string; pattern: string; negated: boolean }>;
    }) => TailwindScanner;
  };

  if (
    typeof twNode.__unstable__loadDesignSystem !== "function" ||
    typeof twOxide.Scanner !== "function"
  ) {
    throw new Error(
      "Incompatible Tailwind CSS tooling: expected __unstable__loadDesignSystem and Scanner exports.",
    );
  }

  const loadDesignSystem = twNode.__unstable__loadDesignSystem;
  const ScannerCtor = twOxide.Scanner;

  return {
    loadDesignSystem,
    createScanner: (opts) => new ScannerCtor(opts),
  };
}

function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function findMatchingBrace(text: string, openIndex: number): number {
  let depth = 0;
  let quote: string | null = null;

  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i];
    if (ch === undefined) break;

    if (quote !== null) {
      if (ch === "\\" && i + 1 < text.length) {
        i++;
        continue;
      }
      if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }

    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }

  return -1;
}

function splitTopLevelDeclarations(body: string): string[] {
  const statements: string[] = [];
  let parenDepth = 0;
  let bracketDepth = 0;
  let quote: string | null = null;
  let start = 0;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === undefined) break;

    if (quote !== null) {
      if (ch === "\\" && i + 1 < body.length) {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "(") {
      parenDepth++;
    } else if (ch === ")" && parenDepth > 0) {
      parenDepth--;
    } else if (ch === "[") {
      bracketDepth++;
    } else if (ch === "]" && bracketDepth > 0) {
      bracketDepth--;
    } else if (ch === ";" && parenDepth === 0 && bracketDepth === 0) {
      const slice = body.slice(start, i).trim();
      if (slice.length > 0) statements.push(slice);
      start = i + 1;
    }
  }

  const tail = body.slice(start).trim();
  if (tail.length > 0) statements.push(tail);
  return statements;
}

function parseDeclarationsMap(body: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const decl of splitTopLevelDeclarations(body)) {
    const colonIdx = decl.indexOf(":");
    if (colonIdx === -1) continue;
    const prop = decl.slice(0, colonIdx).trim();
    const val = normalizeWhitespace(decl.slice(colonIdx + 1));
    if (prop.length > 0) {
      map.set(prop, val);
    }
  }
  return map;
}

function resolveCssImport(
  specifier: string,
  fromCssFile: string,
): string | null {
  if (specifier === "tailwindcss" || specifier.startsWith("tailwindcss/")) {
    return null;
  }

  const dir = path.dirname(fromCssFile);
  if (specifier.startsWith(".")) {
    const candidate = path.resolve(dir, specifier);
    return existsSync(candidate) ? candidate : null;
  }

  try {
    const req = createRequire(fromCssFile);
    const resolved = req.resolve(specifier);
    return existsSync(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

function extractRootVarsFromBlock(
  cssText: string,
  result: Map<string, string>,
): void {
  let cursor = 0;
  while (cursor < cssText.length) {
    const openIdx = cssText.indexOf("{", cursor);
    if (openIdx === -1) break;
    const headerStart = Math.max(
      cssText.lastIndexOf("}", openIdx - 1) + 1,
      cssText.lastIndexOf(";", openIdx - 1) + 1,
    );
    const header = cssText.slice(headerStart, openIdx).trim();
    const closeIdx = findMatchingBrace(cssText, openIdx);
    if (closeIdx === -1) break;

    const body = cssText.slice(openIdx + 1, closeIdx);
    const selectors = header.split(",").map((s) => s.trim());
    if (selectors.includes(":root")) {
      for (const [prop, val] of parseDeclarationsMap(body)) {
        if (prop.startsWith("--")) {
          result.set(prop, val);
        }
      }
    } else if (header.startsWith("@layer")) {
      // Recurse into unconditional @layer blocks while skipping conditional @media overrides.
      extractRootVarsFromBlock(body, result);
    }

    cursor = closeIdx + 1;
  }
}

/**
 * Recursively parses `@import` stylesheets and extracts `:root` CSS custom properties
 * in cascade order so app entrypoints inherit shared tokens such as `--radius`.
 *
 * @param cssEntrypoint Path to the root stylesheet entrypoint to parse.
 * @param visited Internal set of resolved stylesheet paths to guard against `@import` cycles.
 * @returns Ordered map of CSS custom property names (`--*`) to their raw `:root` values.
 */
export function collectRootCssVariables(
  cssEntrypoint: string,
  visited: Set<string> = new Set(),
): Map<string, string> {
  const absPath = path.resolve(cssEntrypoint);
  const result = new Map<string, string>();
  if (visited.has(absPath) || !existsSync(absPath)) {
    return result;
  }
  visited.add(absPath);

  const cleaned = stripCssComments(readFileSync(absPath, "utf8"));

  // Resolve @import statements in cascade order before local :root blocks apply.
  const importRegex = /@import\s+(?:url\(\s*)?["']([^"']+)["']\s*\)?[^;]*;/g;
  for (const match of cleaned.matchAll(importRegex)) {
    const specifier = match[1];
    if (!specifier) continue;
    const importedPath = resolveCssImport(specifier, absPath);
    if (!importedPath) continue;
    const importedVars = collectRootCssVariables(importedPath, visited);
    for (const [key, val] of importedVars) {
      result.set(key, val);
    }
  }

  extractRootVarsFromBlock(cleaned, result);
  return result;
}

interface CalcValue {
  readonly px: number;
  readonly hasUnit: boolean;
}

function splitFirstTopLevelComma(input: string): [string, string | null] {
  let depth = 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "(") depth++;
    else if (ch === ")" && depth > 0) depth--;
    else if (ch === "," && depth === 0) {
      return [input.slice(0, i).trim(), input.slice(i + 1).trim()];
    }
  }
  return [input.trim(), null];
}

function findMatchingParen(input: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < input.length; i++) {
    const ch = input[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function expandCssVars(
  expr: string,
  vars: ReadonlyMap<string, string>,
  visited: ReadonlySet<string>,
): string | null {
  if (visited.size > MAX_VAR_DEPTH) {
    return null;
  }

  let out = "";
  let i = 0;
  while (i < expr.length) {
    if (expr.startsWith("var(", i)) {
      const closeIdx = findMatchingParen(expr, i + 3);
      if (closeIdx === -1) return null;
      const inner = expr.slice(i + 4, closeIdx);
      const [varNameRaw, fallbackRaw] = splitFirstTopLevelComma(inner);
      const varName = varNameRaw.trim();
      if (visited.has(varName)) {
        return null;
      }

      const rawValue = vars.get(varName);
      const chosen =
        rawValue !== undefined && rawValue.length > 0 ? rawValue : fallbackRaw;
      if (chosen === null || chosen === undefined || chosen.length === 0) {
        return null;
      }

      const nextVisited = new Set(visited);
      nextVisited.add(varName);
      const resolved = expandCssVars(chosen, vars, nextVisited);
      if (resolved === null) return null;

      out += `(${resolved})`;
      i = closeIdx + 1;
      continue;
    }

    out += expr[i];
    i++;
  }

  return out;
}

function parseArithmeticExpression(input: string): CalcValue | null {
  let pos = 0;

  function skipWs(): void {
    while (pos < input.length && /\s/.test(input[pos] ?? "")) {
      pos++;
    }
  }

  function parseExpression(): CalcValue | null {
    let left = parseTerm();
    if (!left) return null;

    while (true) {
      skipWs();
      const op = input[pos];
      if (op !== "+" && op !== "-") break;
      pos++;
      const right = parseTerm();
      if (!right || left.hasUnit !== right.hasUnit) return null;
      left = {
        px: op === "+" ? left.px + right.px : left.px - right.px,
        hasUnit: left.hasUnit,
      };
    }

    return left;
  }

  function parseTerm(): CalcValue | null {
    let left = parseFactor();
    if (!left) return null;

    while (true) {
      skipWs();
      const op = input[pos];
      if (op !== "*" && op !== "/") break;
      pos++;
      const right = parseFactor();
      if (!right) return null;

      if (op === "*") {
        if (left.hasUnit && right.hasUnit) return null;
        left = {
          px: left.px * right.px,
          hasUnit: left.hasUnit || right.hasUnit,
        };
      } else {
        if (right.hasUnit || Math.abs(right.px) <= FLOAT_EPSILON) return null;
        left = {
          px: left.px / right.px,
          hasUnit: left.hasUnit,
        };
      }
    }

    return left;
  }

  function parseFactor(): CalcValue | null {
    skipWs();
    if (pos >= input.length) return null;

    const ch = input[pos];
    if (ch === "+" || ch === "-") {
      pos++;
      const inner = parseFactor();
      if (!inner) return null;
      return {
        px: ch === "-" ? -inner.px : inner.px,
        hasUnit: inner.hasUnit,
      };
    }

    if (input.startsWith("calc(", pos)) {
      pos += 5;
      const inner = parseExpression();
      skipWs();
      if (input[pos] !== ")" || !inner) return null;
      pos++;
      return inner;
    }

    if (ch === "(") {
      pos++;
      const inner = parseExpression();
      skipWs();
      if (input[pos] !== ")" || !inner) return null;
      pos++;
      return inner;
    }

    const slice = input.slice(pos);
    const numMatch = /^(\d+(?:\.\d+)?|\.\d+)(px|rem)?/i.exec(slice);
    if (!numMatch) return null;

    pos += numMatch[0].length;
    const rawNum = Number.parseFloat(numMatch[1] ?? "");
    if (!Number.isFinite(rawNum)) return null;

    const unit = numMatch[2]?.toLowerCase();
    if (unit === "rem") {
      return { px: rawNum * DEFAULT_REM_PX, hasUnit: true };
    }
    if (unit === "px") {
      return { px: rawNum, hasUnit: true };
    }

    return {
      px: rawNum,
      hasUnit: rawNum === 0,
    };
  }

  const parsed = parseExpression();
  skipWs();
  if (!parsed || pos !== input.length) return null;
  return parsed;
}

/**
 * Evaluates a CSS length/arithmetic expression (supporting `px`, `rem`, `calc(...)`,
 * `0`, and recursive `var(--*)` substitution) into pixels, or returns `null` when
 * the expression relies on unresolved runtime variables or non-length values.
 *
 * @param expr Raw CSS value expression to evaluate.
 * @param vars Effective map of CSS custom properties used to resolve `var(--*)`.
 * @returns Computed length in pixels, or `null` if unresolvable or non-length.
 */
export function evaluateCssLength(
  expr: string,
  vars: ReadonlyMap<string, string>,
): number | null {
  const expanded = expandCssVars(expr.trim(), vars, new Set());
  if (expanded === null) return null;

  const parsed = parseArithmeticExpression(expanded);
  if (!parsed || !parsed.hasUnit) return null;
  return parsed.px;
}

function splitCssSpaceTokens(value: string): string[] {
  const tokens: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;

  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === undefined) break;

    if (quote !== null) {
      if (ch === "\\" && i + 1 < value.length) {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "(") {
      depth++;
    } else if (ch === ")" && depth > 0) {
      depth--;
    } else if (/\s/.test(ch) && depth === 0) {
      const token = value.slice(start, i).trim();
      if (token.length > 0) tokens.push(token);
      start = i + 1;
    }
  }

  const tail = value.slice(start).trim();
  if (tail.length > 0) tokens.push(tail);
  return tokens;
}

/**
 * Checks whether two compiled CSS declaration values produce identical computed
 * output once `:root` / `@theme` variables and `rem`/`calc` math are resolved.
 *
 * @param origValue Compiled CSS declaration value from the original candidate.
 * @param canonValue Compiled CSS declaration value from the canonical candidate.
 * @param vars Effective CSS custom properties map for variable substitution.
 * @returns `true` if values are textually identical or evaluate to equal pixel tokens.
 */
export function areCssValuesEquivalent(
  origValue: string,
  canonValue: string,
  vars: ReadonlyMap<string, string>,
): boolean {
  const normA = normalizeWhitespace(origValue);
  const normB = normalizeWhitespace(canonValue);
  if (normA === normB) return true;

  const tokensA = splitCssSpaceTokens(normA);
  const tokensB = splitCssSpaceTokens(normB);
  if (tokensA.length !== tokensB.length) return false;

  for (let i = 0; i < tokensA.length; i++) {
    const a = tokensA[i];
    const b = tokensB[i];
    if (a === undefined || b === undefined) return false;
    if (a === b) continue;

    const pxA = evaluateCssLength(a, vars);
    const pxB = evaluateCssLength(b, vars);
    if (pxA === null || pxB === null) return false;
    if (Math.abs(pxA - pxB) > FLOAT_EPSILON) return false;
  }

  return true;
}

type CssNode =
  | {
      readonly kind: "rule";
      readonly selector: string;
      readonly declarations: Map<string, string>;
    }
  | {
      readonly kind: "at-rule";
      readonly header: string;
      readonly children: CssNode[];
    };

interface ParsedCompiledCss {
  readonly properties: Map<string, string>;
  readonly nodes: CssNode[];
}

function parseCssBlocks(
  blockText: string,
  properties: Map<string, string>,
): CssNode[] {
  const nodes: CssNode[] = [];
  let cursor = 0;

  while (cursor < blockText.length) {
    const openIdx = blockText.indexOf("{", cursor);
    if (openIdx === -1) break;
    const header = normalizeWhitespace(blockText.slice(cursor, openIdx));
    const closeIdx = findMatchingBrace(blockText, openIdx);
    if (closeIdx === -1) break;

    const inner = blockText.slice(openIdx + 1, closeIdx);
    if (header.startsWith("@property ")) {
      properties.set(header, normalizeWhitespace(inner));
    } else if (header.startsWith("@")) {
      nodes.push({
        kind: "at-rule",
        header,
        children: parseCssBlocks(inner, properties),
      });
    } else {
      nodes.push({
        kind: "rule",
        selector: header,
        declarations: parseDeclarationsMap(inner),
      });
    }

    cursor = closeIdx + 1;
  }

  return nodes;
}

function unescapeCssClassIdent(escaped: string): string {
  return escaped.replace(
    /\\(?:([0-9a-fA-F]{1,6})[ \t\r\n\f]?|(.))/g,
    (_match, hex: string | undefined, literal: string | undefined) => {
      if (hex !== undefined) {
        const codePoint = Number.parseInt(hex, 16);
        return Number.isFinite(codePoint) &&
          codePoint > 0 &&
          codePoint <= 0x10ffff
          ? String.fromCodePoint(codePoint)
          : "\ufffd";
      }
      return literal ?? "";
    },
  );
}

function normalizeSelector(selector: string, candidate: string): string {
  // Mask only the class segment generated for the tested candidate so variant wrappers remain compared.
  let out = "";
  let i = 0;
  while (i < selector.length) {
    if (selector[i] === ".") {
      let j = i + 1;
      while (j < selector.length) {
        const ch = selector[j];
        if (ch === undefined) break;
        if (ch === "\\") {
          // Consume CSS hex escape plus its single optional trailing delimiter space (e.g. \32 ).
          const hexMatch = /^\\([0-9a-fA-F]{1,6})[ \t\r\n\f]?/.exec(
            selector.slice(j),
          );
          if (hexMatch) {
            j += hexMatch[0].length;
            continue;
          }
          j += 2;
          continue;
        }
        if (/[\s>+~,:()[\]{}.#*]/.test(ch)) break;
        j++;
      }
      const rawIdent = selector.slice(i + 1, j);
      if (unescapeCssClassIdent(rawIdent) === candidate) {
        out += ".__CANDIDATE__";
        i = j;
        continue;
      }
    }
    out += selector[i];
    i++;
  }

  // Collapse Tailwind's :is(:pseudo) wrapper generated by arbitrary selectors like has-[:focus-visible].
  const collapsed = out.replace(/:is\(\s*(:[a-zA-Z-]+)\s*\)/g, "$1");
  return normalizeWhitespace(collapsed);
}

function compareDeclarationMaps(
  declA: ReadonlyMap<string, string>,
  declB: ReadonlyMap<string, string>,
  vars: ReadonlyMap<string, string>,
): boolean {
  if (declA.size !== declB.size) return false;
  for (const [prop, valA] of declA) {
    const valB = declB.get(prop);
    if (valB === undefined) return false;
    if (!areCssValuesEquivalent(valA, valB, vars)) return false;
  }
  return true;
}

function compareCssNodeLists(
  nodesA: readonly CssNode[],
  origCandidate: string,
  nodesB: readonly CssNode[],
  canonCandidate: string,
  vars: ReadonlyMap<string, string>,
): boolean {
  if (nodesA.length !== nodesB.length) return false;

  for (let i = 0; i < nodesA.length; i++) {
    const a = nodesA[i];
    const b = nodesB[i];
    if (!a || !b || a.kind !== b.kind) return false;

    if (a.kind === "at-rule" && b.kind === "at-rule") {
      if (a.header !== b.header) return false;
      if (
        !compareCssNodeLists(
          a.children,
          origCandidate,
          b.children,
          canonCandidate,
          vars,
        )
      ) {
        return false;
      }
      continue;
    }

    if (a.kind === "rule" && b.kind === "rule") {
      const selA = normalizeSelector(a.selector, origCandidate);
      const selB = normalizeSelector(b.selector, canonCandidate);
      if (selA !== selB) return false;
      if (!compareDeclarationMaps(a.declarations, b.declarations, vars)) {
        return false;
      }
    }
  }

  return true;
}

function parseCompiledCss(css: string): ParsedCompiledCss {
  const properties = new Map<string, string>();
  const nodes = parseCssBlocks(css, properties);
  return { properties, nodes };
}

/**
 * Verifies whether replacing `origCandidate` with `canonCandidate` emits equivalent
 * compiled CSS rules, selectors, `@property` blocks, and computed `:root` token values.
 *
 * @param ds Loaded Tailwind v4 design system instance.
 * @param origCandidate Candidate class found in source code.
 * @param canonCandidate Proposed canonical class returned by Tailwind.
 * @param cssVars Effective CSS custom properties map for the workspace.
 * @returns `true` if compiled CSS output and selectors match safely.
 */
export function areCandidatesCssEquivalent(
  ds: TailwindDesignSystem,
  origCandidate: string,
  canonCandidate: string,
  cssVars: ReadonlyMap<string, string>,
): boolean {
  const [cssA, cssB] = ds.candidatesToCss([origCandidate, canonCandidate]);
  if (!cssA || !cssB) return false;

  const parsedA = parseCompiledCss(cssA);
  const parsedB = parseCompiledCss(cssB);

  if (parsedA.properties.size !== parsedB.properties.size) return false;
  for (const [propName, propBodyA] of parsedA.properties) {
    if (parsedB.properties.get(propName) !== propBodyA) return false;
  }

  if (parsedA.nodes.length === 0) return false;
  return compareCssNodeLists(
    parsedA.nodes,
    origCandidate,
    parsedB.nodes,
    canonCandidate,
    cssVars,
  );
}

/**
 * Converts a UTF-16 string index (returned by `@tailwindcss/oxide` Scanner) into
 * 1-based line and column coordinates for accurate diagnostics on multi-byte files.
 *
 * @param content Full source text of the scanned file.
 * @param offset Zero-based UTF-16 string index of the candidate start.
 * @returns One-based line and column coordinates.
 */
export function offsetToLineColumn(
  content: string,
  offset: number,
): { line: number; column: number } {
  const prefix = content.slice(0, offset);
  const lines = prefix.split("\n");
  const lastLine = lines[lines.length - 1] ?? "";
  return {
    line: lines.length,
    column: lastLine.length + 1,
  };
}

function isIncludedSourceFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  const segments = normalized.split("/");
  if (segments.some((seg) => IGNORED_PATH_SEGMENTS.has(seg))) {
    return false;
  }

  const baseName = path.basename(filePath);
  if (
    TEST_FILE_PATTERN.test(baseName) ||
    DECLARATION_FILE_PATTERN.test(baseName)
  ) {
    return false;
  }

  return SOURCE_EXTENSIONS.has(path.extname(baseName));
}

function buildEffectiveCssVariables(
  ds: TailwindDesignSystem,
  cssEntrypoint: string,
): Map<string, string> {
  // Theme defaults act as fallback underneath cascaded :root declarations (e.g. --radius: 0.75rem).
  const merged = new Map<string, string>();
  for (const [name, entry] of ds.theme.entries()) {
    merged.set(name, normalizeWhitespace(entry.value));
  }
  for (const [name, value] of collectRootCssVariables(cssEntrypoint)) {
    merged.set(name, normalizeWhitespace(value));
  }
  return merged;
}

function sortViolations(
  violations: readonly CanonicalViolation[],
): CanonicalViolation[] {
  return [...violations].sort((a, b) => {
    const pathDiff = a.filePath.localeCompare(b.filePath);
    if (pathDiff !== 0) return pathDiff;
    if (a.line !== b.line) return a.line - b.line;
    return a.column - b.column;
  });
}

/**
 * Scans configured UI workspaces and returns verified non-canonical Tailwind v4
 * utility occurrences sorted deterministically by file path and position.
 *
 * @param workspaces Target UI workspace descriptors to scan.
 * @param providedTooling Optional preloaded Tailwind tooling for tests or callers.
 * @returns Deterministically sorted list of verified canonical violations.
 */
export async function checkTailwindCanonical(
  workspaces: readonly WorkspaceTarget[] = UI_WORKSPACES,
  providedTooling?: TailwindTooling,
): Promise<CanonicalViolation[]> {
  const tooling = providedTooling ?? (await loadTailwindTooling());
  const designSystemCache = new Map<string, Promise<TailwindDesignSystem>>();
  const violations: CanonicalViolation[] = [];

  for (const workspace of workspaces) {
    const absCss = path.resolve(REPO_ROOT, workspace.cssEntrypoint);
    const cssSource = readFileSync(absCss, "utf8");
    const baseDir = path.dirname(absCss);
    const cacheKey = `${baseDir}\0${cssSource}`;
    let dsPromise = designSystemCache.get(cacheKey);
    if (!dsPromise) {
      dsPromise = tooling.loadDesignSystem(cssSource, { base: baseDir });
      designSystemCache.set(cacheKey, dsPromise);
    }
    const ds = await dsPromise;
    const cssVars = buildEffectiveCssVariables(ds, absCss);

    const sources = workspace.scanRoots
      .map((root) => path.resolve(REPO_ROOT, root))
      .filter((absRoot) => existsSync(absRoot))
      .map((absRoot) => ({
        base: absRoot,
        pattern: "**/*",
        negated: false,
      }));

    if (sources.length === 0) continue;

    const scanner = tooling.createScanner({ sources });
    scanner.scan();

    const replacementMap = new Map<string, string | null>();
    const checkedFiles = new Set<string>();

    for (const filePath of scanner.files) {
      if (checkedFiles.has(filePath) || !isIncludedSourceFile(filePath)) {
        continue;
      }
      checkedFiles.add(filePath);

      const ext = path.extname(filePath).slice(1);
      const items = scanner.getCandidatesWithPositions({
        file: filePath,
        extension: ext,
      });

      const fileContent = readFileSync(filePath, "utf8");

      for (const item of items) {
        let verifiedCanon = replacementMap.get(item.candidate);
        if (verifiedCanon === undefined) {
          // Canonicalize one candidate at a time because batch calls deduplicate and shift indices.
          const [canon] = ds.canonicalizeCandidates([item.candidate], {
            rem: DEFAULT_REM_PX,
          });
          if (
            canon &&
            canon !== item.candidate &&
            areCandidatesCssEquivalent(ds, item.candidate, canon, cssVars)
          ) {
            verifiedCanon = canon;
          } else {
            verifiedCanon = null;
          }
          replacementMap.set(item.candidate, verifiedCanon);
        }

        if (verifiedCanon !== null) {
          const { line, column } = offsetToLineColumn(
            fileContent,
            item.position,
          );
          violations.push({
            workspace: workspace.name,
            filePath,
            line,
            column,
            original: item.candidate,
            canonical: verifiedCanon,
          });
        }
      }
    }
  }

  return sortViolations(violations);
}

/** Dependencies injectable into `runCheckTailwindCli` for subprocess worker testing. */
export interface CheckTailwindCliOptions {
  readonly workspaces?: readonly WorkspaceTarget[];
  readonly runWorker?: (workspaceName: string) => Promise<CanonicalViolation[]>;
  readonly checkWorkspaces?: (
    workspaces: readonly WorkspaceTarget[],
  ) => Promise<CanonicalViolation[]>;
  readonly writeStdout?: (text: string) => void;
  readonly writeStderr?: (text: string) => void;
}

interface ParsedCliArgs {
  readonly workspaceName: string | null;
  readonly json: boolean;
}

function parseCliArgs(args: readonly string[]): ParsedCliArgs {
  let workspaceName: string | null = null;
  let json = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--workspace") {
      const value = args[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing workspace name after --workspace.");
      }
      workspaceName = value;
      i++;
      continue;
    }
    throw new Error(`Unknown CLI flag: ${arg}`);
  }

  return { workspaceName, json };
}

function isCanonicalViolation(value: unknown): value is CanonicalViolation {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record["workspace"] === "string" &&
    typeof record["filePath"] === "string" &&
    typeof record["line"] === "number" &&
    Number.isFinite(record["line"]) &&
    typeof record["column"] === "number" &&
    Number.isFinite(record["column"]) &&
    typeof record["original"] === "string" &&
    typeof record["canonical"] === "string"
  );
}

/**
 * Parses and validates JSON output emitted by a workspace subprocess worker.
 *
 * @param rawStdout Raw stdout text captured from the worker subprocess.
 * @param workspaceName Workspace identifier used for error attribution.
 * @returns Validated list of `CanonicalViolation` records.
 */
export function parseWorkerViolations(
  rawStdout: string,
  workspaceName: string,
): CanonicalViolation[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawStdout);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Invalid JSON from Tailwind worker for "${workspaceName}": ${detail}`,
    );
  }

  if (!Array.isArray(parsed) || !parsed.every(isCanonicalViolation)) {
    throw new Error(
      `Malformed violation payload from Tailwind worker for "${workspaceName}".`,
    );
  }

  return parsed;
}

async function spawnWorkspaceWorker(
  workspaceName: string,
): Promise<CanonicalViolation[]> {
  // Isolate each Tailwind workspace in its own OS process so @tailwindcss/oxide avoids worker-thread N-API hazards while overlapping first-call canonicalize builds.
  const proc = Bun.spawn(
    [
      process.execPath,
      import.meta.path,
      "--workspace",
      workspaceName,
      "--json",
    ],
    {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    const detail = stderr.trim();
    throw new Error(
      `Tailwind worker for "${workspaceName}" exited with code ${exitCode}${detail.length > 0 ? `: ${detail}` : ""}`,
    );
  }

  return parseWorkerViolations(stdout, workspaceName);
}

/**
 * Executes the CLI checker, fanning out multi-workspace runs across isolated subprocesses
 * and failing closed if any workspace worker crashes or emits invalid output.
 *
 * @param args CLI arguments (typically `process.argv.slice(2)`).
 * @param options Optional overrides for workspaces, worker runner, and output streams.
 * @returns Exit code (`0` when clean or `--json` worker succeeds, `1` on violations or failure).
 */
export async function runCheckTailwindCli(
  args: readonly string[] = [],
  options: CheckTailwindCliOptions = {},
): Promise<number> {
  const workspaces = options.workspaces ?? UI_WORKSPACES;
  const runWorker = options.runWorker ?? spawnWorkspaceWorker;
  const checkWorkspaces = options.checkWorkspaces ?? checkTailwindCanonical;
  const writeStdout =
    options.writeStdout ?? ((text: string) => console.log(text));
  const writeStderr =
    options.writeStderr ?? ((text: string) => console.error(text));

  try {
    const parsed = parseCliArgs(args);

    let violations: CanonicalViolation[];
    if (parsed.workspaceName !== null) {
      const target = workspaces.find((w) => w.name === parsed.workspaceName);
      if (!target) {
        writeStderr(`Unknown workspace "${parsed.workspaceName}".`);
        return 1;
      }
      violations = sortViolations(await checkWorkspaces([target]));
    } else if (workspaces.length > 1) {
      const workerResults = await Promise.all(
        workspaces.map((ws) => runWorker(ws.name)),
      );
      violations = sortViolations(workerResults.flat());
    } else {
      violations = sortViolations(await checkWorkspaces(workspaces));
    }

    if (parsed.json) {
      writeStdout(JSON.stringify(violations));
      return parsed.workspaceName !== null ? 0 : violations.length > 0 ? 1 : 0;
    }

    if (violations.length > 0) {
      writeStderr(
        `Found ${violations.length} non-canonical Tailwind CSS class(es):`,
      );
      for (const v of violations) {
        const relPath = path.relative(REPO_ROOT, v.filePath);
        writeStderr(
          `  ${relPath}:${v.line}:${v.column}  ${v.original} -> ${v.canonical}`,
        );
      }
      return 1;
    }

    const scannedNames =
      parsed.workspaceName !== null
        ? parsed.workspaceName
        : workspaces.map((w) => w.name).join(", ");
    writeStdout(`Tailwind canonical check passed across ${scannedNames}.`);
    return 0;
  } catch (error) {
    writeStderr(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (import.meta.main) {
  const exitCode = await runCheckTailwindCli(process.argv.slice(2));
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}
