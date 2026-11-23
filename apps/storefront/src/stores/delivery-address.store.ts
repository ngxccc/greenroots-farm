"use client";

import { create } from "zustand";
import type { CustomerAddress } from "@/types/address.types";

interface DeliveryAddressState {
  addresses: readonly CustomerAddress[];
  selectedAddressId: string | null;
  isHydrated: boolean;
  setAddresses: (addresses: readonly CustomerAddress[]) => void;
  selectSavedAddress: (addressId: string) => void;
  reconcileAfterCreate: (created: CustomerAddress) => void;
  reconcileAfterUpdate: (updated: CustomerAddress) => void;
  reconcileAfterSetDefault: (updatedDefault: CustomerAddress) => void;
  reconcileAfterDelete: (
    deletedId: string,
    syncedList?: readonly CustomerAddress[] | null,
  ) => void;
  clearDeliveryState: () => void;
}

/**
 * Resolves the active delivery address from a list using `preferredId` if present,
 * falling back to the server-designated default address or first saved entry.
 *
 * @param addresses Saved customer delivery addresses.
 * @param preferredId Optional explicitly selected address UUID.
 * @returns Matched active address or `null` when the address book is empty.
 */
export function findActiveDeliveryAddress(
  addresses: readonly CustomerAddress[],
  preferredId: string | null,
): CustomerAddress | null {
  if (preferredId) {
    const matched = addresses.find((item) => item.id === preferredId);
    if (matched) {
      return matched;
    }
  }
  return addresses.find((item) => item.isDefault) ?? addresses.at(0) ?? null;
}

function pickFallbackAddressId(
  addresses: readonly CustomerAddress[],
  preferredId: string | null,
): string | null {
  return findActiveDeliveryAddress(addresses, preferredId)?.id ?? null;
}

/**
 * Strictly in-memory customer delivery address store shared across `StorefrontHeader`,
 * `AddressDialog`, and `/account/addresses`. Never persisted to `localStorage` (`INV-SF-ADDR-1`).
 */
export const useDeliveryAddressStore = create<DeliveryAddressState>()(
  (set) => ({
    addresses: [],
    selectedAddressId: null,
    isHydrated: false,

    setAddresses: (addresses) =>
      set((state) => ({
        addresses,
        selectedAddressId: pickFallbackAddressId(
          addresses,
          state.selectedAddressId,
        ),
        isHydrated: true,
      })),

    selectSavedAddress: (addressId) =>
      set((state) => {
        if (!state.addresses.some((item) => item.id === addressId)) {
          return state;
        }
        return { selectedAddressId: addressId };
      }),

    reconcileAfterCreate: (created) =>
      set((state) => {
        if (created.isDefault) {
          const demoted = state.addresses.map((item) =>
            item.isDefault ? { ...item, isDefault: false } : item,
          );
          return {
            addresses: [created, ...demoted],
            selectedAddressId: created.id,
            isHydrated: true,
          };
        }

        // Preserve backend sort order (`isDefault DESC, createdAt DESC`) by inserting after any leading default.
        const first = state.addresses.at(0);
        const nextAddresses = first?.isDefault
          ? [first, created, ...state.addresses.slice(1)]
          : [created, ...state.addresses];

        return {
          addresses: nextAddresses,
          selectedAddressId: created.id,
          isHydrated: true,
        };
      }),

    reconcileAfterUpdate: (updated) =>
      set((state) => ({
        addresses: state.addresses.map((item) =>
          item.id === updated.id ? updated : item,
        ),
        isHydrated: true,
      })),

    reconcileAfterSetDefault: (updatedDefault) =>
      set((state) => {
        const mapped = state.addresses.map((item) =>
          item.id === updatedDefault.id
            ? updatedDefault
            : { ...item, isDefault: false },
        );
        const target = mapped.find((item) => item.id === updatedDefault.id);
        const others = mapped.filter((item) => item.id !== updatedDefault.id);
        return {
          addresses: target ? [target, ...others] : mapped,
          selectedAddressId: updatedDefault.id,
          isHydrated: true,
        };
      }),

    reconcileAfterDelete: (deletedId, syncedList) =>
      set((state) => {
        if (syncedList) {
          const nextSelected = pickFallbackAddressId(
            syncedList,
            state.selectedAddressId === deletedId
              ? null
              : state.selectedAddressId,
          );
          return {
            addresses: syncedList,
            selectedAddressId: nextSelected,
            isHydrated: true,
          };
        }

        const remaining = state.addresses.filter(
          (item) => item.id !== deletedId,
        );
        return {
          addresses: remaining,
          selectedAddressId: pickFallbackAddressId(
            remaining,
            state.selectedAddressId === deletedId
              ? null
              : state.selectedAddressId,
          ),
          isHydrated: true,
        };
      }),

    clearDeliveryState: () =>
      set({
        addresses: [],
        selectedAddressId: null,
        isHydrated: false,
      }),
  }),
);
