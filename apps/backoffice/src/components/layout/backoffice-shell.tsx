import type { UserRole } from "@greenroots/shared";
import {
  Badge,
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@greenroots/ui";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  AlertTriangle,
  Boxes,
  CalendarClock,
  ChevronsUpDown,
  ClipboardCheck,
  FileWarning,
  FolderTree,
  Leaf,
  LogOut,
  PackageCheck,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  ShieldCheck,
  SlidersHorizontal,
  Sprout,
  Truck,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useAuthStore } from "@/features/auth/stores/auth.store";
import { fetchApiHealth, logoutStaffSession } from "@/lib/api-client";

interface NavItem {
  readonly to: string;
  readonly label: string;
  readonly icon: ReactNode;
  readonly roles: readonly UserRole[];
}

interface NavGroup {
  readonly title: string;
  readonly items: readonly NavItem[];
}

const ROLE_LABELS: Record<UserRole, string> = {
  guest: "Khách",
  customer: "Khách hàng",
  farm_staff: "Nhân viên nông trại",
  sales: "Nhân viên kinh doanh",
  admin: "Quản trị viên",
  super_admin: "Quản trị viên cấp cao",
};

const NAV_GROUPS: readonly NavGroup[] = [
  {
    title: "Nông trại & Canh tác",
    items: [
      {
        to: "/farming/plots",
        label: "Mùa vụ & Lô đất",
        icon: <Sprout className="size-4 shrink-0" aria-hidden="true" />,
        roles: ["farm_staff", "admin", "super_admin"],
      },
      {
        to: "/farming/logs",
        label: "Nhật ký canh tác",
        icon: <ClipboardCheck className="size-4 shrink-0" aria-hidden="true" />,
        roles: ["farm_staff", "admin", "super_admin"],
      },
      {
        to: "/farming/batches",
        label: "Lô thu hoạch & Tem QR",
        icon: <Boxes className="size-4 shrink-0" aria-hidden="true" />,
        roles: ["farm_staff", "admin", "super_admin"],
      },
    ],
  },
  {
    title: "Kho & Đơn hàng",
    items: [
      {
        to: "/orders",
        label: "Đơn hàng & Điều phối",
        icon: <Truck className="size-4 shrink-0" aria-hidden="true" />,
        roles: ["sales", "admin", "super_admin"],
      },
      {
        to: "/orders/complaints",
        label: "Khiếu nại",
        icon: <FileWarning className="size-4 shrink-0" aria-hidden="true" />,
        roles: ["sales", "admin", "super_admin"],
      },
      {
        to: "/inventory/waste",
        label: "Duyệt xuất hủy",
        icon: <PackageCheck className="size-4 shrink-0" aria-hidden="true" />,
        roles: ["admin", "super_admin"],
      },
      {
        to: "/inventory/expiry",
        label: "Cận hạn & Flash Sale",
        icon: <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />,
        roles: ["admin", "super_admin"],
      },
    ],
  },
  {
    title: "Danh mục & Tài chính",
    items: [
      {
        to: "/catalog/products",
        label: "Danh mục & Sản phẩm",
        icon: <FolderTree className="size-4 shrink-0" aria-hidden="true" />,
        roles: ["admin", "super_admin"],
      },
      {
        to: "/catalog/plans",
        label: "Gói rau định kỳ & Báo cáo",
        icon: <CalendarClock className="size-4 shrink-0" aria-hidden="true" />,
        roles: ["admin", "super_admin"],
      },
      {
        to: "/finance/payments",
        label: "Đối soát & Dòng tiền",
        icon: <Receipt className="size-4 shrink-0" aria-hidden="true" />,
        roles: ["super_admin"],
      },
    ],
  },
  {
    title: "Hệ thống",
    items: [
      {
        to: "/admin/rbac",
        label: "Nhân sự & Phân quyền",
        icon: <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />,
        roles: ["super_admin"],
      },
      {
        to: "/admin/settings",
        label: "Cấu hình Nông trại",
        icon: (
          <SlidersHorizontal className="size-4 shrink-0" aria-hidden="true" />
        ),
        roles: ["super_admin"],
      },
    ],
  },
];

function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return "GR";
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1];
  return `${first[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase();
}

/**
 * Shared Backoffice layout shell providing grouped desktop navigation, mobile farm-staff bottom bar,
 * and an account dropdown menu.
 */
export function BackofficeShell({
  children,
}: {
  readonly children: ReactNode;
}) {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("gr_bo_sidebar_collapsed") === "1";
    } catch {
      return false;
    }
  });

  function toggleSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(
          "gr_bo_sidebar_collapsed",
          next ? "1" : "0",
        );
      } catch {
        // Ignore storage quota or private-mode restrictions.
      }
      return next;
    });
  }

  const { data: health } = useQuery({
    queryKey: ["api-health"],
    queryFn: fetchApiHealth,
    enabled: Boolean(user),
    refetchInterval: 30_000,
  });

  if (!user) {
    return <>{children}</>;
  }

  const isFarmStaff = user.role === "farm_staff";
  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.roles.includes(user.role)),
  })).filter((group) => group.items.length > 0);
  const mobileItems = visibleGroups.flatMap((group) => group.items);
  const roleLabel = ROLE_LABELS[user.role];
  const initials = getInitials(user.fullName);

  async function handleLogout() {
    await logoutStaffSession();
    void navigate({ to: "/login" });
  }

  if (isFarmStaff) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-surface-warm">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border-subtle bg-surface-card px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-lg bg-brand-forest text-white">
              <Leaf className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-bold text-gray-900">GreenRoots</p>
              <p className="text-xs text-brand-forest">Vận hành Nông trại</p>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Menu tài khoản"
                  className="h-10 gap-2 px-2"
                >
                  <span className="flex size-7 items-center justify-center rounded-full bg-green-50 text-xs font-semibold text-brand-dark">
                    {initials}
                  </span>
                  <ChevronsUpDown
                    className="size-3.5 text-gray-400"
                    aria-hidden="true"
                  />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="flex flex-col gap-0.5">
                  <span className="truncate text-sm font-semibold text-gray-900">
                    {user.fullName}
                  </span>
                  <span className="text-xs font-normal text-brand-forest">
                    {roleLabel}
                  </span>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => void handleLogout()}
              >
                <LogOut className="size-4" aria-hidden="true" />
                <span>Đăng xuất</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1 p-4 pb-24">{children}</main>

        <nav
          aria-label="Điều hướng nông trại"
          className="fixed right-0 bottom-0 left-0 z-20 mx-auto grid max-w-md grid-cols-3 border-t border-border-subtle bg-surface-card"
        >
          {mobileItems.map((item) => {
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-center text-[11px] font-semibold transition",
                  active
                    ? "bg-green-50 text-brand-dark"
                    : "text-gray-500 hover:text-gray-900",
                )}
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh bg-surface-warm">
      <aside
        className={cn(
          "sticky top-0 flex h-dvh shrink-0 flex-col justify-between border-r border-border-subtle bg-surface-card transition-[width] duration-200",
          sidebarCollapsed ? "w-16" : "w-64",
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div
            className={cn(
              "flex items-center border-b border-border-subtle py-4",
              sidebarCollapsed
                ? "justify-center px-2"
                : "justify-between gap-2 px-4",
            )}
          >
            {sidebarCollapsed ? null : (
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-forest text-white">
                  <Leaf className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-gray-900">
                    GreenRoots
                  </p>
                  <p className="truncate text-xs font-medium text-brand-forest">
                    Vận hành Nông trại
                  </p>
                </div>
              </div>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              aria-label={sidebarCollapsed ? "Mở rộng menu" : "Thu gọn menu"}
              aria-expanded={!sidebarCollapsed}
              title={sidebarCollapsed ? "Mở rộng menu" : "Thu gọn menu"}
              className="shrink-0 text-gray-500 hover:text-gray-900"
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="size-4" aria-hidden="true" />
              ) : (
                <PanelLeftClose className="size-4" aria-hidden="true" />
              )}
            </Button>
          </div>

          <nav
            aria-label="Điều hướng quản trị"
            className={cn(
              "flex-1 space-y-4 overflow-y-auto",
              sidebarCollapsed ? "p-2" : "p-3",
            )}
          >
            {visibleGroups.map((group, groupIndex) => (
              <div
                key={group.title}
                className={cn(
                  "space-y-1",
                  sidebarCollapsed && groupIndex > 0
                    ? "border-t border-border-subtle pt-3"
                    : undefined,
                )}
              >
                {sidebarCollapsed ? null : (
                  <p className="px-2.5 py-1 text-[11px] font-semibold tracking-wide text-gray-500 uppercase">
                    {group.title}
                  </p>
                )}
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = pathname === item.to;
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        aria-current={active ? "page" : undefined}
                        aria-label={sidebarCollapsed ? item.label : undefined}
                        title={sidebarCollapsed ? item.label : undefined}
                        className={cn(
                          "flex items-center rounded-lg py-2 text-sm transition-colors",
                          sidebarCollapsed
                            ? "justify-center px-2"
                            : "gap-2.5 px-2.5",
                          active
                            ? "bg-green-50 font-semibold text-brand-dark"
                            : "font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900",
                        )}
                      >
                        <span
                          className={cn(
                            active ? "text-brand-dark" : "text-gray-500",
                          )}
                        >
                          {item.icon}
                        </span>
                        {sidebarCollapsed ? null : (
                          <span className="truncate">{item.label}</span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>

        <div
          className={cn(
            "flex items-center border-t border-border-subtle",
            sidebarCollapsed
              ? "justify-center p-2"
              : "justify-between gap-2 p-3",
          )}
        >
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={sidebarCollapsed ? "Menu tài khoản" : undefined}
                  title={
                    sidebarCollapsed
                      ? `${user.fullName} (${roleLabel})`
                      : undefined
                  }
                  className={cn(
                    "h-auto",
                    sidebarCollapsed
                      ? "size-10 justify-center p-0"
                      : "min-w-0 flex-1 justify-between gap-2 px-2 py-1.5 text-left",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-green-50 text-xs font-semibold text-brand-dark">
                      {initials}
                    </span>
                    {sidebarCollapsed ? null : (
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-semibold text-gray-900">
                          {user.fullName}
                        </span>
                        <span className="truncate text-xs font-normal text-brand-forest">
                          {roleLabel}
                        </span>
                      </span>
                    )}
                  </span>
                  {sidebarCollapsed ? null : (
                    <ChevronsUpDown
                      className="size-4 shrink-0 text-gray-400"
                      aria-hidden="true"
                    />
                  )}
                </Button>
              }
            />
            <DropdownMenuContent side="top" align="start" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="flex flex-col gap-0.5">
                  <span className="truncate text-sm font-semibold text-gray-900">
                    {user.fullName}
                  </span>
                  <span className="text-xs font-normal text-gray-500">
                    {roleLabel}
                  </span>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <div className="flex items-center justify-between px-2 py-1.5 text-xs">
                <span className="text-gray-500">Trạng thái API</span>
                <Badge
                  variant={health?.reachable ? "secondary" : "destructive"}
                  className="text-[11px]"
                >
                  {health?.reachable ? "Online" : "Offline"}
                </Badge>
              </div>
              {user.role === "super_admin" ? (
                <DropdownMenuItem
                  onClick={() => void navigate({ to: "/admin/settings" })}
                >
                  <SlidersHorizontal className="size-4" aria-hidden="true" />
                  <span>Cấu hình Nông trại</span>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => void handleLogout()}
              >
                <LogOut className="size-4" aria-hidden="true" />
                <span>Đăng xuất</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-6">{children}</main>
    </div>
  );
}
