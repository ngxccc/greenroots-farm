import { describe, expect, it } from "bun:test";
import { buildProductSearchHref, buildTraceDetailHref } from "./navigation";

describe("Storefront Navigation Helpers", () => {
  describe("buildProductSearchHref", () => {
    it("encodes non-empty search terms and omits query parameter when blank", () => {
      expect(buildProductSearchHref("  cà chua bi  ")).toBe(
        "/products?q=c%C3%A0%20chua%20bi",
      );
      expect(buildProductSearchHref("   ")).toBe("/products");
    });
  });

  describe("buildTraceDetailHref", () => {
    it("normalizes entered batch codes and rejects empty inputs", () => {
      expect(buildTraceDetailHref(" lot-dl-2604-a1 ")).toBe(
        "/trace/LOT-DL-2604-A1",
      );
      expect(buildTraceDetailHref("   ")).toBeNull();
    });
  });
});
