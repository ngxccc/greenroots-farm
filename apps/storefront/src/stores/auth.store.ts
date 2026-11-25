"use client";

import { create } from "zustand";
import type { StorefrontSessionUser } from "@/features/auth/types/auth.types";

export const AUTH_BROADCAST_CHANNEL = "greenroots-auth";
export const AUTH_STORAGE_EVENT_KEY = "greenroots-auth-event";

/**
 * Non-PII cross-tab session lifecycle event type emitted over `BroadcastChannel` or `storage`.
 */
export type AuthSyncEventType = "LOGOUT" | "SESSION_CHANGED";

interface AuthState {
  user: StorefrontSessionUser | null;
  isHydrated: boolean;
  setUser: (user: StorefrontSessionUser | null) => void;
  clearSession: () => void;
}

/**
 * In-memory client session mirror hydrated from server `<Suspense>` props.
 * Never persists credentials or tokens in browser storage (`INV-SF-AUTH-1`).
 */
export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  isHydrated: false,
  setUser: (user) => set({ user, isHydrated: true }),
  clearSession: () => set({ user: null, isHydrated: true }),
}));

function getBroadcastChannelConstructor(): typeof BroadcastChannel | undefined {
  const candidate = (
    globalThis as { BroadcastChannel?: typeof BroadcastChannel }
  ).BroadcastChannel;
  return typeof candidate === "function" ? candidate : undefined;
}

function isAuthSyncEventType(value: unknown): value is AuthSyncEventType {
  return value === "LOGOUT" || value === "SESSION_CHANGED";
}

/**
 * Broadcasts a non-PII session lifecycle event across open Storefront browser tabs.
 * Prefers `BroadcastChannel` and falls back to `localStorage` only when unsupported
 * so subscribers never trigger duplicate reloads for one event.
 *
 * @param type Lifecycle transition event name (`LOGOUT` or `SESSION_CHANGED`).
 */
export function broadcastAuthEvent(type: AuthSyncEventType): void {
  const Channel = getBroadcastChannelConstructor();
  if (Channel) {
    try {
      const channel = new Channel(AUTH_BROADCAST_CHANNEL);
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- BroadcastChannel.postMessage takes no targetOrigin parameter.
      channel.postMessage({ type });
      channel.close();
      return;
    } catch {
      // Fall back to localStorage storage events when BroadcastChannel construction fails.
    }
  }

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        AUTH_STORAGE_EVENT_KEY,
        JSON.stringify({ type, timestamp: Date.now() }),
      );
    } catch {
      // Storage may be disabled in strict privacy contexts.
    }
  }
}

/**
 * Subscribes to cross-tab auth synchronization signals using `BroadcastChannel`
 * or a `localStorage` `storage` event fallback when `BroadcastChannel` is unavailable.
 *
 * @param onEvent Callback invoked when another tab emits a valid lifecycle event.
 * @returns Cleanup unsubscribe function.
 */
export function subscribeAuthEvents(
  onEvent: (type: AuthSyncEventType) => void,
): () => void {
  const Channel = getBroadcastChannelConstructor();

  if (Channel) {
    try {
      const channel = new Channel(AUTH_BROADCAST_CHANNEL);
      const handleMessage = (event: MessageEvent) => {
        const data = event.data as { type?: unknown } | null;
        if (data && isAuthSyncEventType(data.type)) {
          onEvent(data.type);
        }
      };
      channel.addEventListener("message", handleMessage);
      return () => {
        channel.removeEventListener("message", handleMessage);
        channel.close();
      };
    } catch {
      // Fall back to storage listener when BroadcastChannel is restricted.
    }
  }

  if (typeof window !== "undefined") {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== AUTH_STORAGE_EVENT_KEY || !event.newValue) {
        return;
      }
      try {
        const parsed = JSON.parse(event.newValue) as { type?: unknown };
        if (isAuthSyncEventType(parsed.type)) {
          onEvent(parsed.type);
        }
      } catch {
        // Ignore malformed storage entries.
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }

  return () => {
    // No browser event transport available in SSR/non-DOM environments.
  };
}
