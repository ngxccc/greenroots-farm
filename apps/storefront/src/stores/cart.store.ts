"use client";

import { BUSINESS_RULES, HCMC_DISTRICTS } from "@greenroots/shared";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { roundQuantity } from "@/lib/format";
import type { StorefrontProduct } from "@/types/catalog.types";

export interface CartItem {
  readonly productId: string;
  readonly slug: string;
  readonly name: string;
  readonly unitLabel: string;
  readonly unitPriceVnd: number;
  readonly originalPriceVnd?: number;
  readonly availableQuantity: number;
  readonly imageUrl?: string;
  readonly quantity: number;
}

interface CartState {
  items: CartItem[];
  selectedDistrictCode: string;
  streetAddress: string;
  addItem: (product: StorefrontProduct, quantity?: number) => void;
  syncProductSnapshot: (product: StorefrontProduct) => void;
  setQuantity: (productId: string, quantity: number) => void;
  incrementItem: (productId: string) => void;
  decrementItem: (productId: string) => void;
  removeItem: (productId: string) => void;
  clearCart: () => void;
  setDeliveryDistrict: (districtCode: string, streetAddress?: string) => void;
}

const DEFAULT_DISTRICT_CODE = HCMC_DISTRICTS[0].code;
const ssrMemoryFallback = new Map<string, string>();

function clampAddableQuantity(requested: number, available: number): number {
  const normalizedAvailable = roundQuantity(Math.max(0, available));
  if (normalizedAvailable <= 0) {
    return 0;
  }
  const normalizedRequested = roundQuantity(requested);
  if (!Number.isFinite(normalizedRequested) || normalizedRequested <= 0) {
    return 0;
  }
  const boundedMin = Math.min(
    BUSINESS_RULES.ORDER_ITEM_MIN_QUANTITY,
    normalizedAvailable,
  );
  return roundQuantity(
    Math.min(Math.max(normalizedRequested, boundedMin), normalizedAvailable),
  );
}

/**
 * Client-side grocery cart persisted in `localStorage` (Q27).
 * Inventory is never locked in the cart; availability is checked before checkout.
 */
export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      selectedDistrictCode: DEFAULT_DISTRICT_CODE,
      streetAddress: "",

      addItem: (product, quantity = 1) =>
        set((state) => {
          const effectivePrice = product.salePriceVnd ?? product.basePriceVnd;
          const existing = state.items.find(
            (item) => item.productId === product.id,
          );
          if (existing) {
            const nextQuantity = clampAddableQuantity(
              existing.quantity + quantity,
              product.availableQuantity,
            );
            if (nextQuantity <= 0) {
              return state;
            }
            return {
              items: state.items.map((item) =>
                item.productId === product.id
                  ? {
                      ...item,
                      slug: product.slug,
                      name: product.name,
                      unitLabel: product.unitLabel,
                      unitPriceVnd: effectivePrice,
                      originalPriceVnd: product.salePriceVnd
                        ? product.basePriceVnd
                        : undefined,
                      availableQuantity: product.availableQuantity,
                      imageUrl: product.imageUrl,
                      quantity: nextQuantity,
                    }
                  : item,
              ),
            };
          }

          const clampedQuantity = clampAddableQuantity(
            quantity,
            product.availableQuantity,
          );
          if (clampedQuantity <= 0) {
            return state;
          }

          return {
            items: [
              ...state.items,
              {
                productId: product.id,
                slug: product.slug,
                name: product.name,
                unitLabel: product.unitLabel,
                unitPriceVnd: effectivePrice,
                originalPriceVnd: product.salePriceVnd
                  ? product.basePriceVnd
                  : undefined,
                availableQuantity: product.availableQuantity,
                imageUrl: product.imageUrl,
                quantity: clampedQuantity,
              },
            ],
          };
        }),

      syncProductSnapshot: (product) =>
        set((state) => {
          const existing = state.items.find(
            (item) => item.productId === product.id,
          );
          if (!existing) {
            return state;
          }

          const liveAvailable = roundQuantity(
            Math.max(0, product.availableQuantity),
          );
          const effectivePrice = product.salePriceVnd ?? product.basePriceVnd;
          const originalPriceVnd = product.salePriceVnd
            ? product.basePriceVnd
            : undefined;
          const nextQuantity = clampAddableQuantity(
            existing.quantity,
            liveAvailable,
          );

          if (nextQuantity <= 0) {
            return {
              items: state.items.filter(
                (item) => item.productId !== product.id,
              ),
            };
          }

          const isUnchanged =
            existing.slug === product.slug &&
            existing.name === product.name &&
            existing.unitLabel === product.unitLabel &&
            existing.unitPriceVnd === effectivePrice &&
            existing.originalPriceVnd === originalPriceVnd &&
            roundQuantity(existing.availableQuantity) === liveAvailable &&
            existing.imageUrl === product.imageUrl &&
            roundQuantity(existing.quantity) === nextQuantity;

          if (isUnchanged) {
            return state;
          }

          return {
            items: state.items.map((item) =>
              item.productId === product.id
                ? {
                    ...item,
                    slug: product.slug,
                    name: product.name,
                    unitLabel: product.unitLabel,
                    unitPriceVnd: effectivePrice,
                    originalPriceVnd,
                    availableQuantity: liveAvailable,
                    imageUrl: product.imageUrl,
                    quantity: nextQuantity,
                  }
                : item,
            ),
          };
        }),

      setQuantity: (productId, quantity) =>
        set((state) => {
          const rounded = roundQuantity(quantity);
          if (!Number.isFinite(rounded) || rounded <= 0) {
            return {
              items: state.items.filter((item) => item.productId !== productId),
            };
          }
          return {
            items: state.items.map((item) =>
              item.productId === productId
                ? {
                    ...item,
                    quantity: clampAddableQuantity(
                      rounded,
                      item.availableQuantity,
                    ),
                  }
                : item,
            ),
          };
        }),

      incrementItem: (productId) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.productId === productId
              ? {
                  ...item,
                  quantity: clampAddableQuantity(
                    item.quantity + 1,
                    item.availableQuantity,
                  ),
                }
              : item,
          ),
        })),

      decrementItem: (productId) =>
        set((state) => ({
          items: state.items
            .map((item) =>
              item.productId === productId
                ? { ...item, quantity: roundQuantity(item.quantity - 1) }
                : item,
            )
            .filter(
              (item) => item.quantity >= BUSINESS_RULES.ORDER_ITEM_MIN_QUANTITY,
            ),
        })),

      removeItem: (productId) =>
        set((state) => ({
          items: state.items.filter((item) => item.productId !== productId),
        })),
      clearCart: () => set({ items: [] }),

      setDeliveryDistrict: (districtCode, streetAddress) =>
        set((state) => ({
          selectedDistrictCode: districtCode,
          streetAddress: streetAddress ?? state.streetAddress,
        })),
    }),
    {
      name: "greenroots-cart-v1",
      // Persist only non-PII cart items and guest district code so address text never stays in localStorage (INV-SF-ADDR-1).
      partialize: (state) => ({
        items: state.items,
        selectedDistrictCode: state.selectedDistrictCode,
      }),
      storage: createJSONStorage(() =>
        typeof window === "undefined"
          ? {
              getItem: (key) => ssrMemoryFallback.get(key) ?? null,
              setItem: (key, value) => {
                ssrMemoryFallback.set(key, value);
              },
              removeItem: (key) => {
                ssrMemoryFallback.delete(key);
              },
            }
          : window.localStorage,
      ),
    },
  ),
);
