"use client";

import { HCMC_DISTRICTS } from "@greenroots/shared";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { StorefrontProduct } from "@/types/storefront.types";

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
  setQuantity: (productId: string, quantity: number) => void;
  incrementItem: (productId: string) => void;
  decrementItem: (productId: string) => void;
  removeItem: (productId: string) => void;
  clearCart: () => void;
  setDeliveryDistrict: (districtCode: string, streetAddress?: string) => void;
}

const DEFAULT_DISTRICT_CODE = HCMC_DISTRICTS[0].code;
const ssrMemoryFallback = new Map<string, string>();

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
            const nextQuantity = Math.min(
              existing.quantity + quantity,
              product.availableQuantity,
            );
            return {
              items: state.items.map((item) =>
                item.productId === product.id
                  ? {
                      ...item,
                      quantity: nextQuantity,
                      availableQuantity: product.availableQuantity,
                      unitPriceVnd: effectivePrice,
                    }
                  : item,
              ),
            };
          }

          const clampedQuantity = Math.max(
            1,
            Math.min(quantity, product.availableQuantity),
          );
          if (product.availableQuantity <= 0) {
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

      setQuantity: (productId, quantity) =>
        set((state) => {
          if (quantity <= 0) {
            return {
              items: state.items.filter((item) => item.productId !== productId),
            };
          }
          return {
            items: state.items.map((item) =>
              item.productId === productId
                ? {
                    ...item,
                    quantity: Math.min(quantity, item.availableQuantity),
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
                  quantity: Math.min(item.quantity + 1, item.availableQuantity),
                }
              : item,
          ),
        })),

      decrementItem: (productId) =>
        set((state) => ({
          items: state.items
            .map((item) =>
              item.productId === productId
                ? { ...item, quantity: item.quantity - 1 }
                : item,
            )
            .filter((item) => item.quantity > 0),
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
