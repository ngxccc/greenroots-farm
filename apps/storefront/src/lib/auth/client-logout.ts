"use client";

import { clearShippingQuoteCache } from "@/lib/shipping/use-shipping-quote";
import { broadcastAuthEvent, useAuthStore } from "@/stores/auth.store";
import { useDeliveryAddressStore } from "@/stores/delivery-address.store";

/**
 * Result returned after invoking `POST /api/auth/logout` from Storefront UI controls.
 */
export type ClientLogoutResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

/**
 * Optional dependency overrides for isolated unit testing of `performStorefrontLogout`.
 */
export interface ClientLogoutDeps {
  readonly fetcher?: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>;
  readonly clearSession?: () => void;
  readonly broadcastLogout?: () => void;
}

function resetClientAuthStores(): void {
  clearShippingQuoteCache();
  useAuthStore.getState().clearSession();
  useDeliveryAddressStore.getState().clearDeliveryState();
}

/**
 * Synchronously clears all in-memory customer identity and delivery address state
 * in the current tab and notifies sibling tabs (`INV-SF-ADDR-1`, `INV-SF-AUTH-6`).
 */
export function invalidateStorefrontClientSession(): void {
  resetClientAuthStores();
  broadcastAuthEvent("LOGOUT");
}

/**
 * Executes single-device customer logout via Storefront BFF `POST /api/auth/logout`,
 * clears client session store, and broadcasts `"LOGOUT"` across open browser tabs on success.
 *
 * @param deps Optional fetch, store-reset, and broadcast overrides for unit tests.
 * @returns Success marker or localized Vietnamese failure message keeping existing state.
 */
export async function performStorefrontLogout(
  deps?: ClientLogoutDeps,
): Promise<ClientLogoutResult> {
  const fetcher = deps?.fetcher ?? fetch;
  const clearSession = deps?.clearSession ?? resetClientAuthStores;
  const broadcastLogout =
    deps?.broadcastLogout ?? (() => broadcastAuthEvent("LOGOUT"));

  try {
    const response = await fetcher("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
    });

    if (!response.ok) {
      return {
        ok: false,
        message: "Không thể đăng xuất, vui lòng thử lại.",
      };
    }

    clearSession();
    broadcastLogout();
    return { ok: true };
  } catch {
    return {
      ok: false,
      message: "Không thể kết nối máy chủ để đăng xuất.",
    };
  }
}
