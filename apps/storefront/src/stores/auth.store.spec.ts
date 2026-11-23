import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { StorefrontSessionUser } from "@/types/auth.types";
import {
  AUTH_STORAGE_EVENT_KEY,
  broadcastAuthEvent,
  subscribeAuthEvents,
  useAuthStore,
} from "./auth.store";

const sampleUser: StorefrontSessionUser = {
  id: "0195a8f0-0001-7000-8000-000000000099",
  email: "khach@greenroots.vn",
  fullName: "Nguyễn Văn An",
  phone: "0901234567",
  role: "customer",
  status: "active",
  rewardPoints: 12500,
  emailVerified: true,
  createdAt: "2026-11-20T00:00:00.000Z",
  updatedAt: "2026-11-20T00:00:00.000Z",
};

describe("useAuthStore", () => {
  const originalBroadcastChannel = globalThis.BroadcastChannel;
  const originalWindow = globalThis.window;

  beforeEach(() => {
    useAuthStore.setState({ user: null, isHydrated: false });
  });

  afterEach(() => {
    globalThis.BroadcastChannel = originalBroadcastChannel;
    (globalThis as { window?: typeof window }).window = originalWindow;
  });

  describe("session state actions", () => {
    it("sets authenticated customer profile and marks store hydrated", () => {
      useAuthStore.getState().setUser(sampleUser);

      const state = useAuthStore.getState();
      expect(state.user).toEqual(sampleUser);
      expect(state.isHydrated).toBe(true);
    });

    it("clears user while keeping store hydrated on logout", () => {
      useAuthStore.getState().setUser(sampleUser);
      useAuthStore.getState().clearSession();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isHydrated).toBe(true);
    });
  });

  describe("cross-tab auth broadcast", () => {
    it("broadcasts and receives LOGOUT events via BroadcastChannel without duplicate storage dispatch", () => {
      const listeners = new Set<(event: MessageEvent) => void>();
      const postedPayloads: unknown[] = [];
      let storageSetCalls = 0;

      class MockBroadcastChannel {
        readonly name: string;
        closed = false;

        constructor(name: string) {
          this.name = name;
        }
        postMessage(data: unknown) {
          postedPayloads.push(data);
          for (const listener of listeners) {
            listener({ data } as MessageEvent);
          }
        }
        addEventListener(_type: string, fn: (event: MessageEvent) => void) {
          listeners.add(fn);
        }
        removeEventListener(_type: string, fn: (event: MessageEvent) => void) {
          listeners.delete(fn);
        }
        close() {
          this.closed = true;
        }
      }

      globalThis.BroadcastChannel =
        MockBroadcastChannel as unknown as typeof BroadcastChannel;
      (globalThis as { window?: unknown }).window = {
        localStorage: {
          setItem: () => {
            storageSetCalls++;
          },
        },
        addEventListener: () => {
          throw new Error(
            "storage listener should not attach when BroadcastChannel works",
          );
        },
        removeEventListener: () => {
          // No-op cleanup in test stub.
        },
      };

      const received: string[] = [];
      const unsubscribe = subscribeAuthEvents((eventType) => {
        received.push(eventType);
      });

      broadcastAuthEvent("LOGOUT");
      broadcastAuthEvent("SESSION_CHANGED");
      unsubscribe();

      expect(postedPayloads).toEqual([
        { type: "LOGOUT" },
        { type: "SESSION_CHANGED" },
      ]);
      expect(received).toEqual(["LOGOUT", "SESSION_CHANGED"]);
      expect(storageSetCalls).toBe(0);
      expect(AUTH_STORAGE_EVENT_KEY).toBe("greenroots-auth-event");
    });

    it("falls back to localStorage storage events when BroadcastChannel is unavailable", () => {
      (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel =
        undefined;
      const storageListeners = new Set<(event: StorageEvent) => void>();
      const storedItems = new Map<string, string>();

      (globalThis as { window?: unknown }).window = {
        localStorage: {
          setItem: (key: string, value: string) => {
            storedItems.set(key, value);
            for (const listener of storageListeners) {
              listener({ key, newValue: value } as StorageEvent);
            }
          },
        },
        addEventListener: (type: string, fn: (event: StorageEvent) => void) => {
          if (type === "storage") {
            storageListeners.add(fn);
          }
        },
        removeEventListener: (
          type: string,
          fn: (event: StorageEvent) => void,
        ) => {
          if (type === "storage") {
            storageListeners.delete(fn);
          }
        },
      };

      const received: string[] = [];
      const unsubscribe = subscribeAuthEvents((eventType) => {
        received.push(eventType);
      });

      broadcastAuthEvent("LOGOUT");
      unsubscribe();

      expect(received).toEqual(["LOGOUT"]);
      expect(storedItems.has(AUTH_STORAGE_EVENT_KEY)).toBe(true);
    });
  });
});
