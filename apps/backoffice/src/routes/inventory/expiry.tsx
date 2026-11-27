import { BUSINESS_RULES, UserRole } from "@greenroots/shared";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/page-header";
import {
  getDefaultRouteForRole,
  useAuthStore,
} from "@/features/auth/stores/auth.store";
import { NearExpiryView } from "@/features/inventory/expiry/components/near-expiry-view";

export const Route = createFileRoute("/inventory/expiry")({
  beforeLoad: () => {
    const role = useAuthStore.getState().user?.role;
    if (role && role !== UserRole.ADMIN && role !== UserRole.SUPER_ADMIN) {
      // oxlint-disable-next-line typescript/only-throw-error
      throw redirect({ to: getDefaultRouteForRole(role) });
    }
  },
  component: NearExpiryPage,
});

function NearExpiryPage() {
  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader
        eyebrow="Bán hàng & Kho"
        title="Cảnh báo cận hạn & Flash Sale"
        description={`Theo dõi các lô hàng còn dưới ${BUSINESS_RULES.FLASH_SALE_HOURS_THRESHOLD} giờ sử dụng và bật giá giải cứu Flash Sale trên Storefront.`}
      />
      <NearExpiryView />
    </div>
  );
}
