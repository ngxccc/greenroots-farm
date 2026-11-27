import { Card, CardContent } from "@greenroots/ui";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/page-header";

export const Route = createFileRoute("/finance/payments")({
  component: () => (
    <div className="flex w-full flex-col gap-6">
      <PageHeader
        eyebrow="Sản phẩm & Tài chính"
        title="Đối soát thanh toán"
        description="Sổ cái thanh toán tổng hợp đối soát mã giao dịch PayOS và COD."
      />
      <Card className="border-border-subtle bg-surface-card">
        <CardContent className="py-8 text-sm text-gray-600">
          Chức năng đang được triển khai ở đợt tiếp theo.
        </CardContent>
      </Card>
    </div>
  ),
});
