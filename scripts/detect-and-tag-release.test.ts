import { describe, expect, it } from "bun:test";
import { parseReleaseTag } from "./detect-and-tag-release";

describe("release tag detection", () => {
  it("parses a plain release commit", () => {
    expect(parseReleaseTag("chore(release): v0.1.0")).toBe("v0.1.0");
  });

  it("parses a release commit without the v prefix", () => {
    expect(parseReleaseTag("chore(release): 0.1.0")).toBe("v0.1.0");
  });

  it("parses a squash-merged release commit", () => {
    expect(parseReleaseTag("chore(release): v0.1.0 (#42)")).toBe("v0.1.0");
  });

  it("ignores non-release commits", () => {
    expect(parseReleaseTag("feat(api): add checkout")).toBeNull();
    expect(parseReleaseTag("fix(api): guard checkout")).toBeNull();
  });

  it("does not match a release mention inside a body line", () => {
    expect(
      parseReleaseTag("see chore(release): v0.1.0 for details"),
    ).toBeNull();
  });
});
