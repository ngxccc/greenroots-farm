import { Card, CardContent, CardHeader, CardTitle } from "@greenroots/ui";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/inventory/waste")({
  component: () => (
    <Card className="border-border-subtle bg-white">
      <CardHeader>
        <CardTitle>BO-06 · Phê Duyệt Xuất Hủy 2 Bước</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-gray-600">
        Thẩm định bằng chứng cân đo hiện trường và chính thức trừ tồn kho thực
        tế.
      </CardContent>
    </Card>
  ),
});
