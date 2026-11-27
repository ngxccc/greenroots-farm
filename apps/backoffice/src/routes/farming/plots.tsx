import { createFileRoute } from "@tanstack/react-router";
import { PlotsSeasonsView } from "@/features/farming/components/plots-seasons-view";

export const Route = createFileRoute("/farming/plots")({
  component: PlotsSeasonsView,
});
