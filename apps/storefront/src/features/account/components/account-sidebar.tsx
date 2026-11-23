"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Button,
  Card,
  CardContent,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
} from "@greenroots/ui";
import { Calendar, LogOut, MapPin, PanelLeft, ShieldCheck } from "lucide-react";
import { ConfirmActionDialog } from "@/components/common/confirm-action-dialog";
import { performStorefrontLogout } from "@/lib/auth/client-logout";
import { getUserInitials } from "@/lib/format";
import { useAuthStore } from "@/stores/auth.store";
import type { StorefrontSessionUser } from "@/types/auth.types";

/**
 * Active customer account sub-route key highlighted in `AccountSidebar`.
 */
export type AccountSidebarSection = "profile" | "addresses";

const ACCOUNT_NAV_ITEMS = [
  {
    key: "profile",
    href: "/account/profile",
    label: "Hồ sơ & Bảo mật",
    icon: ShieldCheck,
  },
  {
    key: "addresses",
    href: "/account/addresses",
    label: "Sổ địa chỉ",
    icon: MapPin,
  },
  {
    key: "subscriptions",
    href: "/subscriptions",
    label: "Gói rau định kỳ",
    icon: Calendar,
  },
] as const;

interface AccountSidebarProps {
  readonly user: StorefrontSessionUser;
  readonly activeSection?: AccountSidebarSection;
}

interface AccountSidebarViewProps {
  readonly user: StorefrontSessionUser;
  readonly activeSection?: AccountSidebarSection;
  readonly mobileSheetOpen?: boolean;
  readonly logoutDialogOpen?: boolean;
  readonly isLoggingOut?: boolean;
  readonly logoutError?: string | null;
  readonly onMobileSheetOpenChange?: (open: boolean) => void;
  readonly onLogoutDialogOpenChange?: (open: boolean) => void;
  readonly onConfirmLogout?: () => void;
}

interface SidebarNavBodyProps {
  readonly user: StorefrontSessionUser;
  readonly activeSection: AccountSidebarSection;
  readonly isLoggingOut: boolean;
  readonly onNavigate?: () => void;
  readonly onRequestLogout: () => void;
}

function SidebarNavBody({
  user,
  activeSection,
  isLoggingOut,
  onNavigate,
  onRequestLogout,
}: SidebarNavBodyProps) {
  const initials = getUserInitials(user.fullName);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-3 border-b border-border-subtle pb-4">
        <span
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-green-50 text-sm font-bold text-brand-dark"
        >
          {initials}
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-bold text-gray-900">
            {user.fullName}
          </span>
          <span className="truncate text-xs text-gray-500 tabular-nums">
            {user.phone ?? "Chưa cập nhật SĐT"}
          </span>
        </div>
      </div>

      <nav aria-label="Danh mục tài khoản" className="flex flex-col gap-1">
        {ACCOUNT_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isCurrent = item.key === activeSection;
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={isCurrent ? "page" : undefined}
              onClick={onNavigate}
              className={
                isCurrent
                  ? "flex w-full items-center gap-2 rounded-lg bg-green-50 px-3 py-2.5 text-xs font-semibold text-brand-dark transition-colors focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:outline-none"
                  : "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100 hover:text-brand-dark focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:outline-none"
              }
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-border-subtle pt-2.5">
        <Button
          type="button"
          variant="ghost"
          disabled={isLoggingOut}
          onClick={onRequestLogout}
          className="h-auto w-full cursor-pointer justify-start gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 hover:text-status-spoiled focus-visible:ring-2 focus-visible:ring-brand-forest"
        >
          <LogOut className="size-4 shrink-0" aria-hidden="true" />
          <span>Đăng xuất</span>
        </Button>
      </div>
    </div>
  );
}

/**
 * Responsive account navigation sidebar following the Shadcn sidebar pattern:
 * collapsible left `Sheet` trigger bar on mobile (`< lg`) and full left rail on desktop (`>= lg`),
 * linking strictly to implemented Storefront routes (`UI-4`) with dialog-confirmed logout.
 *
 * @param props Customer identity, mobile sheet / logout dialog states, and action callbacks.
 * @returns Responsive account navigation sidebar and confirmation modal.
 */
export function AccountSidebarView({
  user,
  activeSection = "profile",
  mobileSheetOpen = false,
  logoutDialogOpen = false,
  isLoggingOut = false,
  logoutError = null,
  onMobileSheetOpenChange,
  onLogoutDialogOpenChange,
  onConfirmLogout,
}: AccountSidebarViewProps) {
  const activeNavLabel =
    ACCOUNT_NAV_ITEMS.find((item) => item.key === activeSection)?.label ??
    "Hồ sơ & Bảo mật";

  function handleRequestLogoutFromMobileSheet() {
    // Close drawer before opening confirmation Dialog so overlays never stack on mobile.
    onMobileSheetOpenChange?.(false);
    onLogoutDialogOpenChange?.(true);
  }

  return (
    <aside className="lg:col-span-3">
      {/* Compact mobile trigger bar collapsing sidebar into a left Sheet drawer (< lg) */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-surface-card px-3 py-2 shadow-sm lg:hidden">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Mở danh mục tài khoản"
          onClick={() => onMobileSheetOpenChange?.(true)}
          className="h-8 cursor-pointer gap-2 px-2 text-xs font-semibold text-gray-800 hover:bg-gray-100"
        >
          <PanelLeft className="size-4 text-brand-forest" aria-hidden="true" />
          <span>{activeNavLabel}</span>
        </Button>
        <span className="truncate text-xs font-medium text-gray-500">
          {user.fullName}
        </span>
      </div>

      {/* Desktop static sidebar (>= lg) */}
      <Card className="hidden border-border-subtle bg-surface-card py-0 shadow-sm lg:block">
        <CardContent className="p-4">
          <SidebarNavBody
            user={user}
            activeSection={activeSection}
            isLoggingOut={isLoggingOut}
            onRequestLogout={() => onLogoutDialogOpenChange?.(true)}
          />
        </CardContent>
      </Card>

      {/* Mobile slide-over Sheet drawer */}
      <Sheet open={mobileSheetOpen} onOpenChange={onMobileSheetOpenChange}>
        <SheetContent side="left" className="w-72 bg-surface-card p-0 sm:w-80">
          <SheetHeader className="border-b border-border-subtle px-4 py-3.5 text-left">
            <SheetTitle className="text-sm font-bold text-gray-900">
              Tài khoản GreenRoots
            </SheetTitle>
            <SheetDescription className="sr-only">
              Điều hướng danh mục tài khoản và đăng xuất khỏi thiết bị hiện tại.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 p-4">
            <SidebarNavBody
              user={user}
              activeSection={activeSection}
              isLoggingOut={isLoggingOut}
              onNavigate={() => onMobileSheetOpenChange?.(false)}
              onRequestLogout={handleRequestLogoutFromMobileSheet}
            />
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmActionDialog
        open={logoutDialogOpen}
        onOpenChange={onLogoutDialogOpenChange}
        title="Xác nhận đăng xuất?"
        description="Bạn sẽ đăng xuất khỏi tài khoản GreenRoots Farm trên trình duyệt này và cần đăng nhập lại khi đặt hàng."
        confirmLabel="Đăng xuất"
        pendingLabel="Đang đăng xuất..."
        isPending={isLoggingOut}
        errorMessage={logoutError}
        onConfirm={onConfirmLogout}
      />
    </aside>
  );
}

/**
 * Navigation and customer summary sidebar rendered in persistent `/account/layout.tsx`.
 * Derives active tab from `usePathname()` and subscribes to `useAuthStore` so profile updates sync live.
 *
 * @param props Initial server-fetched `StorefrontSessionUser` and optional explicit active section.
 * @returns Stateful sidebar container handling mobile drawer and single-device logout confirmation.
 */
export function AccountSidebar({ user, activeSection }: AccountSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const storeUser = useAuthStore((state) => state.user);
  const resolvedSection: AccountSidebarSection =
    activeSection ??
    (pathname.startsWith("/account/addresses") ? "addresses" : "profile");
  const displayUser = storeUser ?? user;

  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  function handleDialogOpenChange(open: boolean) {
    if (isLoggingOut) {
      return;
    }
    setLogoutDialogOpen(open);
    if (!open) {
      setLogoutError(null);
    }
  }

  async function handleConfirmLogout() {
    if (isLoggingOut) {
      return;
    }

    setLogoutError(null);
    setIsLoggingOut(true);
    try {
      const result = await performStorefrontLogout();
      if (!result.ok) {
        setLogoutError(result.message);
        return;
      }

      setLogoutDialogOpen(false);
      router.replace("/");
      router.refresh();
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <AccountSidebarView
      user={displayUser}
      activeSection={resolvedSection}
      mobileSheetOpen={mobileSheetOpen}
      logoutDialogOpen={logoutDialogOpen}
      isLoggingOut={isLoggingOut}
      logoutError={logoutError}
      onMobileSheetOpenChange={setMobileSheetOpen}
      onLogoutDialogOpenChange={handleDialogOpenChange}
      onConfirmLogout={() => void handleConfirmLogout()}
    />
  );
}

/**
 * Streaming skeleton placeholder rendered once in `/account/layout.tsx` while resolving sidebar user state.
 */
export function AccountSidebarSkeleton() {
  return (
    <div aria-hidden="true" className="lg:col-span-3">
      <Skeleton className="h-12 w-full rounded-xl lg:h-60" />
    </div>
  );
}
