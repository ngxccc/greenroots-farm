import {
  Alert,
  AlertDescription,
  AlertTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@greenroots/ui";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ShieldAlert, SlidersHorizontal, Users } from "lucide-react";
import { FarmSettingsPanel } from "@/features/admin/components/farm-settings-panel";
import { StaffRbacPanel } from "@/features/admin/components/staff-rbac-panel";
import {
  parseAdminRbacTab,
  type AdminRbacTab,
} from "@/features/admin/rbac-guards";
import { useAuthStore } from "@/features/auth/stores/auth.store";

interface AdminRbacSearch {
  readonly tab: AdminRbacTab;
}

export const Route = createFileRoute("/admin/rbac")({
  validateSearch: (search: Record<string, unknown>): AdminRbacSearch => ({
    tab: parseAdminRbacTab(search.tab),
  }),
  component: AdminRbacRouteComponent,
});

function AdminRbacRouteComponent() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const user = useAuthStore((state) => state.user);

  if (user?.role !== "super_admin") {
    return (
      <div className="mx-auto max-w-3xl py-6">
        <Alert variant="destructive">
          <ShieldAlert aria-hidden="true" />
          <AlertTitle>403 — Không có quyền truy cập</AlertTitle>
          <AlertDescription>
            Khu vực Quản trị Nhân sự (RBAC) và Cấu hình Nông trại chỉ dành cho
            tài khoản Quản trị cấp cao (Super Admin).
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  function handleTabChange(nextValue: string) {
    const nextTab = parseAdminRbacTab(nextValue);
    void navigate({
      search: { tab: nextTab },
      replace: true,
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
          BO-10 · Hệ thống &amp; Nông trại
        </p>
        <h1 className="text-2xl font-bold text-gray-900">
          Quản trị Nhân sự &amp; Cấu hình Nông trại
        </h1>
        <p className="text-sm text-gray-600">
          Quản lý tài khoản nhân viên, phân quyền RBAC, thu hồi phiên đăng nhập
          và cấu hình vận hành bảng farms.
        </p>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList className="h-10 bg-gray-100 p-1">
          <TabsTrigger
            value="staff"
            className="gap-2 px-4 data-active:bg-white data-active:font-bold data-active:text-gray-900"
          >
            <Users className="size-4" aria-hidden="true" />
            <span>Nhân sự &amp; Phân quyền</span>
          </TabsTrigger>
          <TabsTrigger
            value="farm"
            className="gap-2 px-4 data-active:bg-white data-active:font-bold data-active:text-gray-900"
          >
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            <span>Cấu hình Nông trại</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="staff" className="pt-2">
          <StaffRbacPanel currentUserId={user.id} />
        </TabsContent>

        <TabsContent value="farm" className="pt-2">
          <FarmSettingsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
