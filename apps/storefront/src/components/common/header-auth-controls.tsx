"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type RefObject } from "react";
import { toast } from "@greenroots/ui";
import { ChevronDown, LogIn, LogOut, Package, User } from "lucide-react";
import type { StorefrontSessionUser } from "@/types/auth.types";
import {
  broadcastAuthEvent,
  subscribeAuthEvents,
  useAuthStore,
} from "@/stores/auth.store";

interface HeaderAuthControlsProps {
  readonly initialUser: StorefrontSessionUser | null;
}

interface HeaderAuthViewProps {
  readonly activeUser: StorefrontSessionUser | null;
  readonly menuOpen?: boolean;
  readonly isLoggingOut?: boolean;
  readonly containerRef?: RefObject<HTMLDivElement | null>;
  readonly onToggleMenu?: () => void;
  readonly onCloseMenu?: () => void;
  readonly onLogout?: () => void;
}

/**
 * Pure presentational view for `StorefrontHeader` customer auth actions,
 * supporting both guest `Đăng nhập / Đăng ký` links and authenticated dropdown menus.
 */
export function HeaderAuthView({
  activeUser,
  menuOpen = false,
  isLoggingOut = false,
  containerRef,
  onToggleMenu,
  onCloseMenu,
  onLogout,
}: HeaderAuthViewProps) {
  if (!activeUser) {
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-brand-dark/35 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-dark/50 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
        >
          <LogIn className="size-4 shrink-0" aria-hidden="true" />
          <span>Đăng nhập</span>
        </Link>
        <Link
          href="/register"
          className="hidden rounded px-2 py-1.5 text-xs font-semibold text-white hover:underline focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none sm:inline-flex"
        >
          Đăng ký
        </Link>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={onToggleMenu}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/30 bg-brand-dark/35 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-dark/50 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
      >
        <User className="size-4 shrink-0" aria-hidden="true" />
        <span className="max-w-27.5 truncate sm:max-w-35">
          {activeUser.fullName}
        </span>
        <ChevronDown className="size-3.5 shrink-0 opacity-80" />
      </button>

      {menuOpen ? (
        <div
          role="menu"
          aria-label="Tài khoản khách hàng"
          className="absolute top-full right-0 z-50 mt-2 w-56 rounded-xl border border-border-subtle bg-white p-1.5 text-gray-800 shadow-lg"
        >
          <div className="border-b border-border-subtle px-2.5 py-2">
            <p className="truncate text-xs font-bold text-gray-900">
              {activeUser.fullName}
            </p>
            <p className="truncate text-[11px] text-gray-500">
              {activeUser.email}
            </p>
          </div>

          <Link
            href="/account/profile"
            role="menuitem"
            onClick={onCloseMenu}
            className="mt-1 flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-gray-700 transition hover:bg-green-50 hover:text-brand-forest"
          >
            <User className="size-4 shrink-0" />
            Tài khoản &amp; điểm thưởng
          </Link>

          <Link
            href="/orders"
            role="menuitem"
            onClick={onCloseMenu}
            className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-gray-700 transition hover:bg-green-50 hover:text-brand-forest"
          >
            <Package className="size-4 shrink-0" />
            Đơn hàng của tôi
          </Link>

          <button
            type="button"
            role="menuitem"
            disabled={isLoggingOut}
            onClick={onLogout}
            className="mt-1 flex w-full cursor-pointer items-center gap-2 rounded-lg border-t border-border-subtle px-2.5 py-2 text-left text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
          >
            <LogOut className="size-4 shrink-0" />
            {isLoggingOut ? "Đang đăng xuất..." : "Đăng xuất"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Interactive customer auth control rendered inside `StorefrontHeader`.
 * Hydrates from SSR `<Suspense>` props without guest-to-user flicker and syncs logout across tabs.
 */
export function HeaderAuthControls({ initialUser }: HeaderAuthControlsProps) {
  const router = useRouter();
  const storeUser = useAuthStore((state) => state.user);
  const isHydrated = useAuthStore((state) => state.isHydrated);
  const setUser = useAuthStore((state) => state.setUser);
  const clearSession = useAuthStore((state) => state.clearSession);

  const [menuOpen, setMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUser(initialUser);
  }, [initialUser, setUser]);

  useEffect(() => {
    return subscribeAuthEvents((eventType) => {
      if (eventType === "LOGOUT") {
        clearSession();
        setMenuOpen(false);
      }
      router.refresh();
    });
  }, [clearSession, router]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  async function handleLogout() {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });

      if (!response.ok) {
        toast.error("Không thể đăng xuất, vui lòng thử lại.");
        return;
      }

      clearSession();
      setMenuOpen(false);
      broadcastAuthEvent("LOGOUT");
      toast.success("Đã đăng xuất tài khoản");
      router.refresh();
    } catch {
      toast.error("Không thể kết nối máy chủ để đăng xuất.");
    } finally {
      setIsLoggingOut(false);
    }
  }

  // Render the SSR-provided user until client store hydrates to guarantee zero hydration mismatch.
  const activeUser = isHydrated ? storeUser : initialUser;

  return (
    <HeaderAuthView
      activeUser={activeUser}
      menuOpen={menuOpen}
      isLoggingOut={isLoggingOut}
      containerRef={containerRef}
      onToggleMenu={() => setMenuOpen((prev) => !prev)}
      onCloseMenu={() => setMenuOpen(false)}
      onLogout={() => void handleLogout()}
    />
  );
}
