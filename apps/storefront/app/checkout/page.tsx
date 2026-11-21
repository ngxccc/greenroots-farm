import { Suspense } from "react";
import { CheckoutView } from "@/features/checkout/components/checkout-view";

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-screen-xl px-4 pt-[152px] pb-12 text-sm text-gray-500">
          Đang tải trang thanh toán đơn hàng...
        </div>
      }
    >
      <CheckoutView />
    </Suspense>
  );
}
