import Link from "next/link";
import { Badge, Card, CardContent, buttonVariants } from "@greenroots/ui";
import { Calendar } from "lucide-react";
import { DELIVERY_DAY_LABELS } from "@/constants/domain-labels.constant";
import { formatVnd } from "@/lib/format";
import { getShowcaseCatalog } from "@/services/storefront.service";

export default function SubscriptionsPage() {
  const { plans } = getShowcaseCatalog();

  return (
    <div className="mx-auto max-w-screen-xl space-y-6 px-3 pt-[152px] pb-12 lg:px-4 lg:pt-[124px]">
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-xl font-extrabold text-brand-dark">
          <Calendar className="size-5 text-brand-forest" />
          Đăng ký gói rau định kỳ (SF-04)
        </h1>
        <p className="text-xs text-gray-600">
          Giao cố định vào Thứ 3 hoặc Thứ 6, miễn phí vận chuyển trong bán kính
          20 km từ nông trại Củ Chi.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {plans.map((plan) => (
          <Card key={plan.id} className="border-border-subtle bg-white">
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-extrabold text-gray-900">
                  {plan.name}
                </h2>
                <Badge className="border-0 bg-green-100 text-brand-dark">
                  {plan.totalDeliveries} chuyến
                </Badge>
              </div>
              <p className="text-xs text-gray-600">{plan.description}</p>
              <p className="text-xs font-semibold text-status-fresh">
                Ngày giao:{" "}
                {plan.supportedDeliveryDays
                  .map((day) => DELIVERY_DAY_LABELS[day])
                  .join(" / ")}
              </p>
              <div className="flex items-center justify-between border-t border-border-subtle pt-3">
                <span className="text-lg font-extrabold text-brand-forest">
                  {formatVnd(plan.priceVnd)}
                </span>
                <Link
                  href="/checkout"
                  className={buttonVariants({
                    className:
                      "bg-brand-forest hover:bg-brand-dark text-white font-bold",
                  })}
                >
                  Đăng ký &amp; Thanh toán PayOS
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
