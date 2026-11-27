import { Card, CardContent } from "@greenroots/ui";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/page-header";

export const Route = createFileRoute("/catalog/plans")({
  component: () => (
    <div className="flex w-full flex-col gap-6">
      <PageHeader
        eyebrow="Sản phẩm & Tài chính"
        title="Gói định kỳ"
        description="Cấu hình gói rau định kỳ và thống kê tỷ lệ hao hụt sau thu hoạch."
      />
      <Card className="border-border-subtle bg-surface-card">
        <CardContent className="py-8 text-sm text-gray-600">
          Chức năng đang được triển khai ở đợt tiếp theo.
        </CardContent>
      </Card>
    </div>
  ),
});
