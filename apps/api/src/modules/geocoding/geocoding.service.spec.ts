import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { API_ERROR_CODES } from "@greenroots/shared";
import { MESSAGES } from "@/common/constants/messages.constant";
import type { RedisService } from "@/common/services/redis.service";
import type { GeocodingDriver } from "./geocoding.interface";
import { GeocodingService } from "./geocoding.service";

describe("GeocodingService", () => {
  let redisGetMock: ReturnType<typeof mock>;
  let redisSetMock: ReturnType<typeof mock>;
  let driverAutocompleteMock: ReturnType<typeof mock>;
  let driverResolvePlaceMock: ReturnType<typeof mock>;
  let service: GeocodingService;

  beforeEach(() => {
    redisGetMock = mock(() => Promise.resolve(null));
    redisSetMock = mock(() => Promise.resolve("OK"));
    driverAutocompleteMock = mock(() =>
      Promise.resolve([
        {
          placeId: "mock_place_quan_1",
          description: "15 Lê Lợi, Quận 1",
          district: "Quận 1",
        },
      ]),
    );
    driverResolvePlaceMock = mock(() =>
      Promise.resolve({
        placeId: "mock_place_quan_1",
        latitude: 10.7769,
        longitude: 106.7009,
        district: "Quận 1",
        formattedAddress: "15 Lê Lợi, Quận 1",
      }),
    );

    const mockRedis = {
      getClient: () => ({
        get: redisGetMock,
        set: redisSetMock,
      }),
    } as unknown as RedisService;

    const mockDriver: GeocodingDriver = {
      autocomplete: driverAutocompleteMock,
      resolvePlace: driverResolvePlaceMock,
    };

    service = new GeocodingService(mockRedis, mockDriver);
  });

  describe("autocomplete", () => {
    it("returns cached suggestions without calling driver on Redis hit", async () => {
      const cached = [
        {
          placeId: "cached_1",
          description: "Cached Street",
          district: "Quận 1",
        },
      ];
      redisGetMock.mockResolvedValueOnce(JSON.stringify(cached));

      const result = await service.autocomplete("  Le Loi  ");
      expect(result).toEqual(cached);
      expect(driverAutocompleteMock).not.toHaveBeenCalled();
    });

    it("caches driver suggestions with 24h TTL on miss", async () => {
      const result = await service.autocomplete("Le Loi");

      expect(result).toHaveLength(1);
      expect(driverAutocompleteMock).toHaveBeenCalledWith("Le Loi");
      expect(redisSetMock).toHaveBeenCalledWith(
        "geo:ac:le loi",
        JSON.stringify(result),
        "EX",
        86400,
      );
    });

    it("throws ServiceUnavailableException when driver fails on cache miss", async () => {
      driverAutocompleteMock.mockRejectedValueOnce(new Error("timeout"));

      try {
        await service.autocomplete("Le Loi");
        expect.unreachable("Expected ServiceUnavailableException");
      } catch (error) {
        expect(error).toBeInstanceOf(ServiceUnavailableException);
        expect((error as ServiceUnavailableException).getResponse()).toEqual({
          code: API_ERROR_CODES.GEOCODING_UNAVAILABLE,
          detail: MESSAGES.GEOCODING.UNAVAILABLE,
        });
      }
    });
  });

  describe("resolvePlace", () => {
    // Invariant: INV-GEO-1
    it("fails closed with ServiceUnavailableException when uncached resolution fails", async () => {
      driverResolvePlaceMock.mockRejectedValueOnce(new Error("HTTP 503"));

      try {
        await service.resolvePlace("mock_place_quan_1");
        expect.unreachable("Expected ServiceUnavailableException");
      } catch (error) {
        expect(error).toBeInstanceOf(ServiceUnavailableException);
        expect((error as ServiceUnavailableException).getResponse()).toEqual({
          code: API_ERROR_CODES.GEOCODING_UNAVAILABLE,
          detail: MESSAGES.GEOCODING.UNAVAILABLE,
        });
      }
    });

    it("throws UnprocessableEntityException when driver returns null", async () => {
      driverResolvePlaceMock.mockResolvedValueOnce(null);

      try {
        await service.resolvePlace("invalid_place");
        expect.unreachable("Expected UnprocessableEntityException");
      } catch (error) {
        expect(error).toBeInstanceOf(UnprocessableEntityException);
        expect((error as UnprocessableEntityException).getResponse()).toEqual({
          code: API_ERROR_CODES.PLACE_ID_INVALID,
          detail: MESSAGES.GEOCODING.PLACE_ID_INVALID,
        });
      }
    });

    it("caches resolved place with 14d TTL on miss", async () => {
      const resolved = await service.resolvePlace("mock_place_quan_1");

      expect(resolved.latitude).toBe(10.7769);
      expect(redisSetMock).toHaveBeenCalledWith(
        "geo:place:mock_place_quan_1",
        JSON.stringify(resolved),
        "EX",
        14 * 86400,
      );
    });
  });
});
