import { Suspense } from "react";
import { TraceView } from "@/features/traceability/components/trace-view";
import { getShowcaseTraceByCode } from "@/services/storefront.service";

async function CachedBatchTrace({ batchCode }: { readonly batchCode: string }) {
  "use cache";
  const record = await Promise.resolve(getShowcaseTraceByCode(batchCode));
  return <TraceView record={record} batchCode={batchCode} />;
}

async function TraceParamsLoader({
  params,
}: {
  readonly params: Promise<{ batchCode: string }>;
}) {
  const { batchCode } = await params;
  return <CachedBatchTrace batchCode={decodeURIComponent(batchCode)} />;
}

export default function TracePage({
  params,
}: {
  params: Promise<{ batchCode: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-2xl px-4 pt-[152px] pb-12 text-sm text-gray-500">
          Đang tải hồ sơ truy xuất nguồn gốc...
        </div>
      }
    >
      <TraceParamsLoader params={params} />
    </Suspense>
  );
}
