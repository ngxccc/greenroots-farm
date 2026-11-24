import type { Metadata } from "next";
import Link from "next/link";
import { BUSINESS_RULES } from "@greenroots/shared";
import { Badge, buttonVariants } from "@greenroots/ui";
import { ShoppingBag, Snowflake } from "lucide-react";
import { PolicySidebar } from "@/features/policies/components/policy-sidebar";
import { formatVnd } from "@/lib/format";

export const metadata: Metadata = {
  title: "Chính sách giao hàng xe lạnh",
  description:
    "Chính sách chuỗi lạnh 4°C từ nông trại Đà Lạt về Urban Hub Bình Thạnh, TP.HCM với cước phí Haversine minh bạch và khung giờ cố định.",
};

/**
 * Shipping policy page explaining cold-chain logistics, delivery fee rules, and dispatch slots.
 */
export default function ShippingPolicyPage() {
  const minOrderValueFormatted = formatVnd(BUSINESS_RULES.MIN_ORDER_VALUE_VND);
  const baseFeeFormatted = formatVnd(BUSINESS_RULES.SHIPPING.BASE_FEE_VND);
  const perKmRateFormatted = formatVnd(BUSINESS_RULES.SHIPPING.PER_KM_RATE_VND);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-4 sm:py-6 lg:px-6 lg:py-8">
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
        <PolicySidebar currentPath="/policies/shipping" />

        <div className="flex flex-col gap-8 lg:col-span-9">
          <section className="flex flex-col gap-6">
            <div className="flex flex-col gap-1.5 border-b border-border-subtle pb-4">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
                  Chính sách giao xe lạnh 4°C
                </h1>
              </div>
              <p className="text-sm leading-relaxed text-pretty text-gray-600 sm:text-base">
                GreenRoots Farm vận chuyển rau củ bằng xe lạnh 4°C từ Đơn Dương
                (Lâm Đồng) về Urban Hub Bình Thạnh lúc rạng sáng, sau đó giao
                hỏa tốc đến các quận huyện TP.HCM nhằm giữ trọn độ giòn tươi.
              </p>
            </div>

            {/* Fee Summary (Flat tinted tiles, no borders) */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1 rounded-lg">
                <span className="text-xs font-semibold">Gói rau định kỳ</span>
                <span className="text-xl font-extrabold">
                  Miễn phí giao xe lạnh
                </span>
                <p className="text-xs leading-relaxed text-gray-600">
                  Miễn phí 100% trong bán kính{" "}
                  <strong className="tabular-nums">
                    {BUSINESS_RULES.SHIPPING.SUBSCRIPTION_FREE_RADIUS_KM}km
                  </strong>
                  . Giao định kỳ Thứ Ba & Thứ Sáu hàng tuần.
                </p>
              </div>

              <div className="flex flex-col gap-1 rounded-lg bg-surface-warm">
                <span className="text-xs font-semibold">
                  Giao lẻ theo cự ly
                </span>
                <span className="text-xl font-extrabold text-gray-900 tabular-nums">
                  Từ {baseFeeFormatted} / chuyến
                </span>
                <p className="text-xs leading-relaxed text-gray-600">
                  Áp dụng cho{" "}
                  <strong className="tabular-nums">
                    {BUSINESS_RULES.SHIPPING.FREE_KM_THRESHOLD}km
                  </strong>{" "}
                  đầu. Mỗi km phụ trội +
                  <span className="font-semibold tabular-nums">
                    {perKmRateFormatted}
                  </span>
                  /km theo cự ly thực tế.
                </p>
              </div>
            </div>

            {/* MOV & Radius Hairline Note */}
            <div className="flex items-start gap-2.5 border-y border-border-subtle py-3.5 text-xs text-gray-600 sm:text-sm">
              <div className="flex flex-col gap-0.5">
                <span className="font-semibold text-gray-800">
                  Giá trị đơn tối thiểu{" "}
                  <span className="tabular-nums">{minOrderValueFormatted}</span>{" "}
                  · Phạm vi phục vụ tối đa{" "}
                  <span className="tabular-nums">
                    {BUSINESS_RULES.SHIPPING.MAX_RADIUS_KM}km
                  </span>{" "}
                  từ Urban Hub Bình Thạnh, TP.HCM
                </span>
                <span>
                  Hệ thống tự động tính cước vận chuyển chuẩn xác theo vị trí
                  phường/xã khi bạn nhập địa chỉ nhận hàng tại bước thanh toán.
                </span>
              </div>
            </div>

            {/* Delivery Slots (Flat hairline rows) */}
            <div className="flex flex-col gap-3">
              <h2 className="text-base font-bold text-gray-900 sm:text-lg">
                Khung giờ giao hàng trong ngày
              </h2>
              <div className="divide-y divide-border-subtle border-y border-border-subtle">
                <div className="flex flex-col justify-between gap-2 py-4 sm:flex-row sm:items-center">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-gray-900">
                      Chuyến sáng sớm (
                      <span className="tabular-nums">06:30 – 08:30</span>)
                    </span>
                    <span className="text-xs text-gray-600">
                      Dành cho đơn đặt trước{" "}
                      <span className="tabular-nums">21:00</span> tối hôm trước
                      & Gói rau định kỳ gia đình
                    </span>
                  </div>
                </div>

                <div className="flex flex-col justify-between gap-2 py-4 sm:flex-row sm:items-center">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-gray-900">
                      Giao nhanh trong 2 giờ (
                      <span className="tabular-nums">10:00 – 12:00</span>)
                    </span>
                    <span className="text-xs text-gray-600">
                      Phù hợp cho đơn đặt buổi sáng, kịp giờ nấu bữa cơm trưa
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className="w-fit border-border-subtle bg-surface-warm text-gray-700"
                  >
                    <Snowflake
                      className="mr-1 size-3 text-brand-forest"
                      aria-hidden="true"
                    />
                    <span>
                      Xe lạnh <span className="tabular-nums">4°C</span>
                    </span>
                  </Badge>
                </div>

                <div className="flex flex-col justify-between gap-2 py-4 sm:flex-row sm:items-center">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-gray-900">
                      Chuyến chiều (
                      <span className="tabular-nums">15:00 – 18:00</span>)
                    </span>
                    <span className="text-xs text-gray-600">
                      Đặt trước <span className="tabular-nums">13:30</span> cùng
                      ngày để nhận rau trước giờ chuẩn bị bữa tối
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className="w-fit border-border-subtle bg-surface-warm text-gray-700"
                  >
                    <Snowflake
                      className="mr-1 size-3 text-brand-forest"
                      aria-hidden="true"
                    />
                    <span>
                      Xe lạnh <span className="tabular-nums">4°C</span>
                    </span>
                  </Badge>
                </div>
              </div>
            </div>

            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/#rescue"
                className={buttonVariants({
                  variant: "default",
                  size: "default",
                  className:
                    "h-10 w-full justify-center bg-brand-forest font-semibold text-white hover:bg-brand-dark sm:h-9 sm:w-auto",
                })}
              >
                <ShoppingBag className="mr-2 size-4" aria-hidden="true" />
                <span>Đặt hàng giao xe lạnh</span>
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
