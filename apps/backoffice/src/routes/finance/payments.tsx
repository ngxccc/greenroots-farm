import { Card, CardContent, CardHeader, CardTitle } from "@greenroots/ui";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/finance/payments")({
  component: () => (
    <Card className="border-border-subtle bg-white">
      <CardHeader>
        <CardTitle>BO-09 · Đối Soát Dòng Tiền &amp; PayOS</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-gray-600">
        Sổ cái thanh toán tổng hợp đối soát mã giao dịch PayOS và COD.
      </CardContent>
    </Card>
  ),
});
