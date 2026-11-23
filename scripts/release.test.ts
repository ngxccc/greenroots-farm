import { describe, expect, it } from "bun:test";
import {
  findBlockingReleasePr,
  isBreaking,
  isFeature,
  isMajorZero,
  parseInteractiveChoice,
  suggestBump,
  type MergedPullRequest,
} from "./release";

function pr(overrides: Partial<MergedPullRequest> = {}): MergedPullRequest {
  return {
    number: 1,
    title: "fix(api): guard checkout",
    mergedAt: "2026-01-01T00:00:00Z",
    labels: [],
    ...overrides,
  };
}

describe("release suggestions", () => {
  it("returns null when no pull requests merged", () => {
    expect(suggestBump([])).toBeNull();
  });

  it("suggests a major bump for a breaking change at 1.0.0 or higher", () => {
    const result = suggestBump(
      [pr({ title: "feat(api)!: remove legacy checkout" })],
      "1.0.0",
    );
    expect(result?.level).toBe("major");
  });

  it("caps pre-1.0 breaking changes at minor", () => {
    expect(isMajorZero("0.0.1")).toBe(true);
    expect(isMajorZero("0.4.2-beta.1")).toBe(true);
    expect(isMajorZero("1.0.0")).toBe(false);

    const result = suggestBump(
      [pr({ number: 115, title: "feat(api)!: replace session contract" })],
      "0.0.1",
    );
    expect(result?.level).toBe("minor");
    expect(result?.reason).toContain("pre-1.0 capped to minor");
  });

  it("suggests a minor bump for a feature", () => {
    const result = suggestBump([
      pr({ title: "feat(catalog): add batch expiry filters" }),
    ]);
    expect(result?.level).toBe("minor");
  });

  it("suggests a patch bump for fixes and chores", () => {
    const result = suggestBump([
      pr({ title: "fix(api): reject negative quantities" }),
    ]);
    expect(result?.level).toBe("patch");
  });

  it("detects breaking changes from labels", () => {
    expect(isBreaking(pr({ labels: [{ name: "breaking-change" }] }))).toBe(
      true,
    );
  });

  it("detects features from labels", () => {
    expect(isFeature(pr({ labels: [{ name: "type:feat" }] }))).toBe(true);
  });

  it("parses interactive confirmation and quick level or semver overrides", () => {
    expect(parseInteractiveChoice("", "0.1.0", "0.0.1")).toBeNull();
    expect(parseInteractiveChoice("n", "0.1.0", "0.0.1")).toBeNull();
    expect(parseInteractiveChoice("y", "0.1.0", "0.0.1")).toBe("0.1.0");
    expect(parseInteractiveChoice("p", "0.1.0", "0.0.1")).toBe("0.0.2");
    expect(parseInteractiveChoice("m", "0.0.2", "0.0.1")).toBe("0.1.0");
    expect(parseInteractiveChoice("M", "0.1.0", "0.0.1")).toBe("1.0.0");
    expect(parseInteractiveChoice("0.2.0", "0.1.0", "0.0.1")).toBe("0.2.0");
    expect(() => parseInteractiveChoice("invalid", "0.1.0", "0.0.1")).toThrow();
  });

  it("detects open release pull requests before branching", () => {
    expect(
      findBlockingReleasePr([
        {
          number: 178,
          title: "refactor(storefront): polish",
          headRefName: "chore/ui",
        },
      ]),
    ).toBeUndefined();

    expect(
      findBlockingReleasePr([
        {
          number: 180,
          title: "chore(release): v0.1.0",
          headRefName: "chore/release-v0.1.0",
        },
      ])?.number,
    ).toBe(180);
  });
});
