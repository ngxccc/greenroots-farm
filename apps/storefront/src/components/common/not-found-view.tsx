import Link from "next/link";
import type { ReactNode } from "react";
import { BUSINESS_RULES } from "@greenroots/shared";
import { buttonVariants } from "@greenroots/ui";
import { Calendar, Flame, Home, QrCode, SearchX, Sprout } from "lucide-react";
import { NotFoundSearchForm } from "@/components/common/not-found-search-form";

interface NotFoundViewProps {
  readonly searchSlot?: ReactNode;
}

/**
 * Pure presentational 404 recovery view shared by `app/not-found.tsx` and render tests.
 */
export function NotFoundView({ searchSlot }: NotFoundViewProps) {
  return (
    <section
      aria-label="Không tìm thấy trang 404"
      className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center px-4 py-12 lg:px-6"
    >
      <div className="flex w-full max-w-2xl flex-col items-center gap-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <span className="flex size-16 items-center justify-center rounded-full bg-green-50 text-brand-forest">
            <SearchX className="size-8" aria-hidden="true" />
          </span>
          <span className="text-xs font-semibold tracking-wide text-brand-forest">
            LỖI 404 — KHÔNG TÌM THẤY
          </span>
        </div>

        <div className="flex max-w-lg flex-col gap-1.5">
          <h1 className="text-[22px] leading-snug font-bold text-gray-900 md:text-[28px]">
            Trang bạn tìm không còn ở đây
          </h1>
          <p className="text-sm leading-relaxed text-pretty text-gray-500 sm:text-[15px]">
            Đường dẫn có thể đã thay đổi, sản phẩm đã hết mùa thu hoạch hoặc mã
            lô QR chưa được kích hoạt.
          </p>
        </div>

        {searchSlot ?? <NotFoundSearchForm />}

        <div className="flex w-full flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/"
            className={buttonVariants({
              className:
                "h-11 w-full rounded-md bg-brand-forest px-6 text-sm font-semibold text-white hover:bg-brand-dark sm:w-auto",
            })}
          >
            <Home className="size-4" aria-hidden="true" />
            Quay về trang chủ
          </Link>
          <Link
            href="/products"
            className={buttonVariants({
              variant: "outline",
              className:
                "h-11 w-full rounded-md border-border-subtle bg-surface-card px-6 text-sm font-semibold text-gray-900 hover:bg-surface-warm sm:w-auto",
            })}
          >
            <Sprout className="size-4 text-brand-forest" aria-hidden="true" />
            Xem danh mục rau củ
          </Link>
        </div>

        <div className="grid w-full grid-cols-1 divide-y divide-border-subtle border-y border-border-subtle text-left sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Link
            href="/#rescue"
            className="flex items-center gap-3 py-4 transition-colors hover:bg-surface-warm/60 focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:outline-none sm:px-4 sm:first:pl-0 sm:last:pr-0"
          >
            <Flame
              className="size-5 shrink-0 text-status-spoiled"
              aria-hidden="true"
            />
            <div className="flex min-w-0 flex-col">
              <span className="text-xs font-semibold text-gray-900 tabular-nums">
                Deal tươi {BUSINESS_RULES.FLASH_SALE_HOURS_THRESHOLD}h
              </span>
              <span className="text-[11px] font-medium text-gray-500 tabular-nums">
                Giảm đến {BUSINESS_RULES.FLASH_SALE_DISCOUNT_PERCENT}%
              </span>
            </div>
          </Link>

          <Link
            href="/subscriptions"
            className="flex items-center gap-3 py-4 transition-colors hover:bg-surface-warm/60 focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:outline-none sm:px-4 sm:first:pl-0 sm:last:pr-0"
          >
            <Calendar
              className="size-5 shrink-0 text-brand-forest"
              aria-hidden="true"
            />
            <div className="flex min-w-0 flex-col">
              <span className="text-xs font-semibold text-gray-900">
                Gói rau định kỳ
              </span>
              <span className="text-[11px] font-medium text-gray-500">
                Giao hàng tuần
              </span>
            </div>
          </Link>

          <Link
            href="/trace"
            className="flex items-center gap-3 py-4 transition-colors hover:bg-surface-warm/60 focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:outline-none sm:px-4 sm:first:pl-0 sm:last:pr-0"
          >
            <QrCode
              className="size-5 shrink-0 text-brand-forest"
              aria-hidden="true"
            />
            <div className="flex min-w-0 flex-col">
              <span className="text-xs font-semibold text-gray-900">
                Truy xuất QR
              </span>
              <span className="text-[11px] font-medium text-gray-500">
                Kiểm tra lô rau
              </span>
            </div>
          </Link>
        </div>
      </div>
    </section>
  );
}
