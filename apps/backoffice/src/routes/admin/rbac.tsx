import { Alert, AlertDescription, AlertTitle } from "@greenroots/ui";
import { createFileRoute } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { StaffRbacPanel } from "@/features/admin/components/staff-rbac-panel";
import { useAuthStore } from "@/features/auth/stores/auth.store";

export const Route = createFileRoute("/admin/rbac")({
  component: AdminRbacPage,
});

/**
 * Dedicated SuperAdmin Staff & RBAC management page using full content width for the data table.
 */
function AdminRbacPage() {
  const user = useAuthStore((state) => state.user);

  if (user?.role !== "super_admin") {
    return (
      <div className="mx-auto max-w-3xl py-6">
        <Alert variant="destructive" role="alert">
          <ShieldAlert aria-hidden="true" />
          <AlertTitle>Không có quyền truy cập (403)</AlertTitle>
          <AlertDescription>
            Chức năng quản trị nhân sự và phân quyền RBAC chỉ dành cho tài khoản
            Quản trị viên cấp cao (SuperAdmin).
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
          Hệ thống
        </p>
        <h1 className="text-2xl font-bold text-gray-900">
          Nhân sự &amp; Phân quyền
        </h1>
        <p className="text-sm text-gray-600">
          Quản lý tài khoản nhân viên nội bộ, phân quyền RBAC và thu hồi phiên
          đăng nhập tức thời theo ADR-0019.
        </p>
      </div>

      <StaffRbacPanel currentUserId={user.id} />
    </div>
  );
}
