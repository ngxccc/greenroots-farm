import { Card, CardContent, CardHeader, CardTitle } from "@greenroots/ui";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/farming/plots")({
  component: () => (
    <Card className="border-border-subtle bg-white">
      <CardHeader>
        <CardTitle>BO-01 · Quản Lý Mùa Vụ &amp; Lô Đất</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-gray-600">
        Hiển thị mã thửa đất, mùa vụ và chỉ số xét nghiệm đất/nước.
      </CardContent>
    </Card>
  ),
});
