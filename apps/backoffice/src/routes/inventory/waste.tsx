import { UserRole } from "@greenroots/shared";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/page-header";
import {
  getDefaultRouteForRole,
  useAuthStore,
} from "@/features/auth/stores/auth.store";
import { WasteApprovalView } from "@/features/inventory/components/waste-approval-view";

export const Route = createFileRoute("/inventory/waste")({
  beforeLoad: () => {
    const role = useAuthStore.getState().user?.role;
    if (role && role !== UserRole.ADMIN && role !== UserRole.SUPER_ADMIN) {
      // oxlint-disable-next-line typescript/only-throw-error
      throw redirect({ to: getDefaultRouteForRole(role) });
    }
  },
  component: WasteApprovalPage,
});

function WasteApprovalPage() {
  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader
        eyebrow="Bán hàng & Kho"
        title="Duyệt xuất hủy"
        description="Thẩm định bằng chứng cân đo hiện trường và chính thức trừ tồn kho thực tế."
      />
      <WasteApprovalView />
    </div>
  );
}
