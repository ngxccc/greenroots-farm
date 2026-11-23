"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  toast,
} from "@greenroots/ui";
import {
  ChevronDown,
  LogIn,
  LogOut,
  MapPin,
  Package,
  User,
} from "lucide-react";
import { performStorefrontLogout } from "@/lib/auth/client-logout";
import { getUserInitials } from "@/lib/format";
import { subscribeAuthEvents, useAuthStore } from "@/stores/auth.store";
import { useDeliveryAddressStore } from "@/stores/delivery-address.store";
import type { CustomerAddress } from "@/types/address.types";
import type { StorefrontSessionUser } from "@/types/auth.types";

interface HeaderAuthControlsProps {
  readonly initialUser: StorefrontSessionUser | null;
  readonly initialAddresses?: readonly CustomerAddress[] | null;
}

interface HeaderAuthViewProps {
  readonly activeUser: StorefrontSessionUser | null;
  readonly menuOpen?: boolean;
  readonly isLoggingOut?: boolean;
  readonly onMenuOpenChange?: (open: boolean) => void;
  readonly onLogout?: () => void;
}

/**
 * Pure presentational view for `StorefrontHeader` customer auth actions,
 * supporting both guest `Đăng nhập / Đăng ký` links and authenticated Base UI `DropdownMenu`.
 */
export function HeaderAuthView({
  activeUser,
  menuOpen = false,
  isLoggingOut = false,
  onMenuOpenChange,
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

  const initials = getUserInitials(activeUser.fullName);

  return (
    <DropdownMenu open={menuOpen} onOpenChange={onMenuOpenChange}>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Tài khoản ${activeUser.fullName}`}
            className="h-auto gap-1.5 rounded-full border border-white/30 bg-brand-dark/35 py-1 pr-2.5 pl-1.5 text-xs font-semibold text-white hover:bg-brand-dark/50 hover:text-white focus-visible:border-white focus-visible:ring-2 focus-visible:ring-white aria-expanded:bg-brand-dark/50 aria-expanded:text-white sm:pr-3 dark:hover:bg-brand-dark/50"
          />
        }
      >
        <span
          aria-hidden="true"
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-green-50 text-[11px] font-bold text-brand-dark"
        >
          {initials}
        </span>
        <span className="hidden truncate sm:inline sm:max-w-35">
          {activeUser.fullName}
        </span>
        <ChevronDown
          className="size-3.5 shrink-0 opacity-80"
          aria-hidden="true"
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        aria-label="Tài khoản khách hàng"
        className="w-56 rounded-xl border border-border-subtle bg-surface-card p-1.5 text-gray-800 shadow-lg ring-0"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2.5 py-2 font-normal">
            <p className="truncate text-xs font-bold text-gray-900">
              {activeUser.fullName}
            </p>
            <p className="truncate text-[11px] text-gray-500">
              {activeUser.email}
            </p>
          </DropdownMenuLabel>
        </DropdownMenuGroup>

        <DropdownMenuSeparator className="my-1 bg-border-subtle" />

        <DropdownMenuItem
          render={<Link href="/account/profile" prefetch={false} />}
          className="cursor-pointer rounded-lg px-2.5 py-2 text-xs font-semibold text-gray-700 focus:bg-accent focus:text-brand-forest"
        >
          <User className="size-4 shrink-0" aria-hidden="true" />
          <span>Tài khoản</span>
        </DropdownMenuItem>

        <DropdownMenuItem
          render={<Link href="/account/addresses" prefetch={false} />}
          className="cursor-pointer rounded-lg px-2.5 py-2 text-xs font-semibold text-gray-700 focus:bg-accent focus:text-brand-forest"
        >
          <MapPin className="size-4 shrink-0" aria-hidden="true" />
          <span>Sổ địa chỉ</span>
        </DropdownMenuItem>

        <DropdownMenuItem
          render={<Link href="/orders" />}
          className="cursor-pointer rounded-lg px-2.5 py-2 text-xs font-semibold text-gray-700 focus:bg-accent focus:text-brand-forest"
        >
          <Package className="size-4 shrink-0" aria-hidden="true" />
          <span>Đơn hàng của tôi</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="my-1 bg-border-subtle" />

        <DropdownMenuItem
          variant="destructive"
          disabled={isLoggingOut}
          closeOnClick={false}
          onClick={onLogout}
          className="cursor-pointer rounded-lg px-2.5 py-2 text-xs font-semibold"
        >
          <LogOut className="size-4 shrink-0" aria-hidden="true" />
          <span>{isLoggingOut ? "Đang đăng xuất..." : "Đăng xuất"}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Interactive customer auth control rendered inside `StorefrontHeader`.
 * Hydrates from SSR `<Suspense>` props without guest-to-user flicker and syncs logout across tabs.
 */
export function HeaderAuthControls({
  initialUser,
  initialAddresses = null,
}: HeaderAuthControlsProps) {
  const router = useRouter();
  const storeUser = useAuthStore((state) => state.user);
  const isHydrated = useAuthStore((state) => state.isHydrated);
  const setUser = useAuthStore((state) => state.setUser);
  const clearSession = useAuthStore((state) => state.clearSession);
  const setAddresses = useDeliveryAddressStore((state) => state.setAddresses);
  const clearDeliveryState = useDeliveryAddressStore(
    (state) => state.clearDeliveryState,
  );

  const [menuOpen, setMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    setUser(initialUser);
    if (initialUser && initialAddresses) {
      setAddresses(initialAddresses);
    } else if (!initialUser) {
      clearDeliveryState();
    }
  }, [
    clearDeliveryState,
    initialAddresses,
    initialUser,
    setAddresses,
    setUser,
  ]);

  useEffect(() => {
    return subscribeAuthEvents((eventType) => {
      clearDeliveryState();
      if (eventType === "LOGOUT") {
        clearSession();
        setMenuOpen(false);
      }
      router.refresh();
    });
  }, [clearDeliveryState, clearSession, router]);

  async function handleLogout() {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);
    try {
      const result = await performStorefrontLogout();
      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      setMenuOpen(false);
      toast.success("Đã đăng xuất tài khoản");
      router.refresh();
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
      onMenuOpenChange={setMenuOpen}
      onLogout={() => void handleLogout()}
    />
  );
}
