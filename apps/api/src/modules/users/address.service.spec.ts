import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  API_ERROR_CODES,
  BUSINESS_RULES,
  HCMC_DISTRICTS,
} from "@greenroots/shared";
import { MESSAGES } from "@/common/constants/messages.constant";
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

  const userId = "019fa8bc-8f4d-7000-b366-e691f45cfb91";
  const addressId = "019fa8bc-8f4d-7000-b366-e691f45cfb92";
  const timestamp = new Date("2026-11-19T00:00:00.000Z");

  const sampleAddressRow = {
    id: addressId,
    receiverName: "Nguyen Van An",
    phoneNumber: "0912345678",
    streetAddress: "12 Nguyen Van Linh",
    districtCode: "quan-7",
    district: "Quận 7",
    city: BUSINESS_RULES.DEFAULT_DELIVERY_CITY,
    isDefault: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  beforeEach(() => {
    mockDb = createMockDb() as unknown as MockDb;
    service = new AddressService(mockDb);
  });

  describe("ADDRESS_COLUMNS", () => {
    it("contains only the closed address projection keys", () => {
      expect(Object.keys(ADDRESS_COLUMNS)).toEqual([
        "id",
        "receiverName",
        "phoneNumber",
        "streetAddress",
        "districtCode",
        "district",
        "city",
        "isDefault",
        "createdAt",
        "updatedAt",
      ]);
    });

    it("excludes userId and internal coordinate cache columns", () => {
      const keys = Object.keys(ADDRESS_COLUMNS);
      expect(keys).not.toContain("userId");
      expect(keys).not.toContain("latitude");
      expect(keys).not.toContain("longitude");
    });
  });

  describe("createAddress", () => {
    it("rejects unknown district codes before opening a database transaction", async () => {
      try {
        await service.createAddress(userId, {
          receiverName: "Nguyen Van An",
          phoneNumber: "0912345678",
          streetAddress: "12 Nguyen Van Linh",
          districtCode: "quan-99",
        });
        expect.unreachable("Expected UnprocessableEntityException");
      } catch (error) {
        expect(error).toBeInstanceOf(UnprocessableEntityException);
        expect((error as UnprocessableEntityException).getResponse()).toEqual({
          code: API_ERROR_CODES.DISTRICT_CODE_INVALID,
          detail: MESSAGES.ADDRESS.DISTRICT_CODE_INVALID,
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
          districtCode: "quan-7",
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
          districtCode: "quan-7",
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

    it("derives district name, fixed city, and centroid coordinates on insert", async () => {
      const quan7 = HCMC_DISTRICTS.find((d) => d.code === "quan-7")!;
      mockDb.setSelectResultsQueue([[{ id: userId }], [], [sampleAddressRow]]);

      const result = await service.createAddress(userId, {
        receiverName: "Nguyen Van An",
        phoneNumber: "0912345678",
        streetAddress: "12 Nguyen Van Linh",
        districtCode: "quan-7",
        isDefault: false,
      });

      expect(mockDb.mockInsertValues).toHaveBeenCalledWith({
        userId,
        receiverName: "Nguyen Van An",
        phoneNumber: "0912345678",
        streetAddress: "12 Nguyen Van Linh",
        districtCode: quan7.code,
        district: quan7.name,
        city: BUSINESS_RULES.DEFAULT_DELIVERY_CITY,
        latitude: quan7.latitude.toFixed(8),
        longitude: quan7.longitude.toFixed(8),
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

    it("recomputes district, city, and centroid coordinates when districtCode changes", async () => {
      const thuDuc = HCMC_DISTRICTS.find((d) => d.code === "thu-duc")!;
      const updatedRow = {
        ...sampleAddressRow,
        districtCode: thuDuc.code,
        district: thuDuc.name,
      };
      mockDb.setSelectResultsQueue([[{ id: userId }], [updatedRow]]);

      const result = await service.updateAddress(userId, addressId, {
        districtCode: thuDuc.code,
      });

      expect(mockDb.mockUpdateSet).toHaveBeenCalledWith({
        districtCode: thuDuc.code,
        district: thuDuc.name,
        city: BUSINESS_RULES.DEFAULT_DELIVERY_CITY,
        latitude: thuDuc.latitude.toFixed(8),
        longitude: thuDuc.longitude.toFixed(8),
      });
      expect(result.districtCode).toBe(thuDuc.code);
      expect(result.district).toBe(thuDuc.name);
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
    it("returns centroid coordinates from HCMC_DISTRICTS and recipient contact details", async () => {
      const quan7 = HCMC_DISTRICTS.find((d) => d.code === "quan-7")!;
      mockDb.setSelectResultsQueue([[{ id: userId }], [sampleAddressRow]]);

      const resolved = await service.resolveAddressForQuote(userId, addressId);

      expect(resolved).toEqual({
        id: addressId,
        receiverName: sampleAddressRow.receiverName,
        phoneNumber: sampleAddressRow.phoneNumber,
        formattedAddress: `12 Nguyen Van Linh, ${quan7.name}, ${BUSINESS_RULES.DEFAULT_DELIVERY_CITY}`,
        districtCode: quan7.code,
        district: quan7.name,
        city: BUSINESS_RULES.DEFAULT_DELIVERY_CITY,
        latitude: quan7.latitude,
        longitude: quan7.longitude,
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
    it("rejects latitude, longitude, city, and unknown fields on create", () => {
      const base = {
        receiverName: "Nguyen Van An",
        phoneNumber: "0912345678",
        streetAddress: "12 Nguyen Van Linh",
        districtCode: "quan-7",
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
        createAddressSchema.safeParse({ ...base, extra: "nope" }).success,
      ).toBe(false);
    });

    it("strips HTML and collapses whitespace in receiverName and streetAddress", () => {
      const parsed = createAddressSchema.parse({
        receiverName: "  <b>Nguyen</b>   Van   An ",
        phoneNumber: "0912345678",
        streetAddress: " 12   <i>Nguyen Van Linh</i> ",
        districtCode: "  quan-7  ",
      });

      expect(parsed.receiverName).toBe("Nguyen Van An");
      expect(parsed.streetAddress).toBe("12 Nguyen Van Linh");
      expect(parsed.districtCode).toBe("quan-7");
    });

    it("rejects empty objects and isDefault on update", () => {
      expect(updateAddressSchema.safeParse({}).success).toBe(false);
      expect(updateAddressSchema.safeParse({ isDefault: false }).success).toBe(
        false,
      );
      expect(updateAddressSchema.safeParse({ isDefault: true }).success).toBe(
        false,
      );
      expect(
        updateAddressSchema.safeParse({ districtCode: "   " }).success,
      ).toBe(false);
    });
  });
});
