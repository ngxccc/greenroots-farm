import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "@greenroots/ui";
import { ShoppingBag } from "lucide-react";
import { FARM_METADATA } from "@/constants/farm-metadata.constant";
import { PolicySidebar } from "@/features/policies/components/policy-sidebar";

export const metadata: Metadata = {
  title: "Giới thiệu nông trại",
  description:
    "Tìm hiểu câu chuyện nông trại GreenRoots Farm tại Đơn Dương, Lâm Đồng với 12 ha canh tác hữu cơ chuẩn VietGAP, thu hoạch lúc 15h chiều và vận chuyển xe lạnh đêm về Urban Hub TP.HCM.",
};

/**
 * Farm About page presenting GreenRoots Farm history, VietGAP certification, and 3 pillars.
 */
export default function AboutFarmPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-4 sm:py-6 lg:px-6 lg:py-8">
      {/* Hero Banner */}
      <section className="grid grid-cols-1 items-center gap-6 rounded-2xl bg-brand-forest p-6 text-white sm:p-8 lg:grid-cols-12">
        <div className="flex flex-col gap-4 lg:col-span-7">
          <span className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold">
            <span>Từ Nông Trại Hữu Cơ Đến Bàn Ăn</span>
          </span>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Nông trại GreenRoots Đà Lạt — 12 hecta canh tác hữu cơ chuẩn VietGAP
          </h1>
          <p className="text-sm leading-relaxed text-pretty text-green-50 sm:text-base">
            Mỗi bó rau tại GreenRoots Farm (Đơn Dương, Lâm Đồng) được cắt lúc{" "}
            {FARM_METADATA.harvestTimeLabel}, làm mát nhanh ở 4°C, chạy xe lạnh
            đêm về Urban Hub Bình Thạnh và giao thẳng đến bếp nhà bạn trong
            ngày.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:col-span-5">
          <div className="relative h-36 overflow-hidden rounded-lg sm:h-44">
            <Image
              src="/images/about/romaine-harvest.jpg"
              alt="Xà lách Romaine hữu cơ thu hoạch sáng sớm"
              fill
              sizes="(max-width: 1024px) 50vw, 25vw"
              className="object-cover"
              loading="eager"
            />
          </div>
          <div className="relative h-36 overflow-hidden rounded-lg sm:h-44">
            <Image
              src="/images/about/cherry-tomatoes.jpg"
              alt="Cà chua bi hữu cơ chín mọng trên giàn trong nhà màng"
              fill
              sizes="(max-width: 1024px) 50vw, 25vw"
              className="object-cover"
              loading="eager"
            />
          </div>
        </div>
      </section>

      {/* Main Grid: Policy Sidebar + Content */}
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
        <PolicySidebar currentPath="/about" />

        <div className="flex flex-col gap-5 lg:col-span-9">
          {/* 3 Pillars (Flat hairline columns) */}
          <section className="grid grid-cols-1 divide-y divide-border-subtle border-b border-border-subtle pb-8 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="flex flex-col gap-3 py-4 sm:py-0 sm:pr-6">
              <h2 className="text-base font-bold text-gray-900">
                100% Hữu cơ tự nhiên
              </h2>
              <p className="text-xs leading-relaxed text-gray-600 sm:text-sm">
                Sử dụng phân trùn quế, chế phẩm sinh học và nguồn nước giếng
                khoan kiểm nghiệm định kỳ mỗi quý.
              </p>
            </div>

            <div className="flex flex-col gap-3 py-4 sm:px-6 sm:py-0">
              <h2 className="text-base font-bold text-gray-900">
                Thu hoạch {FARM_METADATA.harvestTimeLabel} · Xe lạnh đêm
              </h2>
              <p className="text-xs leading-relaxed text-gray-600 sm:text-sm">
                Rau được cắt buổi chiều tại Đà Lạt, làm mát nhanh ở 4°C và chạy
                xe lạnh đêm về Urban Hub Bình Thạnh lúc{" "}
                {FARM_METADATA.hubArrivalLabel} để giữ trọn độ giòn ngọt.
              </p>
            </div>

            <div className="flex flex-col gap-3 py-4 sm:py-0 sm:pl-6">
              <h2 className="text-base font-bold text-gray-900">
                Minh bạch qua QR
              </h2>
              <p className="text-xs leading-relaxed text-gray-600 sm:text-sm">
                Mỗi túi rau đều gắn mã lô riêng để bạn xem ngày gieo, phân bón,
                nhân sự kiểm định và giờ cắt.
              </p>
            </div>
          </section>

          {/* Farm Location & Certification (Flat hairline grid) */}
          <section className="flex flex-col gap-4">
            <h2 className="text-base font-bold text-gray-900 sm:text-lg">
              Thông tin vùng trồng & Chứng nhận
            </h2>
            <div className="grid grid-cols-1 divide-y divide-border-subtle border-y border-border-subtle py-4 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
              <div className="flex flex-col gap-1 py-2 sm:py-0 sm:pr-6">
                <span className="text-xs font-medium text-gray-500">
                  Vùng trồng chính
                </span>
                <span className="text-sm font-semibold text-gray-900">
                  {FARM_METADATA.fullAddress}
                </span>
                <span className="text-xs text-gray-600">
                  Diện tích 12 ha, 18 nhà màng kiểm soát nhiệt độ
                </span>
              </div>
              <div className="flex flex-col gap-1 py-2 sm:py-0 sm:pl-6">
                <span className="text-xs font-medium text-gray-500">
                  Chứng nhận chất lượng
                </span>
                <span className="text-sm font-bold text-brand-forest tabular-nums">
                  VietGAP #{FARM_METADATA.certificationCode}
                </span>
                <span className="text-xs text-gray-600">
                  Hiệu lực đến 12/2027 — Kiểm nghiệm tồn dư 0%
                </span>
              </div>
            </div>

            <div className="flex w-full flex-col gap-3 pt-1 sm:flex-row sm:items-center">
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
                <span>Đặt rau tươi hôm nay</span>
              </Link>
              <Link
                href="/trace"
                className={buttonVariants({
                  variant: "outline",
                  size: "default",
                  className:
                    "h-10 w-full justify-center border-border-subtle bg-surface-card hover:bg-surface-warm sm:h-9 sm:w-auto",
                })}
              >
                <span>Thử tra cứu lô QR</span>
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
