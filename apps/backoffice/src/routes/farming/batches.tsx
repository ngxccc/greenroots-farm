import { createFileRoute } from "@tanstack/react-router";
import { BatchesView } from "@/features/farming/batches/components/batches-view";

export const Route = createFileRoute("/farming/batches")({
  component: BatchesView,
});
