import { beforeEach, describe, expect, test } from "bun:test";
import type { CustomerAddress } from "@/features/account/types/address.types";
import { useDeliveryAddressStore } from "./delivery-address.store";

const addr1: CustomerAddress = {
  id: "0195a8f0-0001-7000-8000-000000000001",
  receiverName: "Nguyễn Minh Anh",
  phoneNumber: "0908412679",
  streetAddress: "142 Lê Đức Thọ",
  placeId: "mock_place_go_vap",
  district: "Quận Gò Vấp",
  city: "TP. Hồ Chí Minh",
  isDefault: true,
  createdAt: "2026-11-22T00:00:00.000Z",
  updatedAt: "2026-11-22T00:00:00.000Z",
};

const addr2: CustomerAddress = {
  id: "0195a8f0-0001-7000-8000-000000000002",
  receiverName: "Trần Hoàng Nam",
  phoneNumber: "0912345678",
  streetAddress: "72 Nguyễn Thị Minh Khai",
  placeId: "mock_place_quan_1",
  district: "Quận 1",
  city: "TP. Hồ Chí Minh",
  isDefault: false,
  createdAt: "2026-11-23T00:00:00.000Z",
  updatedAt: "2026-11-23T00:00:00.000Z",
};

describe("useDeliveryAddressStore", () => {
  beforeEach(() => {
    useDeliveryAddressStore.getState().clearDeliveryState();
  });

  // Invariant: INV-SF-ADDR-8
  test("selects default address automatically when hydrated and preserves valid custom selection", () => {
    useDeliveryAddressStore.getState().setAddresses([addr1, addr2]);
    expect(useDeliveryAddressStore.getState().selectedAddressId).toBe(addr1.id);

    useDeliveryAddressStore.getState().selectSavedAddress(addr2.id);
    useDeliveryAddressStore.getState().setAddresses([addr1, addr2]);
    expect(useDeliveryAddressStore.getState().selectedAddressId).toBe(addr2.id);
  });

  // Invariant: INV-SF-ADDR-6
  test("reconciles server default promotion on delete and demotes prior default on create", () => {
    useDeliveryAddressStore.getState().setAddresses([addr1]);
    useDeliveryAddressStore.getState().reconcileAfterCreate({
      ...addr2,
      isDefault: true,
    });

    const afterCreate = useDeliveryAddressStore.getState();
    expect(afterCreate.addresses).toHaveLength(2);
    expect(afterCreate.addresses[0]?.id).toBe(addr2.id);
    expect(afterCreate.addresses[0]?.isDefault).toBe(true);
    expect(afterCreate.addresses[1]?.isDefault).toBe(false);
    expect(afterCreate.selectedAddressId).toBe(addr2.id);

    const promotedAddr1 = { ...addr1, isDefault: true };
    useDeliveryAddressStore
      .getState()
      .reconcileAfterDelete(addr2.id, [promotedAddr1]);

    const afterDelete = useDeliveryAddressStore.getState();
    expect(afterDelete.addresses).toEqual([promotedAddr1]);
    expect(afterDelete.selectedAddressId).toBe(addr1.id);
  });

  // Invariant: INV-SF-ADDR-8
  test("updates selectedAddressId and list ordering when reconciling setDefault or non-default create", () => {
    useDeliveryAddressStore.getState().setAddresses([addr1]);
    useDeliveryAddressStore.getState().reconcileAfterCreate(addr2);

    // Non-default create preserves leading default first while pinning created entry.
    const afterCreate = useDeliveryAddressStore.getState();
    expect(afterCreate.addresses.map((item) => item.id)).toEqual([
      addr1.id,
      addr2.id,
    ]);
    expect(afterCreate.selectedAddressId).toBe(addr2.id);

    useDeliveryAddressStore.getState().selectSavedAddress(addr1.id);
    useDeliveryAddressStore.getState().reconcileAfterSetDefault({
      ...addr2,
      isDefault: true,
    });

    const afterDefault = useDeliveryAddressStore.getState();
    expect(afterDefault.addresses[0]?.id).toBe(addr2.id);
    expect(afterDefault.addresses[0]?.isDefault).toBe(true);
    expect(afterDefault.addresses[1]?.isDefault).toBe(false);
    expect(afterDefault.selectedAddressId).toBe(addr2.id);
  });

  // Invariant: INV-SF-ADDR-1
  test("clears all runtime addresses and selection synchronously on logout", () => {
    useDeliveryAddressStore.getState().setAddresses([addr1, addr2]);
    useDeliveryAddressStore.getState().clearDeliveryState();

    const state = useDeliveryAddressStore.getState();
    expect(state.addresses).toEqual([]);
    expect(state.selectedAddressId).toBeNull();
    expect(state.isHydrated).toBe(false);
  });
});
