import { createFileRoute, redirect } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/page-header";
import { canAccessOperationsAnalytics } from "@/features/analytics/analytics-utils";
import { OperationsAnalyticsView } from "@/features/analytics/components/operations-analytics-view";
import {
  getDefaultRouteForRole,
  useAuthStore,
} from "@/features/auth/stores/auth.store";

export const Route = createFileRoute("/analytics")({
  beforeLoad: () => {
    const role = useAuthStore.getState().user?.role;
    if (role && !canAccessOperationsAnalytics(role)) {
      // oxlint-disable-next-line typescript/only-throw-error
      throw redirect({ to: getDefaultRouteForRole(role) });
    }
  },
  component: OperationsAnalyticsPage,
});

function OperationsAnalyticsPage() {
  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader
        eyebrow="Sản phẩm & Tài chính"
        title="Báo cáo vận hành"
        description="Theo dõi doanh thu gộp, tỷ lệ hao hụt theo lô và nhóm sản phẩm bán chạy."
      />
      <OperationsAnalyticsView />
    </div>
  );
}
