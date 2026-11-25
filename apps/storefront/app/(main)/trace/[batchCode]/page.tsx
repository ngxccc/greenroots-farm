import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Skeleton } from "@greenroots/ui";
import { TraceView } from "@/features/traceability/components/trace-view";
import { fetchTraceByBatchCode } from "@/features/traceability/services/trace.service";

function decodeBatchCodeParam(rawParam: string): string | null {
  try {
    return decodeURIComponent(rawParam);
  } catch {
    return null;
  }
}

async function BatchTraceContent({
  batchCode,
}: {
  readonly batchCode: string;
}) {
  await connection();
  const result = await fetchTraceByBatchCode(batchCode);
  if (result.ok) {
    return <TraceView record={result.data} batchCode={batchCode} />;
  }
  if (result.reason === "not_found") {
    notFound();
  }
  return <TraceView batchCode={batchCode} errorMessage={result.message} />;
}

async function TraceParamsLoader({
  params,
}: {
  readonly params: Promise<{ batchCode: string }>;
}) {
  const { batchCode } = await params;
  const decoded = decodeBatchCodeParam(batchCode);
  if (decoded === null) {
    notFound();
  }
  return <BatchTraceContent batchCode={decoded} />;
}

function BatchTraceSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6 lg:px-6"
    >
      <Skeleton className="h-4 w-64 bg-gray-200" />

      <div className="flex flex-col gap-6 border-b border-border-subtle pb-6">
        <div className="flex items-start gap-4">
          <Skeleton className="size-20 shrink-0 rounded-md bg-green-50" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-32 bg-gray-200" />
            <Skeleton className="h-8 w-64 bg-gray-200" />
            <Skeleton className="h-4 w-96 max-w-full bg-gray-100" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 border-t border-border-subtle pt-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-10 w-full bg-gray-100" />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 border-b border-border-subtle pb-6 lg:grid-cols-12">
        <div className="space-y-3 lg:col-span-5">
          <Skeleton className="h-6 w-48 bg-gray-200" />
          <Skeleton className="h-36 w-full bg-gray-100" />
        </div>
        <div className="space-y-3 lg:col-span-7 lg:border-l lg:border-border-subtle lg:pl-6">
          <Skeleton className="h-6 w-56 bg-gray-200" />
          <Skeleton className="h-44 w-full bg-gray-100" />
        </div>
      </div>

      <div className="space-y-4">
        <Skeleton className="h-6 w-64 bg-gray-200" />
        <Skeleton className="h-40 w-full bg-gray-100" />
      </div>
    </div>
  );
}

export default function TracePage({
  params,
}: {
  params: Promise<{ batchCode: string }>;
}) {
  return (
    <Suspense fallback={<BatchTraceSkeleton />}>
      <TraceParamsLoader params={params} />
    </Suspense>
  );
}
