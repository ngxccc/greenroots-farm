import { Card, CardContent, CardHeader, CardTitle } from "@greenroots/ui";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/catalog/plans")({
  component: () => (
    <Card className="border-border-subtle bg-white">
      <CardHeader>
        <CardTitle>BO-08 · Quản Lý Gói Rau &amp; Báo Cáo Kho</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-gray-600">
        Cấu hình gói định kỳ và thống kê tỷ lệ hao hụt sau thu hoạch.
      </CardContent>
    </Card>
  ),
});
