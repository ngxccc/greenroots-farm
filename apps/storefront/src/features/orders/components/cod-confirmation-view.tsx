"use client";

import Link from "next/link";
import { Button, buttonVariants } from "@greenroots/ui";
import { CheckCircle2, MapPin } from "lucide-react";
import { formatVnd, roundQuantity } from "@/lib/format";
import type { OrderDto } from "../schemas/order.schema";

interface CodConfirmationViewProps {
  readonly order: OrderDto;
}

/**
 * Inline COD order confirmation receipt (`x_c_nh_n_t_h_ng_cod`) rendered inside
 * `/checkout` immediately after `201 Created` without storing order PII in browser storage.
 */
export function CodConfirmationView({ order }: CodConfirmationViewProps) {
  return (
    <section
      aria-label="Xác nhận đặt hàng COD thành công"
      className="mx-auto flex w-full max-w-xl flex-col items-center gap-6 py-6 text-center"
    >
      <span className="flex size-16 items-center justify-center rounded-full bg-green-50 text-brand-forest">
        <CheckCircle2 className="size-9" aria-hidden="true" />
      </span>

      <div className="space-y-1.5">
        <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">
          Đặt hàng thành công!
        </h1>
        <p className="text-sm text-pretty text-gray-600">
          Đơn hàng thanh toán khi nhận hàng (COD) đã được tiếp nhận. Nông trại
          sẽ xác nhận và giao xe lạnh trong thời gian sớm nhất.
        </p>
      </div>

      <div className="w-full space-y-2.5 border-y border-border-subtle py-4 text-left text-sm">
        <div className="flex justify-between gap-3">
          <span className="text-gray-600">Mã đơn hàng</span>
          <span className="font-semibold text-gray-900 tabular-nums">
            {order.orderCode}
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-gray-600">Phương thức thanh toán</span>
          <span className="font-semibold text-gray-900">
            Tiền mặt khi nhận hàng (COD)
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-gray-600">Tạm tính tiền hàng</span>
          <span className="font-semibold text-gray-900 tabular-nums">
            {formatVnd(order.subtotalVnd)}
          </span>
        </div>
        {order.discountAmountVnd > 0 ? (
          <div className="flex justify-between gap-3">
            <span className="text-gray-600">
              Giảm giá điểm thưởng (
              {order.loyaltyPointsUsed.toLocaleString("vi-VN")} điểm)
            </span>
            <span className="font-semibold text-brand-dark tabular-nums">
              -{formatVnd(order.discountAmountVnd)}
            </span>
          </div>
        ) : null}
        <div className="flex justify-between gap-3">
          <span className="text-gray-600">
            Phí giao xe lạnh ({order.shippingDistanceKm} km)
          </span>
          <span className="font-semibold text-gray-900 tabular-nums">
            {order.shippingFeeVnd === 0
              ? "Miễn phí"
              : formatVnd(order.shippingFeeVnd)}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t border-border-subtle pt-2.5">
          <span className="font-bold text-gray-900">
            Số tiền thu hộ khi giao
          </span>
          <span className="text-lg font-extrabold text-brand-forest tabular-nums">
            {formatVnd(order.totalAmountVnd)}
          </span>
        </div>
      </div>

      <div className="w-full space-y-1 border-b border-border-subtle pb-4 text-left">
        <div className="flex items-center gap-1.5 text-xs font-bold text-brand-dark">
          <MapPin className="size-4" aria-hidden="true" />
          <span>Thông tin nhận hàng</span>
        </div>
        <p className="text-sm font-bold text-gray-900">
          {order.receiverName} — {order.receiverPhone}
        </p>
        <p className="text-xs text-pretty text-gray-600">
          {order.shippingAddress}
        </p>
      </div>

      {order.items.length > 0 ? (
        <div className="w-full space-y-2 border-b border-border-subtle pb-4 text-left">
          <p className="text-xs font-bold text-gray-700">
            Sản phẩm đã đặt ({order.items.length})
          </p>
          <ul className="space-y-1.5 text-xs">
            {order.items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-2"
              >
                <span className="text-gray-700">
                  {item.productName} ({roundQuantity(item.quantity)} {item.unit}
                  )
                </span>
                <span className="font-semibold text-gray-900 tabular-nums">
                  {formatVnd(item.lineTotalVnd)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          disabled
          title="Tính năng xem chi tiết đơn hàng đang được phát triển"
          className="h-11 w-full font-semibold"
        >
          Xem chi tiết đơn hàng (Sắp ra mắt)
        </Button>
        <Link
          href="/"
          className={buttonVariants({
            className:
              "h-11 w-full bg-brand-forest font-bold text-white hover:bg-brand-dark",
          })}
        >
          Tiếp tục mua sắm
        </Link>
      </div>
    </section>
  );
}
