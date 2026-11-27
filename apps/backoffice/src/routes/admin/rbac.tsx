import { Alert, AlertDescription, AlertTitle } from "@greenroots/ui";
import { createFileRoute } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
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
      <PageHeader
        eyebrow="Hệ thống"
        title="Quản lý Nhân sự"
        description="Quản lý tài khoản nhân viên nội bộ, phân quyền vai trò và thu hồi phiên đăng nhập tức thời."
      />

      <StaffRbacPanel currentUserId={user.id} />
    </div>
  );
}
