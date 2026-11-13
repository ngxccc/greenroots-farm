import { Card, CardContent, CardHeader, CardTitle } from "@greenroots/ui";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/farming/batches")({
  component: () => (
    <Card className="border-border-subtle bg-white">
      <CardHeader>
        <CardTitle>BO-03 · Khởi Tạo Lô &amp; Đề Xuất Hủy</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-gray-600">
        Nhập sản lượng thu hoạch, sinh tem QR nhiệt và lập phiếu đề xuất xuất
        hủy.
      </CardContent>
    </Card>
  ),
});
