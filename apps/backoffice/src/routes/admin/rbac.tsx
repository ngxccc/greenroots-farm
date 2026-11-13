import { Card, CardContent, CardHeader, CardTitle } from "@greenroots/ui";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/rbac")({
  component: () => (
    <Card className="border-border-subtle bg-white">
      <CardHeader>
        <CardTitle>BO-10 · Phân Quyền RBAC &amp; Cấu Hình</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-gray-600">
        Quản lý tài khoản nội bộ và cấu hình động bảng farms.
      </CardContent>
    </Card>
  ),
});
