import { describe, expect, it } from "bun:test";
import { MOCK_PLACES } from "../geocoding.constant";
import { MockGeocodingDriver } from "./mock-geocoding.driver";

describe("MockGeocodingDriver", () => {
  const driver = new MockGeocodingDriver();

  describe("autocomplete", () => {
    it("returns matching HCMC place suggestions case-insensitively and without diacritics", async () => {
      const results = await driver.autocomplete("nguyen van linh");

      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.placeId === "mock_place_quan_7")).toBe(true);
    });

    it("returns empty array when normalized query is shorter than 3 characters", async () => {
      const results = await driver.autocomplete("ab");
      expect(results).toEqual([]);
    });
  });

  describe("resolvePlace", () => {
    it("resolves known mock placeId to deterministic coordinates and district", async () => {
      const expected = MOCK_PLACES.find(
        (p) => p.placeId === "mock_place_quan_7",
      )!;
      const resolved = await driver.resolvePlace("mock_place_quan_7");

      expect(resolved).toEqual(expected);
    });

    it("returns null for an unknown placeId", async () => {
      const resolved = await driver.resolvePlace("unknown_place_id");
      expect(resolved).toBeNull();
    });
  });
});
