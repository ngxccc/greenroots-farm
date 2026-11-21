import { describe, expect, test, spyOn } from "bun:test";
import { api, ApiClientError } from "@/lib/api-client";
import {
  createAddress,
  deleteAddress,
  fetchAddresses,
  fetchCurrentUserProfile,
  setDefaultAddress,
  updateAddress,
} from "./user.service";

describe("user.service", () => {
  describe("fetchCurrentUserProfile", () => {
    test("returns user profile projection when authenticated", async () => {
      const mockProfile = {
        id: "usr-01",
        email: "customer@greenroots.farm",
        fullName: "Trần Thị Lan",
        phone: "0912345678",
        role: "customer" as const,
        status: "active" as const,
        rewardPoints: 1250,
        emailVerified: true,
        createdAt: "2026-11-01T00:00:00.000Z",
        updatedAt: "2026-11-01T00:00:00.000Z",
      };

      const spy = spyOn(api, "GET").mockResolvedValueOnce({
        data: { success: true, data: mockProfile },
        error: undefined,
        response: new Response(),
      });

      const profile = await fetchCurrentUserProfile();
      expect(profile).toEqual(mockProfile);
      expect(spy).toHaveBeenCalledWith("/api/v1/users/me");
      spy.mockRestore();
    });

    test("returns null when unauthenticated or request fails", async () => {
      const spy = spyOn(api, "GET").mockResolvedValueOnce({
        data: undefined,
        error: {
          type: "/errors/unauthorized",
          title: "Unauthorized",
          status: 401,
          detail: "Missing or invalid token",
          instance: "/api/v1/users/me",
          timestamp: "2026-11-21T00:00:00.000Z",
        },
        response: new Response(null, { status: 401 }),
      });

      const profile = await fetchCurrentUserProfile();
      expect(profile).toBeNull();
      spy.mockRestore();
    });
  });

  describe("fetchAddresses", () => {
    test("returns saved address array when authenticated", async () => {
      const mockAddresses = [
        {
          id: "addr-01",
          receiverName: "Trần Thị Lan",
          phoneNumber: "0912345678",
          streetAddress: "120 Lê Lợi",
          districtCode: "760",
          district: "Quận 1",
          city: "Thành phố Hồ Chí Minh",
          isDefault: true,
          createdAt: "2026-11-01T00:00:00.000Z",
          updatedAt: "2026-11-01T00:00:00.000Z",
        },
      ];

      const spy = spyOn(api, "GET").mockResolvedValueOnce({
        data: { success: true, data: mockAddresses },
        error: undefined,
        response: new Response(),
      });

      const addresses = await fetchAddresses();
      expect(addresses).toHaveLength(1);
      expect(addresses[0]?.receiverName).toBe("Trần Thị Lan");
      spy.mockRestore();
    });

    test("returns empty array on API error or guest session", async () => {
      const spy = spyOn(api, "GET").mockResolvedValueOnce({
        data: undefined,
        error: {
          type: "/errors/unauthorized",
          title: "Unauthorized",
          status: 401,
          detail: "Missing or invalid token",
          instance: "/api/v1/users/me/addresses",
          timestamp: "2026-11-21T00:00:00.000Z",
        },
        response: new Response(null, { status: 401 }),
      });

      const addresses = await fetchAddresses();
      expect(addresses).toEqual([]);
      spy.mockRestore();
    });
  });

  describe("createAddress", () => {
    test("creates address successfully and returns created entity", async () => {
      const newAddressInput = {
        receiverName: "Nguyễn Văn B",
        phoneNumber: "0987654321",
        streetAddress: "45 Lê Duẩn",
        districtCode: "760",
        isDefault: true,
      };

      const createdOutput = {
        id: "addr-02",
        ...newAddressInput,
        district: "Quận 1",
        city: "Thành phố Hồ Chí Minh",
        isDefault: true,
        createdAt: "2026-11-21T00:00:00.000Z",
        updatedAt: "2026-11-21T00:00:00.000Z",
      };

      const spy = spyOn(api, "POST").mockResolvedValueOnce({
        data: { success: true, data: createdOutput },
        error: undefined,
        response: new Response(null, { status: 201 }),
      });

      const result = await createAddress(newAddressInput);
      expect(result.id).toBe("addr-02");
      expect(result.receiverName).toBe("Nguyễn Văn B");
      spy.mockRestore();
    });

    test("throws ApiClientError when validation or creation fails", async () => {
      const spy = spyOn(api, "POST").mockResolvedValueOnce({
        data: undefined,
        error: {
          type: "/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Validation failed",
          instance: "/api/v1/users/me/addresses",
          timestamp: "2026-11-21T00:00:00.000Z",
        },
        response: new Response(null, { status: 400 }),
      });

      let caughtError: unknown;
      try {
        await createAddress({
          receiverName: "",
          phoneNumber: "",
          streetAddress: "",
          districtCode: "760",
        });
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(ApiClientError);
      spy.mockRestore();
    });
  });

  describe("updateAddress", () => {
    test("updates address fields and returns updated entity", async () => {
      const updatedOutput = {
        id: "addr-01",
        receiverName: "Trần Thị Lan",
        phoneNumber: "0999999999",
        streetAddress: "120 Lê Lợi Mới",
        districtCode: "760",
        district: "Quận 1",
        city: "Thành phố Hồ Chí Minh",
        isDefault: true,
        createdAt: "2026-11-01T00:00:00.000Z",
        updatedAt: "2026-11-21T00:00:00.000Z",
      };

      const spy = spyOn(api, "PATCH").mockResolvedValueOnce({
        data: { success: true, data: updatedOutput },
        error: undefined,
        response: new Response(null, { status: 200 }),
      });

      const result = await updateAddress("addr-01", {
        streetAddress: "120 Lê Lợi Mới",
        phoneNumber: "0999999999",
      });

      expect(result.streetAddress).toBe("120 Lê Lợi Mới");
      spy.mockRestore();
    });
  });

  describe("setDefaultAddress", () => {
    test("sets default address atomically", async () => {
      const defaultOutput = {
        id: "addr-02",
        receiverName: "Nguyễn Văn B",
        phoneNumber: "0987654321",
        streetAddress: "45 Lê Duẩn",
        districtCode: "760",
        district: "Quận 1",
        city: "Thành phố Hồ Chí Minh",
        isDefault: true,
        createdAt: "2026-11-21T00:00:00.000Z",
        updatedAt: "2026-11-21T00:00:00.000Z",
      };

      const spy = spyOn(api, "PATCH").mockResolvedValueOnce({
        data: { success: true, data: defaultOutput },
        error: undefined,
        response: new Response(null, { status: 200 }),
      });

      const result = await setDefaultAddress("addr-02");
      expect(result.isDefault).toBe(true);
      spy.mockRestore();
    });
  });

  describe("deleteAddress", () => {
    test("deletes address successfully without throwing", async () => {
      const spy = spyOn(api, "DELETE").mockResolvedValueOnce({
        data: undefined,
        error: undefined,
        response: new Response(null, { status: 204 }),
      });

      await deleteAddress("addr-01");
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
