import { connection } from "next/server";
import { Suspense } from "react";
import { Skeleton } from "@greenroots/ui";
import { TraceLookupView } from "@/features/traceability/components/trace-lookup-view";
import { fetchRecentTraceBatches } from "@/features/traceability/services/trace.service";

async function TraceDirectoryContent() {
  await connection();
  const records = await fetchRecentTraceBatches(4);
  return <TraceLookupView records={records} />;
}

function TraceDirectorySkeleton() {
  return (
    <div
      aria-hidden="true"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:px-6"
    >
      <Skeleton className="h-4 w-48 bg-gray-200" />

      <div className="grid grid-cols-1 items-center gap-8 border-b border-border-subtle pb-8 lg:grid-cols-12">
        <div className="flex flex-col gap-4 lg:col-span-7">
          <Skeleton className="h-10 w-3/4 bg-gray-200" />
          <Skeleton className="h-12 w-full bg-gray-100" />
          <div className="flex gap-2">
            <Skeleton className="h-11 flex-1 rounded-lg bg-surface-warm" />
            <Skeleton className="h-11 w-36 rounded-lg bg-green-100/70" />
          </div>
        </div>
        <div className="flex flex-col gap-4 lg:col-span-5 lg:border-l lg:border-border-subtle lg:pl-8">
          <Skeleton className="h-14 w-full rounded-md bg-gray-100" />
          <Skeleton className="h-12 w-full bg-gray-100" />
          <Skeleton className="h-10 w-full rounded-lg bg-green-100/70" />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-56 bg-gray-200" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="flex flex-col overflow-hidden rounded-lg border border-border-subtle bg-surface-card"
            >
              <Skeleton className="h-40 w-full rounded-none bg-green-50" />
              <div className="space-y-2 p-4">
                <Skeleton className="h-4 w-2/3 bg-gray-200" />
                <Skeleton className="h-5 w-4/5 bg-gray-200" />
                <Skeleton className="h-4 w-full bg-gray-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Public QR traceability lookup landing page (`/trace`).
 */
export default function TraceDirectoryPage() {
  return (
    <Suspense fallback={<TraceDirectorySkeleton />}>
      <TraceDirectoryContent />
    </Suspense>
  );
}
