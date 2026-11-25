import type { Metadata } from "next";
import { CheckoutView } from "@/features/orders";

export const metadata: Metadata = {
  title: "Thanh toán đơn hàng",
};

export default function CheckoutPage() {
  return <CheckoutView />;
}
