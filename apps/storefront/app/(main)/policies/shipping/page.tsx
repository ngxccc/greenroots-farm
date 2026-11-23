import type { Metadata } from "next";
import Link from "next/link";
import { BUSINESS_RULES } from "@greenroots/shared";
import { Badge, buttonVariants } from "@greenroots/ui";
import { Clock, MapPin, ShoppingBag, Snowflake } from "lucide-react";
import { PolicySidebar } from "@/features/policies/components/policy-sidebar";
import { formatVnd } from "@/lib/format";

export const metadata: Metadata = {
  title: "Chính sách giao hàng xe lạnh",
  description:
    "Chính sách giao hàng xe lạnh 4°C chuyên dụng của GreenRoots Farm từ Củ Chi đến TP.HCM với cước phí Haversine minh bạch và khung giờ cố định.",
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
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <PolicySidebar currentPath="/policies/shipping" />

        <div className="flex flex-col gap-6 lg:col-span-9">
          <section className="flex flex-col gap-6 rounded-xl border border-border-subtle bg-white p-4 shadow-xs sm:p-6">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-full bg-green-50 text-brand-forest">
                  <Snowflake className="size-4" aria-hidden="true" />
                </span>
                <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
                  Chính sách giao xe lạnh 4°C
                </h1>
              </div>
              <p className="text-sm leading-relaxed text-gray-600 sm:text-base">
                GreenRoots Farm vận hành đội xe lạnh chuyên dụng, giao thẳng từ
                nông trại Củ Chi đến các quận huyện nội thành và lân cận TP.HCM
                trong ngày nhằm đảm bảo độ giòn tươi nguyên vẹn.
              </p>
            </div>

            {/* Fee Summary Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-2 rounded-xl border border-green-200 bg-green-50/70 p-4">
                <span className="text-xs font-bold text-brand-dark">
                  Gói định kỳ
                </span>
                <span className="text-xl font-extrabold text-brand-forest">
                  Miễn phí giao hàng
                </span>
                <p className="text-xs leading-relaxed text-gray-700">
                  Miễn phí 100% trong bán kính{" "}
                  <strong className="tabular-nums">
                    {BUSINESS_RULES.SHIPPING.SUBSCRIPTION_FREE_RADIUS_KM}km
                  </strong>
                  . Giao định kỳ Thứ Ba & Thứ Sáu hàng tuần.
                </p>
              </div>

              <div className="flex flex-col gap-2 rounded-xl border border-border-subtle bg-surface-warm p-4">
                <span className="text-xs font-semibold text-gray-600">
                  Cước Haversine minh bạch
                </span>
                <span className="text-xl font-extrabold text-gray-900 tabular-nums">
                  {baseFeeFormatted}
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

              <div className="flex flex-col gap-2 rounded-xl border border-border-subtle bg-surface-warm p-4">
                <span className="text-xs font-semibold text-gray-600">
                  Giá trị đơn tối thiểu
                </span>
                <span className="text-xl font-extrabold text-gray-900 tabular-nums">
                  {minOrderValueFormatted}
                </span>
                <p className="text-xs leading-relaxed text-gray-600">
                  Áp dụng cho mọi đơn bán lẻ để tối ưu hiệu quả kiểm soát nhiệt
                  độ xe lạnh và chất lượng vận chuyển.
                </p>
              </div>
            </div>

            {/* Radius Policy Note */}
            <div className="flex items-start gap-3 rounded-lg border border-border-subtle bg-gray-50 p-3.5 text-xs text-gray-600 sm:text-sm">
              <MapPin
                className="mt-0.5 size-4 shrink-0 text-brand-forest"
                aria-hidden="true"
              />
              <div className="flex flex-col gap-0.5">
                <span className="font-semibold text-gray-800">
                  Phạm vi phục vụ tối đa:{" "}
                  <span className="tabular-nums">
                    {BUSINESS_RULES.SHIPPING.MAX_RADIUS_KM}km
                  </span>{" "}
                  từ nông trại Củ Chi
                </span>
                <span>
                  Hệ thống tự động tính cước vận chuyển chuẩn xác theo vị trí
                  phường/xã khi bạn nhập địa chỉ nhận hàng tại bước thanh toán.
                </span>
              </div>
            </div>

            {/* Delivery Slots */}
            <div className="flex flex-col gap-3 pt-2">
              <h2 className="text-base font-bold text-gray-900 sm:text-lg">
                Khung giờ giao hàng trong ngày
              </h2>
              <div className="divide-y divide-border-subtle overflow-hidden rounded-xl border border-border-subtle">
                <div className="flex flex-col justify-between gap-2 bg-surface-warm p-4 sm:flex-row sm:items-center">
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
                  <Badge
                    variant="outline"
                    className="w-fit border-green-300 bg-green-50 text-brand-dark"
                  >
                    <Clock className="mr-1 size-3" aria-hidden="true" />
                    <span>
                      Vừa cắt lúc <span className="tabular-nums">04:00</span>
                    </span>
                  </Badge>
                </div>

                <div className="flex flex-col justify-between gap-2 bg-white p-4 sm:flex-row sm:items-center">
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

                <div className="flex flex-col justify-between gap-2 bg-white p-4 sm:flex-row sm:items-center">
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

            <div className="flex w-full flex-col gap-3 pt-2 sm:flex-row sm:items-center">
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
