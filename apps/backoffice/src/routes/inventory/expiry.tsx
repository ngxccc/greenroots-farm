import { Card, CardContent, CardHeader, CardTitle } from "@greenroots/ui";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/inventory/expiry")({
  component: () => (
    <Card className="border-border-subtle bg-white">
      <CardHeader>
        <CardTitle>BO-07 · Cảnh Báo Hạn &amp; Kích Hoạt Sale</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-gray-600">
        Theo dõi lô cận hạn dưới 48 giờ và bật Flash Sale 50% trên Storefront.
      </CardContent>
    </Card>
  ),
});
