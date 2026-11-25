"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { type CartItem, useCartStore } from "@/stores/cart.store";
import { validateCartAction } from "../actions/order-actions";
import type { ValidateCartResponse } from "../schemas/order.schema";
import {
  buildCheckoutPayloadSignature,
  reconcileValidatedCart,
} from "../utils/order-checkout.utils";

function subscribeCartHydration(onStoreChange: () => void): () => void {
  return useCartStore.persist.onFinishHydration(onStoreChange);
}

function getClientCartHydrated(): boolean {
  return useCartStore.persist.hasHydrated();
}

function getServerCartHydrated(): boolean {
  return false;
}

/**
 * Returns `true` once `useCartStore` has rehydrated from `localStorage`,
 * preventing SSR/client hydration mismatches (`UI-3`).
 */
export function useCartHydrated(): boolean {
  return useSyncExternalStore(
    subscribeCartHydration,
    getClientCartHydrated,
    getServerCartHydrated,
  );
}

interface UseValidatedCartOptions {
  readonly enabled: boolean;
  readonly items: readonly CartItem[];
  readonly addressId?: string | null;
  readonly districtCode?: string | null;
  readonly loyaltyPoints?: number;
  readonly debounceMs?: number;
  readonly onSessionInvalidated?: () => void;
}

interface UseValidatedCartResult {
  readonly localSubtotalVnd: number;
  readonly validation: ValidateCartResponse | null;
  readonly validationError: string | null;
  readonly isValidating: boolean;
  readonly priceUpdatedIds: readonly string[];
  readonly retry: () => void;
}

/**
 * Shared debounced `validateCartAction` hook for `CartPageView` and `CheckoutView`.
 * Tracks request signature freshness so callers never treat stale quotes as valid
 * during the debounce window, and clears stale validation on error.
 */
export function useValidatedCart({
  enabled,
  items,
  addressId = null,
  districtCode = null,
  loyaltyPoints = 0,
  debounceMs = 200,
  onSessionInvalidated,
}: UseValidatedCartOptions): UseValidatedCartResult {
  const syncValidatedPrice = useCartStore((state) => state.syncValidatedPrice);

  const [reloadNonce, setReloadNonce] = useState(0);
  const [priceUpdatedIds, setPriceUpdatedIds] = useState<readonly string[]>([]);
  const [state, setState] = useState<{
    readonly signature: string;
    readonly nonce: number;
    readonly validation: ValidateCartResponse | null;
    readonly error: string | null;
  } | null>(null);

  const requestSeqRef = useRef(0);
  const onSessionInvalidatedRef = useRef(onSessionInvalidated);
  useEffect(() => {
    onSessionInvalidatedRef.current = onSessionInvalidated;
  }, [onSessionInvalidated]);

  const localSubtotalVnd = useMemo(
    () =>
      items.reduce(
        (sum, item) => sum + Math.round(item.unitPriceVnd * item.quantity),
        0,
      ),
    [items],
  );

  const currentSignature = useMemo(
    () =>
      buildCheckoutPayloadSignature({
        items: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
        addressId: addressId ?? districtCode ?? null,
        loyaltyPoints,
      }),
    [addressId, districtCode, items, loyaltyPoints],
  );

  useEffect(() => {
    if (!enabled || items.length === 0) {
      return;
    }

    const seq = ++requestSeqRef.current;
    const timer = setTimeout(() => {
      void validateCartAction({
        items: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
        ...(addressId ? { addressId } : districtCode ? { districtCode } : {}),
        loyaltyPoints,
      }).then((result) => {
        if (seq !== requestSeqRef.current) {
          return;
        }

        if (!result.ok) {
          if (result.sessionInvalidated) {
            onSessionInvalidatedRef.current?.();
          }
          setState({
            signature: currentSignature,
            nonce: reloadNonce,
            validation: null,
            error: result.message,
          });
          return;
        }

        const reconciled = reconcileValidatedCart(items, result.data);
        for (const serverItem of result.data.items) {
          if (
            reconciled.priceChangedProductIds.includes(serverItem.productId)
          ) {
            syncValidatedPrice(serverItem.productId, serverItem.unitPriceVnd);
          }
        }
        if (reconciled.priceChangedProductIds.length > 0) {
          setPriceUpdatedIds((prev) =>
            Array.from(
              new Set([...prev, ...reconciled.priceChangedProductIds]),
            ),
          );
        }

        setState({
          signature: currentSignature,
          nonce: reloadNonce,
          validation: result.data,
          error: null,
        });
      });
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [
    addressId,
    currentSignature,
    debounceMs,
    districtCode,
    enabled,
    items,
    loyaltyPoints,
    reloadNonce,
    syncValidatedPrice,
  ]);

  const retry = useCallback(() => {
    setReloadNonce((n) => n + 1);
  }, []);

  if (!enabled || items.length === 0) {
    return {
      localSubtotalVnd,
      validation: null,
      validationError: null,
      isValidating: false,
      priceUpdatedIds,
      retry,
    };
  }

  const isSettled =
    state?.signature === currentSignature && state.nonce === reloadNonce;

  return {
    localSubtotalVnd,
    validation: isSettled ? state.validation : null,
    validationError: isSettled ? state.error : null,
    isValidating: !isSettled,
    priceUpdatedIds,
    retry,
  };
}
