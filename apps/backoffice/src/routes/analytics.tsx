import { Card, CardContent } from "@greenroots/ui";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/page-header";

export const Route = createFileRoute("/analytics")({
  component: OperationsAnalyticsPage,
});

function OperationsAnalyticsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sản phẩm & Tài chính"
        title="Báo cáo vận hành"
        description="Theo dõi doanh thu, tỷ lệ hao hụt và sản phẩm bán chạy."
      />
      <Card className="border-border-subtle bg-surface-card shadow-sm">
        <CardContent className="p-6 text-sm text-gray-600">
          Biểu đồ vận hành đang được tích hợp.
        </CardContent>
      </Card>
    </div>
  );
}
