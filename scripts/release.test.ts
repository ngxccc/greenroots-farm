import { describe, expect, it } from "bun:test";
import {
  isBreaking,
  isFeature,
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

  it("suggests a major bump for a breaking change", () => {
    const result = suggestBump([
      pr({ title: "feat(api)!: remove legacy checkout" }),
    ]);
    expect(result?.level).toBe("major");
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
});
