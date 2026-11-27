import { createFileRoute } from "@tanstack/react-router";
import { FarmingLogsView } from "@/features/farming/components/logs-view";

export const Route = createFileRoute("/farming/logs")({
  component: FarmingLogsPage,
});

function FarmingLogsPage() {
  return <FarmingLogsView />;
}
