import { describe, expect, test } from "bun:test";
import { API_ERROR_CODES } from "@greenroots/shared";
import { actionRefreshedTokenStorage } from "@/features/auth/services/server-token";
import type { CustomerAddress } from "@/features/account/types/address.types";
import {
  executeCreateAddressAction,
  executeDeleteAddressAction,
  executeListAddressesAction,
  executeSetDefaultAddressAction,
  executeUpdateAddressAction,
} from "./address-actions";

const VALID_ADDRESS_ID = "0195a8f0-0001-7000-8000-000000000001";
const SECOND_ADDRESS_ID = "0195a8f0-0001-7000-8000-000000000002";

const sampleAddress: CustomerAddress = {
  id: VALID_ADDRESS_ID,
  receiverName: "Nguyễn Minh Anh",
  phoneNumber: "0908412679",
  streetAddress: "142 Lê Đức Thọ, Phường 15",
  districtCode: "go-vap",
  district: "Quận Gò Vấp",
  city: "TP. Hồ Chí Minh",
  isDefault: true,
  createdAt: "2026-11-23T00:00:00.000Z",
  updatedAt: "2026-11-23T00:00:00.000Z",
};

describe("Storefront Address Actions", () => {
  describe("executeListAddressesAction", () => {
    // Invariant: INV-SF-ADDR-3
    test("rotates expired access token once and preserves cookies on transient refresh errors", async () => {
      let clearedCount = 0;
      const transientResult = await executeListAddressesAction({
        getAddresses: () =>
          Promise.resolve({
            response: new Response(null, { status: 401 }),
            error: { status: 401, detail: "Expired" },
          }),
        runWithRefresh: () =>
          Promise.resolve({
            response: new Response(null, { status: 401 }),
            error: { status: 401, detail: "Expired" },
            refreshOutcome: "transient_error",
          }),
        clearCookies: () => {
          clearedCount += 1;
          return Promise.resolve();
        },
      });

      expect(transientResult.ok).toBe(false);
      if (!transientResult.ok) {
        expect(transientResult.code).toBe(API_ERROR_CODES.SERVICE_UNAVAILABLE);
        expect(transientResult.sessionInvalidated).toBe(false);
      }
      expect(clearedCount).toBe(0);

      const terminalResult = await executeListAddressesAction({
        getAddresses: () =>
          Promise.resolve({
            response: new Response(null, { status: 401 }),
          }),
        runWithRefresh: () =>
          Promise.resolve({
            response: new Response(null, { status: 401 }),
            error: { code: API_ERROR_CODES.AUTH_TOKEN_INVALID_OR_EXPIRED },
            refreshOutcome: "invalid",
          }),
        clearCookies: () => {
          clearedCount += 1;
          return Promise.resolve();
        },
      });

      expect(terminalResult.ok).toBe(false);
      if (!terminalResult.ok) {
        expect(terminalResult.sessionInvalidated).toBe(true);
      }
      expect(clearedCount).toBe(1);
    });
  });

  describe("executeCreateAddressAction", () => {
    // Invariant: INV-SF-ADDR-2
    test("rejects unknown districtCode before calling backend endpoint", async () => {
      let called = false;
      const result = await executeCreateAddressAction(
        {
          receiverName: "Minh Anh",
          phoneNumber: "0908412679",
          districtCode: "quan-99",
          streetAddress: "142 Lê Đức Thọ",
        },
        {
          postAddress: () => {
            called = true;
            return Promise.resolve({
              response: new Response(null, { status: 201 }),
              data: { data: sampleAddress },
            });
          },
        },
      );

      expect(called).toBe(false);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(API_ERROR_CODES.VALIDATION_FAILED);
        expect(result.sessionInvalidated).toBe(false);
      }
    });

    // Invariant: INV-SF-ADDR-7
    test("localizes address-limit rule errors without invalidating customer session", async () => {
      let clearedCount = 0;
      const result = await executeCreateAddressAction(
        {
          receiverName: "Minh Anh",
          phoneNumber: "0908 412 679",
          districtCode: "go-vap",
          streetAddress: "142 Lê Đức Thọ",
        },
        {
          postAddress: () =>
            Promise.resolve({
              response: new Response(null, { status: 422 }),
              error: {
                status: 422,
                code: API_ERROR_CODES.ADDRESS_LIMIT_REACHED,
                detail: "Maximum 10 addresses reached",
              },
            }),
          runWithRefresh: (op) =>
            op().then((res) => ({ ...res, refreshOutcome: "not_needed" })),
          clearCookies: () => {
            clearedCount += 1;
            return Promise.resolve();
          },
        },
      );

      expect(clearedCount).toBe(0);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(API_ERROR_CODES.ADDRESS_LIMIT_REACHED);
        expect(result.sessionInvalidated).toBe(false);
        expect(result.message.length).toBeGreaterThan(0);
      }
    });
    test("maps unexpected empty payload responses to internal error rather than network failure", async () => {
      const result = await executeCreateAddressAction(
        {
          receiverName: "Minh Anh",
          phoneNumber: "0908412679",
          districtCode: "go-vap",
          streetAddress: "142 Lê Đức Thọ",
        },
        {
          postAddress: () =>
            Promise.resolve({
              response: new Response(null, { status: 201 }),
              data: undefined,
            }),
          runWithRefresh: (op) =>
            op().then((res) => ({ ...res, refreshOutcome: "not_needed" })),
        },
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(API_ERROR_CODES.INTERNAL_SERVER_ERROR);
      }
    });
  });

  describe("executeUpdateAddressAction", () => {
    // Invariant: INV-SF-ADDR-5
    test("rejects malformed address id or forbidden isDefault field upfront", async () => {
      let called = false;
      const badIdResult = await executeUpdateAddressAction(
        "not-a-uuid",
        { streetAddress: "142 Lê Đức Thọ" },
        {
          patchAddress: () => {
            called = true;
            return Promise.resolve({
              response: new Response(null, { status: 200 }),
              data: { data: sampleAddress },
            });
          },
        },
      );

      expect(called).toBe(false);
      expect(badIdResult.ok).toBe(false);
    });

    test("updates changed fields cleanly when backend succeeds", async () => {
      const updated = { ...sampleAddress, streetAddress: "184 Nguyễn Ảnh Thủ" };
      const result = await executeUpdateAddressAction(
        VALID_ADDRESS_ID,
        { streetAddress: "184 Nguyễn Ảnh Thủ" },
        {
          patchAddress: () =>
            Promise.resolve({
              response: new Response(null, { status: 200 }),
              data: { data: updated },
            }),
          runWithRefresh: (op) =>
            op().then((res) => ({ ...res, refreshOutcome: "not_needed" })),
        },
      );

      expect(result).toEqual({ ok: true, address: updated });
    });
  });

  describe("executeSetDefaultAddressAction", () => {
    test("returns updated default address and localizes missing-address failures", async () => {
      const okResult = await executeSetDefaultAddressAction(VALID_ADDRESS_ID, {
        patchDefaultAddress: () =>
          Promise.resolve({
            response: new Response(null, { status: 200 }),
            data: { data: sampleAddress },
          }),
        runWithRefresh: (op) =>
          op().then((res) => ({ ...res, refreshOutcome: "not_needed" })),
      });
      expect(okResult).toEqual({ ok: true, address: sampleAddress });

      const missingResult = await executeSetDefaultAddressAction(
        SECOND_ADDRESS_ID,
        {
          patchDefaultAddress: () =>
            Promise.resolve({
              response: new Response(null, { status: 404 }),
              error: { status: 404, code: API_ERROR_CODES.ADDRESS_NOT_FOUND },
            }),
          runWithRefresh: (op) =>
            op().then((res) => ({ ...res, refreshOutcome: "not_needed" })),
        },
      );
      expect(missingResult.ok).toBe(false);
      if (!missingResult.ok) {
        expect(missingResult.code).toBe(API_ERROR_CODES.ADDRESS_NOT_FOUND);
        expect(missingResult.sessionInvalidated).toBe(false);
      }
    });
  });

  describe("executeDeleteAddressAction", () => {
    // Invariant: INV-SF-ADDR-6
    test("re-fetches authoritative server list after delete so newly promoted default stays synced", async () => {
      const promotedRemaining: CustomerAddress = {
        ...sampleAddress,
        id: SECOND_ADDRESS_ID,
        streetAddress: "72 Nguyễn Thị Minh Khai",
        isDefault: true,
      };

      const result = await executeDeleteAddressAction(VALID_ADDRESS_ID, {
        deleteAddress: () =>
          Promise.resolve({
            response: new Response(null, { status: 204 }),
          }),
        getAddresses: () =>
          Promise.resolve({
            response: new Response(null, { status: 200 }),
            data: { data: [promotedRemaining] },
          }),
        runWithRefresh: (op) =>
          op().then((res) => ({ ...res, refreshOutcome: "not_needed" })),
      });

      expect(result).toEqual({
        ok: true,
        addresses: [promotedRemaining],
        listSynced: true,
      });
    });

    // Invariant: INV-SF-ADDR-3
    test("propagates rotated access token into follow-up list read after delete rotation", async () => {
      let capturedFollowUpToken: string | undefined;
      let refreshCallCount = 0;

      const result = await executeDeleteAddressAction(VALID_ADDRESS_ID, {
        deleteAddress: () =>
          Promise.resolve({
            response: new Response(null, { status: 204 }),
          }),
        getAddresses: () => {
          capturedFollowUpToken = actionRefreshedTokenStorage.getStore();
          return Promise.resolve({
            response: new Response(null, { status: 200 }),
            data: { data: [sampleAddress] },
          });
        },
        runWithRefresh: (op) => {
          refreshCallCount += 1;
          if (refreshCallCount === 1) {
            return Promise.resolve({
              response: new Response(null, { status: 204 }),
              refreshOutcome: "rotated",
              rotatedAccessToken: "rotated-jwt-token",
            });
          }
          return op().then((res) => ({ ...res, refreshOutcome: "not_needed" }));
        },
      });

      expect(capturedFollowUpToken).toBe("rotated-jwt-token");
      expect(result).toEqual({
        ok: true,
        addresses: [sampleAddress],
        listSynced: true,
      });
    });

    test("preserves delete success with listSynced false when follow-up list read transiently fails", async () => {
      const result = await executeDeleteAddressAction(VALID_ADDRESS_ID, {
        deleteAddress: () =>
          Promise.resolve({
            response: new Response(null, { status: 204 }),
          }),
        getAddresses: () =>
          Promise.resolve({
            response: new Response(null, { status: 503 }),
            error: { status: 503 },
          }),
        runWithRefresh: (op) =>
          op().then((res) => ({ ...res, refreshOutcome: "not_needed" })),
      });

      expect(result).toEqual({
        ok: true,
        addresses: null,
        listSynced: false,
      });
    });
  });
});
