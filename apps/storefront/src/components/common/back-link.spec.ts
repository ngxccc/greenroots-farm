import { describe, expect, it } from "bun:test";
import { canNavigateBackInHistory } from "./back-link";

describe("canNavigateBackInHistory", () => {
  it("returns false when history has only the current entry", () => {
    expect(
      canNavigateBackInHistory(
        1,
        "https://greenroots.vn/",
        "https://greenroots.vn",
      ),
    ).toBe(false);
  });

  it("returns true after same-origin SPA navigation with empty referrer", () => {
    expect(canNavigateBackInHistory(2, "", "https://greenroots.vn")).toBe(true);
  });

  it("returns true when referrer matches current origin", () => {
    expect(
      canNavigateBackInHistory(
        2,
        "https://greenroots.vn/products",
        "https://greenroots.vn",
      ),
    ).toBe(true);
  });

  it("returns false for cross-origin referrers such as external payment gateways", () => {
    expect(
      canNavigateBackInHistory(
        2,
        "https://pay.payos.vn/web/123",
        "https://greenroots.vn",
      ),
    ).toBe(false);
  });

  it("returns false for malformed referrer URLs", () => {
    expect(
      canNavigateBackInHistory(2, "not-a-valid-url", "https://greenroots.vn"),
    ).toBe(false);
  });
});
