import { Suspense } from "react";
import { ComplaintView } from "@/features/orders/components/complaint-view";

async function ComplaintContent({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ComplaintView orderId={id} />;
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
