"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type SubmitEvent } from "react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  buttonVariants,
} from "@greenroots/ui";
import {
  Calendar,
  Clock,
  Flame,
  Leaf,
  Package,
  QrCode,
  ShieldCheck,
  Sprout,
} from "lucide-react";
import { DELIVERY_DAY_LABELS } from "@/constants/domain-labels.constant";
import { FARM_METADATA } from "@/constants/farm-metadata.constant";
import { HOME_SHELF_NAV } from "@/constants/navigation.constant";
import { formatVnd } from "@/lib/format";
import type {
  StorefrontProduct,
  StorefrontSubscriptionPlan,
} from "@/types/storefront.types";
import { ProductCard } from "./product-card";

interface HomeViewProps {
  readonly products: readonly StorefrontProduct[];
  readonly plans: readonly StorefrontSubscriptionPlan[];
  readonly apiReachable: boolean;
}

const SHELF_ICONS = {
  flame: Flame,
  leaf: Leaf,
  package: Package,
  sprout: Sprout,
  calendar: Calendar,
} as const;

export function HomeView({ products, plans, apiReachable }: HomeViewProps) {
  const router = useRouter();
  const [batchCode, setBatchCode] = useState("BATCH-2026-TOM-01");
  const [certDialogOpen, setCertDialogOpen] = useState(false);

  const rescueDeals = products.filter((item) => item.isRescueDeal);
  const leafProducts = products.filter(
    (item) => !item.isRescueDeal && item.categoryKey === "leaf",
  );
  const fruitProducts = products.filter(
    (item) => !item.isRescueDeal && item.categoryKey === "fruit",
  );
  const spiceProducts = products.filter(
    (item) => !item.isRescueDeal && item.categoryKey === "spice",
  );

  function handleTraceSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleaned = batchCode.trim().toUpperCase();
    if (!cleaned) return;
    router.push(`/trace/${encodeURIComponent(cleaned)}`);
  }

  return (
    <div className="mx-auto max-w-screen-xl space-y-8 px-3 pt-[148px] pb-12 lg:px-4 lg:pt-[118px]">
      <section className="rounded-2xl border border-border-subtle bg-white p-4 shadow-sm">
        <div className="flex justify-between gap-4 overflow-x-auto lg:grid lg:grid-cols-5">
          {HOME_SHELF_NAV.map((item) => {
            const Icon = SHELF_ICONS[item.iconName];
            const isRescue = item.key === "rescue";
            return (
              <a
                key={item.key}
                href={`#${item.targetId}`}
                className="flex min-w-[78px] flex-col items-center gap-2 rounded-xl p-2 text-center transition hover:bg-green-50/70"
              >
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-full ${
                    isRescue
                      ? "border border-red-200 bg-red-50 text-red-600"
                      : "border border-green-200 bg-green-50 text-brand-forest"
                  }`}
                >
                  <Icon className="size-5" />
                </span>
                <span className="text-xs font-bold whitespace-nowrap text-gray-800">
                  {item.label}
                </span>
              </a>
            );
          })}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-10">
        <div className="relative flex min-h-[210px] flex-col justify-center gap-3 overflow-hidden rounded-2xl bg-brand-forest p-6 text-white md:col-span-7">
          <Leaf className="absolute -right-6 -bottom-8 h-52 w-52 text-white/10" />
          <div className="flex items-center gap-2 self-start">
            <span className="rounded-full bg-brand-dark px-3 py-1 text-xs font-semibold">
              GreenRoots Củ Chi
            </span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                apiReachable
                  ? "bg-white/15 text-green-100"
                  : "bg-red-600/80 text-white"
              }`}
            >
              {apiReachable ? "API Trực tuyến" : "Chế độ Demo"}
            </span>
          </div>
          <h1 className="text-2xl leading-tight font-extrabold lg:text-3xl">
            Rau hữu cơ cắt lúc {FARM_METADATA.harvestTimeLabel}
            <br />
            <span className="text-lg font-semibold text-green-200 lg:text-xl">
              Minh bạch nhật ký bất biến qua QR
            </span>
          </h1>
          <Button
            type="button"
            onClick={() => setCertDialogOpen(true)}
            className="h-11 self-start rounded-full bg-white px-5 text-sm font-bold text-brand-dark hover:bg-green-50"
          >
            <ShieldCheck className="size-5" />
            Xem chứng chỉ VietGAP
          </Button>
        </div>

        <form
          onSubmit={handleTraceSubmit}
          className="flex flex-col justify-center gap-3 rounded-2xl border-2 border-brand-forest bg-white p-4 md:col-span-3"
        >
          <p className="flex items-center gap-2 text-sm font-bold text-brand-dark">
            <QrCode className="size-5" />
            Kiểm tra nguồn gốc nhanh
          </p>
          <Input
            value={batchCode}
            onChange={(event) => setBatchCode(event.target.value)}
            placeholder="BATCH-2026-TOM-01"
            aria-label="Mã lô thu hoạch"
            className="h-11 text-xs"
          />
          <Button
            type="submit"
            className="h-11 rounded-lg bg-brand-forest text-sm font-bold text-white hover:bg-brand-dark"
          >
            Tra cứu QR
          </Button>
        </form>
      </section>

      <section
        id="rescue"
        className="scroll-mt-32 rounded-2xl border border-border-subtle bg-white p-4 shadow-sm lg:p-5"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500 font-bold text-white shadow-sm">
              <Flame className="size-5" />
            </span>
            <div>
              <h2 className="text-base font-extrabold tracking-tight text-gray-900 lg:text-lg">
                DEAL TƯƠI TRONG NGÀY
              </h2>
              <p className="hidden text-xs text-gray-500 sm:block">
                {FARM_METADATA.rescueNote}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700">
            <Clock className="size-4 text-red-500" />
            <span>
              Flash Sale FEFO &lt; {FARM_METADATA.flashSaleHoursThreshold}h
            </span>
            <span className="rounded bg-red-600 px-1.5 py-0.5 text-xs font-bold text-white">
              -{FARM_METADATA.flashSaleDiscountPercent}%
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
          {rescueDeals.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      <section id="shelf-leaf" className="scroll-mt-32">
        <div className="mb-3 flex items-center justify-between border-b border-border-subtle pb-2">
          <h2 className="flex items-center gap-2 text-base font-extrabold text-brand-dark lg:text-lg">
            <Leaf className="size-5 text-brand-forest" />
            RAU ĂN LÁ HỮU CƠ
          </h2>
          <Link
            href="/products"
            className="text-xs font-bold text-brand-forest hover:underline"
          >
            Xem tất cả
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {leafProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      <section id="shelf-fruit" className="scroll-mt-32">
        <div className="mb-3 border-b border-border-subtle pb-2">
          <h2 className="flex items-center gap-2 text-base font-extrabold text-brand-dark lg:text-lg">
            <Package className="size-5 text-brand-forest" />
            CỦ &amp; QUẢ TƯƠI SẠCH
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {fruitProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      <section id="shelf-spice" className="scroll-mt-32">
        <div className="mb-3 border-b border-border-subtle pb-2">
          <h2 className="flex items-center gap-2 text-base font-extrabold text-brand-dark lg:text-lg">
            <Sprout className="size-5 text-brand-forest" />
            RAU GIA VỊ &amp; NẤM
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {spiceProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      <section id="plans" className="scroll-mt-32">
        <div className="mb-3 flex items-center justify-between border-b border-border-subtle pb-2">
          <h2 className="flex items-center gap-2 text-base font-extrabold text-brand-dark lg:text-lg">
            <Calendar className="size-5 text-brand-forest" />
            GÓI RAU ĐỊNH KỲ GIA ĐÌNH
          </h2>
          <Link
            href="/subscriptions"
            className="text-xs font-bold text-brand-forest hover:underline"
          >
            Đăng ký lịch giao
          </Link>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {plans.map((plan) => (
            <Card
              key={plan.id}
              className="border-border-subtle bg-white shadow-sm"
            >
              <CardContent className="flex flex-col justify-between gap-4 p-5">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-extrabold text-gray-900">
                      {plan.name}
                    </h3>
                    <Badge className="border-0 bg-green-100 text-brand-dark">
                      {plan.totalDeliveries} lần giao / tháng
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-600">{plan.description}</p>
                  <p className="text-xs font-semibold text-status-fresh">
                    Miễn phí ship trong bán kính 20 km (
                    {plan.supportedDeliveryDays
                      .map((day) => DELIVERY_DAY_LABELS[day])
                      .join(", ")}
                    )
                  </p>
                </div>

                <div className="flex items-center justify-between border-t border-border-subtle pt-2">
                  <div>
                    <span className="text-lg font-extrabold text-brand-forest">
                      {formatVnd(plan.priceVnd)}
                    </span>
                    <span className="text-xs text-gray-500">
                      {" "}
                      / {plan.weightPerDeliveryKg} kg mỗi chuyến
                    </span>
                  </div>
                  <Link
                    href="/subscriptions"
                    className={buttonVariants({
                      className:
                        "bg-brand-forest hover:bg-brand-dark text-white font-bold rounded-xl",
                    })}
                  >
                    Chọn gói
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Dialog open={certDialogOpen} onOpenChange={setCertDialogOpen}>
        <DialogContent className="bg-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-bold text-brand-dark">
              <ShieldCheck className="size-5 text-brand-forest" />
              Hồ sơ chứng nhận nông trại
            </DialogTitle>
            <DialogDescription className="text-gray-600">
              {FARM_METADATA.brandName} — {FARM_METADATA.fullAddress}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-xl border border-border-subtle bg-surface-warm p-3.5 text-xs text-gray-700">
            <p>
              <strong className="text-gray-900">Chứng nhận:</strong>{" "}
              {FARM_METADATA.certifications.join(", ")}
            </p>
            <p>
              <strong className="text-gray-900">Mã hồ sơ:</strong>{" "}
              {FARM_METADATA.certificationCode}
            </p>
            <p>
              <strong className="text-gray-900">Cam kết:</strong> Dư lượng hóa
              học bằng 0, kiểm nghiệm định kỳ đất và nước tưới theo từng thửa.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
