import { Card, CardContent } from "@greenroots/ui";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/page-header";

export const Route = createFileRoute("/inventory/expiry")({
  component: () => (
    <div className="flex w-full flex-col gap-6">
      <PageHeader
        eyebrow="Bán hàng & Kho"
        title="Hàng cận hạn"
        description="Theo dõi lô cận hạn dưới 48 giờ và bật Flash Sale trên Storefront."
      />
      <Card className="border-border-subtle bg-surface-card">
        <CardContent className="py-8 text-sm text-gray-600">
          Chức năng đang được triển khai ở đợt tiếp theo.
        </CardContent>
      </Card>
    </div>
  ),
});
