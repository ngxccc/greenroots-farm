import Link from "next/link";
import { Card, CardContent, buttonVariants } from "@greenroots/ui";
import { ShoppingBag } from "lucide-react";

export default function CheckoutPage() {
  return (
    <div className="mx-auto max-w-2xl px-3 pt-[152px] pb-12 lg:px-4 lg:pt-[124px]">
      <Card className="border-border-subtle bg-white">
        <CardContent className="space-y-3 p-6">
          <h1 className="flex items-center gap-2 text-lg font-extrabold text-brand-dark">
            <ShoppingBag className="size-5 text-brand-forest" />
            Thanh toán đơn hàng (SF-05)
          </h1>
          <p className="text-xs text-gray-600">
            Luồng thanh toán COD / VietQR PayOS (đếm ngược 15 phút) và xác thực
            tồn kho FEFO sẽ kết nối trực tiếp khi OrdersModule hoàn tất.
          </p>
          <Link
            href="/"
            className={buttonVariants({
              variant: "outline",
              className: "font-bold",
            })}
          >
            Tiếp tục mua sắm
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
