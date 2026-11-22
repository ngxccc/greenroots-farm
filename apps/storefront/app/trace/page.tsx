import { TraceLookupView } from "@/features/traceability/components/trace-lookup-view";
import { getShowcaseTraceList } from "@/services/storefront.service";

/**
 * Public QR traceability lookup landing page (`/trace`).
 */
export default function TraceDirectoryPage() {
  return <TraceLookupView records={getShowcaseTraceList()} />;
}
