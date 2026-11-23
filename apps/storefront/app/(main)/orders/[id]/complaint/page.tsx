import { Suspense } from "react";
import { Card, CardContent, Skeleton } from "@greenroots/ui";
import { FARM_METADATA } from "@/constants/farm-metadata.constant";

async function ComplaintContent({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="mx-auto max-w-xl px-4 py-8 lg:px-6">
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
        <div aria-hidden="true" className="mx-auto max-w-xl px-4 py-8 lg:px-6">
          <div className="space-y-3 rounded-xl border border-border-subtle bg-white p-6">
            <Skeleton className="h-6 w-3/4 bg-gray-200" />
            <Skeleton className="h-4 w-full bg-gray-200" />
            <Skeleton className="h-4 w-5/6 bg-gray-200" />
          </div>
        </div>
      }
    >
      <ComplaintContent params={params} />
    </Suspense>
  );
}
