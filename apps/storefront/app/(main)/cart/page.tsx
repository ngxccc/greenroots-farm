import type { Metadata } from "next";
import { CartPageView } from "@/features/orders";

export const metadata: Metadata = {
  title: "Giỏ hàng",
};

export default function CartPage() {
  return <CartPageView />;
}
