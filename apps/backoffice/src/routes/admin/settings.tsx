import { Alert, AlertDescription, AlertTitle } from "@greenroots/ui";
import { createFileRoute } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { FarmSettingsPanel } from "@/features/admin/components/farm-settings-panel";
import { useAuthStore } from "@/features/auth/stores/auth.store";

export const Route = createFileRoute("/admin/settings")({
  component: AdminFarmSettingsPage,
});

/**
 * Dedicated SuperAdmin Farm Settings page constrained to a comfortable form measure.
 */
function AdminFarmSettingsPage() {
  const user = useAuthStore((state) => state.user);

  if (user?.role !== "super_admin") {
    return (
      <div className="mx-auto max-w-3xl py-6">
        <Alert variant="destructive" role="alert">
          <ShieldAlert aria-hidden="true" />
          <AlertTitle>Không có quyền truy cập (403)</AlertTitle>
          <AlertDescription>
            Chức năng cấu hình nông trại chỉ dành cho tài khoản Quản trị viên
            cấp cao (SuperAdmin).
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
          Hệ thống
        </p>
        <h1 className="text-2xl font-bold text-gray-900">Cấu hình Nông trại</h1>
        <p className="text-sm text-gray-600">
          Quản lý hồ sơ pháp lý, tọa độ xuất phát, quy tắc bán kính giao hàng,
          Flash Sale, cổng thanh toán và chứng nhận VietGAP.
        </p>
      </div>

      <FarmSettingsPanel />
    </div>
  );
}
