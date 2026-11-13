import { Card, CardContent, CardHeader, CardTitle } from "@greenroots/ui";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/orders/complaints")({
  component: () => (
    <Card className="border-border-subtle bg-white">
      <CardHeader>
        <CardTitle>BO-05 · Sơ Duyệt Khiếu Nại Bồi Hoàn</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-gray-600">
        Kiểm tra ảnh dập nát, video đối chiếu tem QR trong 24h.
      </CardContent>
    </Card>
  ),
});
