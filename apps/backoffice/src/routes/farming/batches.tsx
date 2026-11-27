import { Card, CardContent } from "@greenroots/ui";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/page-header";

export const Route = createFileRoute("/farming/batches")({
  component: () => (
    <div className="flex w-full flex-col gap-6">
      <PageHeader
        eyebrow="Canh tác"
        title="Lô thu hoạch"
        description="Nhập sản lượng thu hoạch, sinh tem QR nhiệt và lập phiếu đề xuất xuất hủy."
      />
      <Card className="border-border-subtle bg-surface-card">
        <CardContent className="py-8 text-sm text-gray-600">
          Chức năng đang được triển khai ở đợt tiếp theo.
        </CardContent>
      </Card>
    </div>
  ),
});
