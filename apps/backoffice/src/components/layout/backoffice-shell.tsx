import type { UserRole } from "@greenroots/shared";
import { Badge, Button, cn } from "@greenroots/ui";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  AlertTriangle,
  Boxes,
  CalendarClock,
  ClipboardCheck,
  FileWarning,
  Leaf,
  LogOut,
  PackageCheck,
  Receipt,
  ShieldCheck,
  Sprout,
  Truck,
} from "lucide-react";
import type { ReactNode } from "react";
import { fetchApiHealth } from "@/lib/api-client";
import { getDefaultRouteForRole, useAuthStore } from "@/stores/auth.store";

interface NavItem {
  readonly to: string;
  readonly label: string;
  readonly code: string;
  readonly icon: ReactNode;
  readonly roles: readonly UserRole[];
}

const NAV_ITEMS: readonly NavItem[] = [
  {
    to: "/farming/plots",
    label: "Mùa vụ & Đất",
    code: "BO-01",
    icon: <Sprout className="size-5" />,
    roles: ["farm_staff", "admin", "super_admin"],
  },
  {
    to: "/farming/logs",
    label: "Nhật ký",
    code: "BO-02",
    icon: <ClipboardCheck className="size-5" />,
    roles: ["farm_staff", "admin", "super_admin"],
  },
  {
    to: "/farming/batches",
    label: "Lô & Đề xuất hủy",
    code: "BO-03",
    icon: <Boxes className="size-5" />,
    roles: ["farm_staff", "admin", "super_admin"],
  },
  {
    to: "/orders",
    label: "Đơn & FEFO",
    code: "BO-04",
    icon: <Truck className="size-4" />,
    roles: ["sales", "admin", "super_admin"],
  },
  {
    to: "/orders/complaints",
    label: "Khiếu nại",
    code: "BO-05",
    icon: <FileWarning className="size-4" />,
    roles: ["sales", "admin", "super_admin"],
  },
  {
    to: "/inventory/waste",
    label: "Duyệt xuất hủy",
    code: "BO-06",
    icon: <PackageCheck className="size-4" />,
    roles: ["admin", "super_admin"],
  },
  {
    to: "/inventory/expiry",
    label: "Cận hạn & Sale",
    code: "BO-07",
    icon: <AlertTriangle className="size-4" />,
    roles: ["admin", "super_admin"],
  },
  {
    to: "/catalog/plans",
    label: "Gói & Báo cáo",
    code: "BO-08",
    icon: <CalendarClock className="size-4" />,
    roles: ["admin", "super_admin"],
  },
  {
    to: "/finance/payments",
    label: "Đối soát PayOS",
    code: "BO-09",
    icon: <Receipt className="size-4" />,
    roles: ["super_admin"],
  },
  {
    to: "/admin/rbac",
    label: "RBAC & Cấu hình",
    code: "BO-10",
    icon: <ShieldCheck className="size-4" />,
    roles: ["super_admin"],
  },
];

export function BackofficeShell({
  children,
}: {
  readonly children: ReactNode;
}) {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const loginDemoRole = useAuthStore((state) => state.loginDemoRole);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const { data: health } = useQuery({
    queryKey: ["api-health"],
    queryFn: fetchApiHealth,
    refetchInterval: 30_000,
  });

  if (!user) {
    return <>{children}</>;
  }

  const isFarmStaff = user.role === "farm_staff";
  const visibleItems = NAV_ITEMS.filter((item) =>
    item.roles.includes(user.role),
  );

  function handleRoleSwitch(role: UserRole) {
    loginDemoRole(role);
    void navigate({ to: getDefaultRouteForRole(role) });
  }

  function handleLogout() {
    logout();
    void navigate({ to: "/login" });
  }

  if (isFarmStaff) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-surface-warm">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border-subtle bg-white px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-brand-forest text-white">
              <Leaf className="size-5" />
            </span>
            <div>
              <p className="text-sm font-bold text-gray-900">GreenRoots Farm</p>
              <p className="text-xs text-gray-500">{user.fullName}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            aria-label="Đăng xuất"
            className="min-h-12 min-w-12"
          >
            <LogOut className="size-5 text-gray-600" />
          </Button>
        </header>

        <main className="flex-1 p-4 pb-24">{children}</main>

        <nav className="fixed right-0 bottom-0 left-0 z-20 mx-auto grid max-w-md grid-cols-3 border-t border-border-subtle bg-white">
          {visibleItems.map((item) => {
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-semibold transition",
                  active
                    ? "bg-green-50 text-brand-forest"
                    : "text-gray-500 hover:text-gray-900",
                )}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh bg-surface-warm">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border-subtle bg-white">
        <div className="flex items-center gap-2.5 border-b border-border-subtle px-4 py-4">
          <span className="flex size-9 items-center justify-center rounded-xl bg-brand-forest text-white">
            <Leaf className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold text-gray-900">
              GreenRoots Desk
            </p>
            <p className="truncate text-xs text-gray-500">{user.role}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {visibleItems.map((item) => {
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold transition",
                  active
                    ? "bg-brand-forest text-white"
                    : "text-gray-700 hover:bg-green-50 hover:text-brand-forest",
                )}
              >
                <span className="flex items-center gap-2.5">
                  {item.icon}
                  <span>{item.label}</span>
                </span>
                <span
                  className={cn(
                    "text-[11px]",
                    active ? "text-green-100" : "text-gray-400",
                  )}
                >
                  {item.code}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="space-y-3 border-t border-border-subtle p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">API :3000</span>
            <Badge
              variant={health?.reachable ? "secondary" : "destructive"}
              className="text-[11px]"
            >
              {health?.reachable ? "Online" : "Offline"}
            </Badge>
          </div>
          {import.meta.env.DEV ? (
            <div className="grid grid-cols-2 gap-1.5">
              {(["farm_staff", "sales", "admin", "super_admin"] as const).map(
                (r) => (
                  <Button
                    key={r}
                    size="xs"
                    variant={user.role === r ? "default" : "outline"}
                    onClick={() => handleRoleSwitch(r)}
                    className="text-[11px]"
                  >
                    {r}
                  </Button>
                ),
              )}
            </div>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            className="w-full justify-start gap-2"
          >
            <LogOut className="size-4" />
            <span>Đăng xuất</span>
          </Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-6">{children}</main>
    </div>
  );
}
