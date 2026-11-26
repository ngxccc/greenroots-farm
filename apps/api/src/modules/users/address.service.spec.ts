import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { API_ERROR_CODES, BUSINESS_RULES } from "@greenroots/shared";
import { MESSAGES } from "@/common/constants/messages.constant";
import { MOCK_PLACES } from "@/modules/geocoding/geocoding.constant";
import type { GeocodingService } from "@/modules/geocoding/geocoding.service";
import { createMockDb } from "../../../test/mocks/mock-database";
import { ADDRESS_COLUMNS, AddressService } from "./address.service";
import { createAddressSchema, updateAddressSchema } from "./dto";

type MockDb = ReturnType<typeof createMockDb> & {
  mockInsertValues: ReturnType<typeof mock>;
  mockUpdateSet: ReturnType<typeof mock>;
  setSelectResult: (result: unknown[]) => void;
  setSelectResultsQueue: (results: unknown[][]) => void;
};

describe("AddressService", () => {
  let service: AddressService;
  let mockDb: MockDb;
  let resolvePlaceMock: ReturnType<typeof mock>;

  const userId = "019fa8bc-8f4d-7000-b366-e691f45cfb91";
  const addressId = "019fa8bc-8f4d-7000-b366-e691f45cfb92";
  const timestamp = new Date("2026-11-19T00:00:00.000Z");

  const quan7Place = MOCK_PLACES.find(
    (p) => p.placeId === "mock_place_quan_7",
  )!;
  const thuDucPlace = MOCK_PLACES.find(
    (p) => p.placeId === "mock_place_thu_duc",
  )!;

  const sampleAddressRow = {
    id: addressId,
    receiverName: "Nguyen Van An",
    phoneNumber: "0912345678",
    streetAddress: "12 Nguyen Van Linh",
    placeId: quan7Place.placeId,
    ward: quan7Place.ward,
    city: BUSINESS_RULES.DEFAULT_DELIVERY_CITY,
    isDefault: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  beforeEach(() => {
    mockDb = createMockDb() as unknown as MockDb;
    resolvePlaceMock = mock((placeId: string) => {
      const found = MOCK_PLACES.find((p) => p.placeId === placeId);
      if (!found) {
        return Promise.reject(
          new UnprocessableEntityException({
            code: API_ERROR_CODES.PLACE_ID_INVALID,
            detail: MESSAGES.GEOCODING.PLACE_ID_INVALID,
          }),
        );
      }
      return Promise.resolve(found);
    });
    const mockGeocodingService = {
      resolvePlace: resolvePlaceMock,
    } as unknown as GeocodingService;
    service = new AddressService(mockDb, mockGeocodingService);
  });

  describe("ADDRESS_COLUMNS", () => {
    it("contains only the closed address projection keys", () => {
      expect(Object.keys(ADDRESS_COLUMNS)).toEqual([
        "id",
        "receiverName",
        "phoneNumber",
        "streetAddress",
        "placeId",
        "ward",
        "city",
        "isDefault",
        "createdAt",
        "updatedAt",
      ]);
    });

    // Invariant: INV-SHIP-2
    it("excludes userId and internal coordinate cache columns", () => {
      const keys = Object.keys(ADDRESS_COLUMNS);
      expect(keys).not.toContain("userId");
      expect(keys).not.toContain("latitude");
      expect(keys).not.toContain("longitude");
    });
  });

  describe("createAddress", () => {
    // Invariant: INV-GEO-1
    it("fails closed before opening a database transaction when placeId resolution fails", async () => {
      resolvePlaceMock.mockRejectedValueOnce(
        new ServiceUnavailableException({
          code: API_ERROR_CODES.GEOCODING_UNAVAILABLE,
          detail: MESSAGES.GEOCODING.UNAVAILABLE,
        }),
      );

      try {
        await service.createAddress(userId, {
          receiverName: "Nguyen Van An",
          phoneNumber: "0912345678",
          streetAddress: "12 Nguyen Van Linh",
          placeId: quan7Place.placeId,
        });
        expect.unreachable("Expected ServiceUnavailableException");
      } catch (error) {
        expect(error).toBeInstanceOf(ServiceUnavailableException);
        expect((error as ServiceUnavailableException).getResponse()).toEqual({
          code: API_ERROR_CODES.GEOCODING_UNAVAILABLE,
          detail: MESSAGES.GEOCODING.UNAVAILABLE,
        });
      }
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it("throws UnauthorizedException when the subject is missing or soft-deleted", async () => {
      mockDb.setSelectResultsQueue([[]]);

      try {
        await service.createAddress(userId, {
          receiverName: "Nguyen Van An",
          phoneNumber: "0912345678",
          streetAddress: "12 Nguyen Van Linh",
          placeId: quan7Place.placeId,
        });
        expect.unreachable("Expected UnauthorizedException");
      } catch (error) {
        expect(error).toBeInstanceOf(UnauthorizedException);
        expect((error as UnauthorizedException).getResponse()).toEqual({
          code: API_ERROR_CODES.AUTH_TOKEN_INVALID_OR_EXPIRED,
          detail: MESSAGES.AUTH.TOKEN_INVALID_OR_EXPIRED,
        });
      }
    });

    it("rejects creating an eleventh address when the account already has ten", async () => {
      const existingTen = Array.from(
        { length: BUSINESS_RULES.MAX_USER_ADDRESSES },
        (_, idx) => ({ id: `id-${idx}` }),
      );
      mockDb.setSelectResultsQueue([[{ id: userId }], existingTen]);

      try {
        await service.createAddress(userId, {
          receiverName: "Nguyen Van An",
          phoneNumber: "0912345678",
          streetAddress: "12 Nguyen Van Linh",
          placeId: quan7Place.placeId,
        });
        expect.unreachable("Expected UnprocessableEntityException");
      } catch (error) {
        expect(error).toBeInstanceOf(UnprocessableEntityException);
        expect((error as UnprocessableEntityException).getResponse()).toEqual({
          code: API_ERROR_CODES.ADDRESS_LIMIT_REACHED,
          detail: MESSAGES.ADDRESS.LIMIT_REACHED,
        });
      }
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    // Invariant: INV-ADDR-1, INV-GEO-1
    it("resolves district, fixed city, and server-side coordinates on insert", async () => {
      mockDb.setSelectResultsQueue([[{ id: userId }], [], [sampleAddressRow]]);

      const result = await service.createAddress(userId, {
        receiverName: "Nguyen Van An",
        phoneNumber: "0912345678",
        streetAddress: "12 Nguyen Van Linh",
        placeId: quan7Place.placeId,
        isDefault: false,
      });

      expect(mockDb.mockInsertValues).toHaveBeenCalledWith({
        userId,
        receiverName: "Nguyen Van An",
        phoneNumber: "0912345678",
        streetAddress: "12 Nguyen Van Linh",
        placeId: quan7Place.placeId,
        ward: quan7Place.ward,
        city: BUSINESS_RULES.DEFAULT_DELIVERY_CITY,
        latitude: quan7Place.latitude.toFixed(8),
        longitude: quan7Place.longitude.toFixed(8),
        isDefault: true,
      });
      expect(result).toEqual({
        ...sampleAddressRow,
        createdAt: timestamp.toISOString(),
        updatedAt: timestamp.toISOString(),
      });
    });
  });

  describe("updateAddress", () => {
    it("throws NotFoundException when the target address is missing or foreign", async () => {
      mockDb.setSelectResultsQueue([[{ id: userId }], []]);

      try {
        await service.updateAddress(userId, addressId, {
          receiverName: "Tran Thi Binh",
        });
        expect.unreachable("Expected NotFoundException");
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);
        expect((error as NotFoundException).getResponse()).toEqual({
          code: API_ERROR_CODES.ADDRESS_NOT_FOUND,
          detail: MESSAGES.ADDRESS.NOT_FOUND,
        });
      }
    });

    it("recomputes district, city, and coordinates when placeId changes", async () => {
      const updatedRow = {
        ...sampleAddressRow,
        placeId: thuDucPlace.placeId,
        ward: thuDucPlace.ward,
      };
      mockDb.setSelectResultsQueue([[{ id: userId }], [updatedRow]]);

      const result = await service.updateAddress(userId, addressId, {
        placeId: thuDucPlace.placeId,
      });

      expect(mockDb.mockUpdateSet).toHaveBeenCalledWith({
        placeId: thuDucPlace.placeId,
        ward: thuDucPlace.ward,
        city: BUSINESS_RULES.DEFAULT_DELIVERY_CITY,
        latitude: thuDucPlace.latitude.toFixed(8),
        longitude: thuDucPlace.longitude.toFixed(8),
      });
      expect(result.placeId).toBe(thuDucPlace.placeId);
      expect(result.ward).toBe(thuDucPlace.ward);
    });
  });

  describe("setDefaultAddress", () => {
    it("returns the address unchanged without rewriting rows when already default", async () => {
      mockDb.setSelectResultsQueue([[{ id: userId }], [sampleAddressRow]]);

      const result = await service.setDefaultAddress(userId, addressId);

      expect(mockDb.update).not.toHaveBeenCalled();
      expect(result.id).toBe(addressId);
      expect(result.isDefault).toBe(true);
    });
  });

  describe("resolveAddressForQuote", () => {
    it("returns persisted coordinates and recipient contact details", async () => {
      mockDb.setSelectResultsQueue([
        [{ id: userId }],
        [
          {
            ...sampleAddressRow,
            latitude: quan7Place.latitude.toFixed(8),
            longitude: quan7Place.longitude.toFixed(8),
          },
        ],
      ]);

      const resolved = await service.resolveAddressForQuote(userId, addressId);

      expect(resolved).toEqual({
        id: addressId,
        receiverName: sampleAddressRow.receiverName,
        phoneNumber: sampleAddressRow.phoneNumber,
        formattedAddress: `12 Nguyen Van Linh, ${quan7Place.ward}, ${BUSINESS_RULES.DEFAULT_DELIVERY_CITY}`,
        placeId: quan7Place.placeId,
        ward: quan7Place.ward,
        city: BUSINESS_RULES.DEFAULT_DELIVERY_CITY,
        latitude: quan7Place.latitude,
        longitude: quan7Place.longitude,
      });
    });

    it("returns null from resolveOptionalDefaultAddressForQuote when customer has no saved addresses", async () => {
      mockDb.setSelectResultsQueue([[{ id: userId }], []]);

      const resolved =
        await service.resolveOptionalDefaultAddressForQuote(userId);

      expect(resolved).toBeNull();
    });
  });

  describe("address DTO schemas", () => {
    // Invariant: INV-ADDR-1
    it("rejects latitude, longitude, city, and unknown fields on create", () => {
      const base = {
        receiverName: "Nguyen Van An",
        phoneNumber: "0912345678",
        streetAddress: "12 Nguyen Van Linh",
        placeId: "mock_place_quan_7",
      };

      expect(
        createAddressSchema.safeParse({ ...base, latitude: 10.7 }).success,
      ).toBe(false);
      expect(
        createAddressSchema.safeParse({ ...base, longitude: 106.7 }).success,
      ).toBe(false);
      expect(
        createAddressSchema.safeParse({ ...base, city: "TP. Hồ Chí Minh" })
          .success,
      ).toBe(false);
      expect(
        createAddressSchema.safeParse({ ...base, districtCode: "quan-7" })
          .success,
      ).toBe(false);
      expect(
        createAddressSchema.safeParse({ ...base, extra: "nope" }).success,
      ).toBe(false);
    });

    it("strips HTML and collapses whitespace in receiverName and streetAddress", () => {
      const parsed = createAddressSchema.parse({
        receiverName: "  <b>Nguyen</b>   Van   An ",
        phoneNumber: "0912345678",
        streetAddress: " 12   <i>Nguyen Van Linh</i> ",
        placeId: "  mock_place_quan_7  ",
      });

      expect(parsed.receiverName).toBe("Nguyen Van An");
      expect(parsed.streetAddress).toBe("12 Nguyen Van Linh");
      expect(parsed.placeId).toBe("mock_place_quan_7");
    });

    it("rejects empty objects and isDefault on update", () => {
      expect(updateAddressSchema.safeParse({}).success).toBe(false);
      expect(updateAddressSchema.safeParse({ isDefault: false }).success).toBe(
        false,
      );
      expect(updateAddressSchema.safeParse({ isDefault: true }).success).toBe(
        false,
      );
      expect(updateAddressSchema.safeParse({ placeId: "   " }).success).toBe(
        false,
      );
    });
  });
});
