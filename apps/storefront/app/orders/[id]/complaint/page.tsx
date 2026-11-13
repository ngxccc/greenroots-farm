import { Suspense } from "react";
import { Card, CardContent } from "@greenroots/ui";
import { FARM_METADATA } from "@/constants/farm-metadata.constant";

async function ComplaintContent({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="mx-auto max-w-xl px-3 pt-[152px] pb-12 lg:px-4 lg:pt-[124px]">
      <Card className="border-border-subtle bg-white">
        <CardContent className="space-y-2 p-6">
          <h1 className="text-lg font-extrabold text-red-600">
            Khiếu nại đơn hàng trong {FARM_METADATA.complaintWindowHours}h
            (SF-05)
          </h1>
          <p className="text-xs text-gray-600">
            Mã đơn hàng: <strong>{id}</strong>. Yêu cầu tải 1–5 ảnh bằng chứng
            nông sản dập nát trước khi gửi về bộ phận CSKH.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function OrderComplaintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-xl px-4 pt-[152px] pb-12 text-sm text-gray-500">
          Đang tải biểu mẫu khiếu nại...
        </div>
      }
    >
      <ComplaintContent params={params} />
    </Suspense>
  );
}
