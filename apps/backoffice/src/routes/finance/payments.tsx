import { createFileRoute } from "@tanstack/react-router";
import { PaymentsCashflowView } from "@/features/finance/components/payments-cashflow-view";

export const Route = createFileRoute("/finance/payments")({
  component: PaymentsCashflowView,
});
