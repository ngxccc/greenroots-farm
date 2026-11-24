"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type SubmitEvent } from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
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
  Label,
  buttonVariants,
} from "@greenroots/ui";
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  Clock,
  Flame,
  Leaf,
  QrCode,
  ShieldCheck,
} from "lucide-react";
import { DELIVERY_DAY_LABELS } from "@/constants/domain-labels.constant";
import { FARM_METADATA } from "@/constants/farm-metadata.constant";
import { formatVnd } from "@/lib/format";
import { buildTraceDetailHref } from "@/lib/navigation";
import type {
  HomeCategoryShelf,
  StorefrontProduct,
  StorefrontSubscriptionPlan,
} from "@/types/storefront.types";
import { ProductCard } from "./product-card";

interface HomeViewProps {
  readonly shelves: readonly HomeCategoryShelf[];
  readonly rescueDeals?: readonly StorefrontProduct[];
  readonly plans?: readonly StorefrontSubscriptionPlan[];
  readonly apiReachable: boolean;
}

interface ShelfSectionProps {
  readonly id: string;
  readonly title: string;
  readonly actionHref?: string;
  readonly actionLabel?: string;
  readonly products: readonly StorefrontProduct[];
}

function ShelfSection({
  id,
  title,
  actionHref,
  actionLabel,
  products,
}: ShelfSectionProps) {
  return (
    <section id={id} className="flex scroll-mt-24 flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>

        {actionHref && actionLabel ? (
          <Link
            href={actionHref}
            className="text-sm font-semibold text-brand-forest hover:underline focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:outline-none"
          >
            {actionLabel}
          </Link>
        ) : null}
      </div>

      <div className="grid grid-cols-2 items-stretch gap-3 sm:gap-4 lg:grid-cols-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}

interface HomeViewContentProps extends HomeViewProps {
  readonly onTraceNavigate?: (href: string) => void;
}

interface QuickNavItem {
  readonly key: string;
  readonly label: string;
  readonly targetId: string;
  readonly isRescue: boolean;
}

/**
 * Pure presentational home showcase view decoupled from Next.js router hooks
 * for deterministic unit testing and SSR rendering.
 *
 * @param props Catalog items, subscription plans, API status, and navigation handler.
 * @returns SF-01 home showcase layout.
 */
export function HomeViewContent({
  shelves,
  rescueDeals = [],
  plans = [],
  apiReachable,
  onTraceNavigate,
}: HomeViewContentProps) {
  const qrInputId = useId();
  const [batchCode, setBatchCode] = useState("");
  const [certDialogOpen, setCertDialogOpen] = useState(false);

  const visibleShelves = shelves.filter((shelf) => shelf.products.length > 0);
  const visibleNavItems: QuickNavItem[] = [];
  if (rescueDeals.length > 0) {
    visibleNavItems.push({
      key: "rescue",
      label: "Deal tươi",
      targetId: "rescue",
      isRescue: true,
    });
  }
  for (const shelf of visibleShelves) {
    visibleNavItems.push({
      key: shelf.id,
      label: shelf.name,
      targetId: `shelf-${shelf.slug}`,
      isRescue: false,
    });
  }
  if (plans.length > 0) {
    visibleNavItems.push({
      key: "plans",
      label: "Gói định kỳ",
      targetId: "plans",
      isRescue: false,
    });
  }

  const hasVisibleCatalog = rescueDeals.length > 0 || visibleShelves.length > 0;

  function handleTraceSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetHref = buildTraceDetailHref(batchCode);
    if (!targetHref) return;
    onTraceNavigate?.(targetHref);
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:px-6">
      {visibleNavItems.length > 0 ? (
        <nav
          aria-label="Danh mục sản phẩm"
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
              Danh mục:
            </span>
            {visibleNavItems.map((item) => (
              <a
                key={item.key}
                href={`#${item.targetId}`}
                className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:outline-none ${
                  item.isRescue
                    ? "border-red-200 bg-red-50 text-status-spoiled hover:bg-red-100"
                    : "border-border-subtle bg-white text-brand-dark hover:border-brand-forest hover:bg-green-50"
                }`}
              >
                {item.label}
              </a>
            ))}
          </div>
          <Link
            href="/products"
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-forest hover:underline focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:outline-none"
          >
            <span>Tất cả sản phẩm</span>
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </nav>
      ) : null}

      <section
        aria-label="Giới thiệu nông trại và kiểm tra nguồn gốc"
        className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-12"
      >
        <div className="relative flex flex-col justify-between gap-6 overflow-hidden rounded-2xl bg-brand-forest p-6 text-white md:p-8 lg:col-span-8">
          <Leaf
            className="pointer-events-none absolute -right-6 -bottom-8 size-52 text-white/10 select-none"
            aria-hidden="true"
          />

          <div className="relative z-10 flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="h-auto border-0 bg-brand-dark px-3 py-1 text-xs font-semibold text-white">
                GreenRoots Đà Lạt
              </Badge>
              <Badge className="h-auto max-w-full border-0 bg-green-50 px-3 py-1 text-xs font-semibold whitespace-normal text-brand-dark">
                Từ Nông Trại Hữu Cơ Đến Bàn Ăn
              </Badge>
              {!apiReachable ? (
                <Badge className="h-auto border-0 bg-red-600/90 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                  Mất kết nối API
                </Badge>
              ) : null}
            </div>

            <div className="flex max-w-xl flex-col gap-1">
              <h1 className="text-[26px] leading-tight font-extrabold tracking-tight text-balance md:text-4xl">
                Rau hữu cơ cắt lúc {FARM_METADATA.harvestTimeLabel}
              </h1>
              <p className="text-lg font-bold text-pretty text-green-50">
                Minh bạch nhật ký bất biến qua QR
              </p>
            </div>
          </div>

          <div className="relative z-10">
            <Button
              type="button"
              onClick={() => setCertDialogOpen(true)}
              className="h-auto rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-brand-dark shadow-none hover:bg-green-50"
            >
              <ShieldCheck className="size-5" aria-hidden="true" />
              Xem chứng chỉ VietGAP
            </Button>
          </div>
        </div>

        <Card className="gap-0 rounded-2xl border-brand-forest bg-white py-0 shadow-sm lg:col-span-4">
          <CardContent className="flex h-full flex-col gap-4 p-6">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 text-brand-dark">
                <QrCode className="size-5 shrink-0" aria-hidden="true" />
                <h2 className="text-[15px] font-semibold">
                  Kiểm tra nguồn gốc nhanh
                </h2>
              </div>
              <p className="text-[13px] text-gray-500">
                Nhập mã lô in trên tem bao bì để xem nhật ký thu hoạch.
              </p>
            </div>

            <form onSubmit={handleTraceSubmit} className="flex flex-col gap-2">
              <Label className="sr-only" htmlFor={qrInputId}>
                Mã lô thu hoạch
              </Label>
              <Input
                id={qrInputId}
                value={batchCode}
                onChange={(event) => setBatchCode(event.target.value)}
                placeholder="Nhập mã lô thu hoạch..."
                className="h-10 rounded-lg border-border-subtle bg-gray-100 px-4 text-[13px] font-semibold tracking-wide text-gray-900 tabular-nums focus-visible:border-brand-forest dark:bg-gray-100"
              />
              <Button
                type="submit"
                className="h-10 w-full rounded-lg bg-brand-forest text-sm font-semibold text-white hover:bg-brand-dark"
              >
                Tra cứu QR
              </Button>
            </form>

            <div className="mt-auto flex items-center justify-between gap-2 border-t border-border-subtle pt-3">
              <span className="text-[11px] font-semibold text-gray-500">
                Truy xuất nguồn gốc
              </span>
              <Link
                href="/trace"
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-forest hover:underline focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:outline-none"
              >
                <span>Xem nhật ký</span>
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>

      {!hasVisibleCatalog ? (
        <Alert
          variant={apiReachable ? "default" : "destructive"}
          className="rounded-2xl border-border-subtle bg-white p-5"
        >
          <AlertCircle className="size-4" aria-hidden="true" />
          <AlertTitle className="font-bold text-gray-900">
            {apiReachable
              ? "Hiện chưa có nông sản đang mở bán"
              : "Không thể kết nối tới hệ thống cửa hàng"}
          </AlertTitle>
          <AlertDescription className="text-gray-600">
            {apiReachable
              ? "Danh mục nông sản hôm nay đang được cập nhật. Bạn có thể tra cứu nhật ký lô hàng bằng mã QR ở trên."
              : "Dữ liệu nông sản trực tiếp hiện chưa sẵn sàng. Vui lòng thử tải lại trang sau ít phút."}
          </AlertDescription>
        </Alert>
      ) : null}

      {rescueDeals.length > 0 ? (
        <Card
          id="rescue"
          className="scroll-mt-24 gap-0 rounded-2xl border-border-subtle bg-white py-0 shadow-sm"
        >
          <CardContent className="flex flex-col gap-6 p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div className="flex items-start gap-4 sm:items-center">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-status-spoiled text-white">
                  <Flame className="size-5" aria-hidden="true" />
                </span>
                <div className="flex flex-col gap-0.5">
                  <h2 className="text-lg font-bold text-gray-900">
                    DEAL TƯƠI TRONG NGÀY
                  </h2>
                  <p className="text-[13px] text-balance text-gray-500">
                    {FARM_METADATA.rescueNote}
                  </p>
                </div>
              </div>

              <div className="inline-flex shrink-0 items-center gap-2 self-start rounded-full bg-red-50 px-3 py-1.5 sm:self-center">
                <Clock className="size-4 text-red-800" aria-hidden="true" />
                <span className="text-xs font-semibold text-red-800 tabular-nums">
                  Ưu đãi tươi nhanh {FARM_METADATA.flashSaleHoursThreshold}h
                </span>
                <Badge className="h-auto border-0 bg-status-spoiled px-2 py-0.5 text-[11px] font-semibold text-white tabular-nums">
                  -{FARM_METADATA.flashSaleDiscountPercent}%
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-2 items-stretch gap-3 sm:gap-4 lg:grid-cols-4">
              {rescueDeals.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {visibleShelves.map((shelf) => (
        <ShelfSection
          key={shelf.id}
          id={`shelf-${shelf.slug}`}
          title={shelf.name.toUpperCase()}
          actionHref="/products"
          actionLabel="Xem tất cả"
          products={shelf.products}
        />
      ))}

      {plans.length > 0 ? (
        <section id="plans" className="flex scroll-mt-24 flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Calendar
                className="size-5 text-brand-forest"
                aria-hidden="true"
              />
              <h2 className="text-lg font-bold text-gray-900">
                GÓI RAU ĐỊNH KỲ GIA ĐÌNH
              </h2>
            </div>
            <Link
              href="/subscriptions"
              className="text-sm font-semibold text-brand-forest hover:underline"
            >
              Đăng ký lịch giao
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {plans.map((plan) => (
              <Card
                key={plan.id}
                className="gap-0 rounded-2xl border-border-subtle bg-white py-0 shadow-sm"
              >
                <CardContent className="flex h-full flex-col justify-between gap-4 p-5">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-base font-bold text-gray-900">
                        {plan.name}
                      </h3>
                      <Badge className="rounded-full border-0 bg-green-100 text-brand-dark">
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

                  <div className="flex items-center justify-between border-t border-border-subtle pt-3">
                    <div>
                      <span className="text-lg font-bold text-brand-forest tabular-nums">
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
                          "rounded-lg bg-brand-forest font-semibold text-white hover:bg-brand-dark",
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
      ) : null}

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

/**
 * Interactive SF-01 home showcase view wired to Next.js client navigation.
 *
 * @param props Catalog items, subscription plans, and live API reachability status.
 * @returns SF-01 home showcase layout.
 */
export function HomeView(props: HomeViewProps) {
  const router = useRouter();
  return (
    <HomeViewContent {...props} onTraceNavigate={(href) => router.push(href)} />
  );
}
