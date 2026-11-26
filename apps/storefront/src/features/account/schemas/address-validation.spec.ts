import { describe, expect, test } from "bun:test";
import {
  addressIdSchema,
  buildUpdateAddressDiff,
  createAddressFormSchema,
  normalizeAddressText,
  normalizeRequiredPhone,
  updateAddressPatchSchema,
} from "./address-validation";

describe("Storefront Address Validation", () => {
  describe("normalizeAddressText", () => {
    test("collapses repeated spaces and trims leading/trailing whitespace", () => {
      expect(normalizeAddressText("  142   Lê  Đức Thọ,  P.15  ")).toBe(
        "142 Lê Đức Thọ, P.15",
      );
    });
  });

  describe("normalizeRequiredPhone", () => {
    test("strips spaces inside formatted Vietnamese mobile numbers", () => {
      expect(normalizeRequiredPhone(" 0908 412 679 ")).toBe("0908412679");
    });
  });

  describe("createAddressFormSchema", () => {
    // Invariant: INV-SF-ADDR-2
    test("accepts valid placeId and normalizes receiver and street text", () => {
      const result = createAddressFormSchema.safeParse({
        receiverName: "  Nguyễn   Minh Anh ",
        phoneNumber: "0908 412 679",
        placeId: "mock_place_go_vap",
        streetAddress: "  142   Lê Đức Thọ, Phường 15 ",
        isDefault: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({
          receiverName: "Nguyễn Minh Anh",
          phoneNumber: "0908412679",
          placeId: "mock_place_go_vap",
          streetAddress: "142 Lê Đức Thọ, Phường 15",
          isDefault: true,
        });
      }
    });

    // Invariant: INV-ADDR-1, INV-SF-ADDR-2
    test("rejects blank placeId and client coordinate injection", () => {
      const blankPlace = createAddressFormSchema.safeParse({
        receiverName: "Minh Anh",
        phoneNumber: "0908412679",
        placeId: "   ",
        streetAddress: "142 Lê Đức Thọ",
      });
      expect(blankPlace.success).toBe(false);

      const injectedCoords = createAddressFormSchema.safeParse({
        receiverName: "Minh Anh",
        phoneNumber: "0908412679",
        placeId: "mock_place_quan_1",
        streetAddress: "142 Lê Lợi",
        latitude: 10.77,
      });
      expect(injectedCoords.success).toBe(false);
    });

    test("rejects non-Vietnamese phone prefixes and invalid lengths", () => {
      const result = createAddressFormSchema.safeParse({
        receiverName: "Minh Anh",
        phoneNumber: "0123456789",
        placeId: "mock_place_quan_1",
        streetAddress: "142 Lê Lợi",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("updateAddressPatchSchema", () => {
    // Invariant: INV-SF-ADDR-5
    test("rejects isDefault and empty patch objects", () => {
      const withDefault = updateAddressPatchSchema.safeParse({
        streetAddress: "142 Lê Lợi",
        isDefault: true,
      });
      expect(withDefault.success).toBe(false);

      const emptyPatch = updateAddressPatchSchema.safeParse({});
      expect(emptyPatch.success).toBe(false);
    });
  });

  describe("buildUpdateAddressDiff", () => {
    const baseline = {
      receiverName: "Nguyễn Minh Anh",
      phoneNumber: "0908412679",
      placeId: "mock_place_go_vap",
      streetAddress: "142 Lê Đức Thọ, P.15",
    };

    test("returns null patch when edited values normalize identically to baseline", () => {
      const result = buildUpdateAddressDiff(baseline, {
        receiverName: "  Nguyễn   Minh Anh ",
        phoneNumber: "0908 412 679",
        placeId: "mock_place_go_vap",
        streetAddress: " 142   Lê Đức Thọ, P.15 ",
      });

      expect(result).toEqual({ ok: true, patch: null });
    });

    // Invariant: INV-SF-ADDR-5
    test("returns only modified fields without including isDefault", () => {
      const result = buildUpdateAddressDiff(baseline, {
        receiverName: "Nguyễn Minh Anh",
        phoneNumber: "0909 000 005",
        placeId: "mock_place_quan_1",
        streetAddress: "142 Lê Đức Thọ, P.15",
      });

      expect(result).toEqual({
        ok: true,
        patch: {
          phoneNumber: "0909000005",
          placeId: "mock_place_quan_1",
        },
      });
    });
  });

  describe("addressIdSchema", () => {
    test("accepts UUIDv7 identifiers and rejects UUIDv4 strings", () => {
      expect(
        addressIdSchema.safeParse("0195a8f0-0001-7000-8000-000000000001")
          .success,
      ).toBe(true);
      expect(
        addressIdSchema.safeParse("550e8400-e29b-41d4-a716-446655440000")
          .success,
      ).toBe(false);
    });
  });
});
