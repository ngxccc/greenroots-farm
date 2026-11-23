import type { Metadata } from "next";
import Link from "next/link";
import { BUSINESS_RULES } from "@greenroots/shared";
import { buttonVariants } from "@greenroots/ui";
import {
  CheckCircle2,
  Headphones,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";
import { FARM_METADATA } from "@/constants/farm-metadata.constant";
import { PolicySidebar } from "@/features/policies/components/policy-sidebar";

export const metadata: Metadata = {
  title: "Chính sách đổi trả độ tươi 2h",
  description:
    "Cam kết bảo đảm chất lượng rau củ tươi sạch GreenRoots Farm: hoàn tiền 100% hoặc giao bù trong 2 giờ nếu sản phẩm không đạt chuẩn độ tươi.",
};

/**
 * Freshness and returns policy page detailing the 2h express resolution SLA and 24h complaint window.
 */
export default function ReturnsPolicyPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-4 sm:py-6 lg:px-6 lg:py-8">
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <PolicySidebar currentPath="/policies/returns" />

        <div className="flex flex-col gap-6 lg:col-span-9">
          <section className="flex flex-col gap-6 rounded-xl border border-border-subtle bg-white p-4 shadow-xs sm:p-6">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-full bg-green-50 text-brand-forest">
                  <ShieldCheck className="size-4" aria-hidden="true" />
                </span>
                <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
                  Cam kết đổi trả độ tươi trong 2 giờ
                </h1>
              </div>
              <p className="text-sm leading-relaxed text-gray-600 sm:text-base">
                Nếu rau củ không đạt độ tươi giòn như cam kết khi mở túi,
                GreenRoots Farm cam kết hoàn tiền 100% hoặc giao bù miễn phí
                trong vòng 2 giờ.
              </p>
            </div>

            {/* Eligible Conditions */}
            <div className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-surface-warm p-5">
              <h2 className="text-sm font-bold text-gray-900 sm:text-base">
                Các trường hợp được áp dụng đổi trả ngay
              </h2>
              <ul className="flex flex-col gap-2.5 text-xs text-gray-700 sm:text-sm">
                <li className="flex items-start gap-2">
                  <CheckCircle2
                    className="mt-0.5 size-4 shrink-0 text-brand-forest"
                    aria-hidden="true"
                  />
                  <span>
                    Sản phẩm bị dập nát, héo úa hoặc hư hại do quá trình vận
                    chuyển xe lạnh.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2
                    className="mt-0.5 size-4 shrink-0 text-brand-forest"
                    aria-hidden="true"
                  />
                  <span>
                    Giao thiếu số lượng, giao nhầm chủng loại rau hoặc sai khối
                    lượng theo đơn đặt hàng.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2
                    className="mt-0.5 size-4 shrink-0 text-brand-forest"
                    aria-hidden="true"
                  />
                  <span>
                    Tem QR lô thu hoạch bị mờ rách, không quét được hoặc thông
                    tin nguồn gốc không đúng cam kết.
                  </span>
                </li>
              </ul>
            </div>

            {/* 3-Step Process */}
            <div className="flex flex-col gap-3">
              <h2 className="text-base font-bold text-gray-900 sm:text-lg">
                Quy trình tiếp nhận & xử lý 3 bước
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5 rounded-xl border border-border-subtle p-4">
                  <span className="text-xs font-bold text-brand-forest">
                    BƯỚC 01
                  </span>
                  <h3 className="text-sm font-bold text-gray-900">
                    Chụp ảnh tình trạng
                  </h3>
                  <p className="text-xs leading-relaxed text-gray-600">
                    Chụp 1–2 ảnh túi rau và tem QR. Bạn có tới{" "}
                    <strong className="tabular-nums">
                      {BUSINESS_RULES.COMPLAINT_WINDOW_HOURS}h
                    </strong>{" "}
                    để gửi yêu cầu (khuyến khích chụp ngay khi mở túi).
                  </p>
                </div>

                <div className="flex flex-col gap-1.5 rounded-xl border border-border-subtle p-4">
                  <span className="text-xs font-bold text-brand-forest">
                    BƯỚC 02
                  </span>
                  <h3 className="text-sm font-bold text-gray-900">
                    Gửi yêu cầu hỗ trợ
                  </h3>
                  <p className="text-xs leading-relaxed text-gray-600">
                    Gửi phản ánh qua mục Đơn hàng của tôi hoặc gọi hotline{" "}
                    <strong className="tabular-nums">
                      {FARM_METADATA.hotline}
                    </strong>
                    . Chọn hoàn tiền hoặc nhận giao bù.
                  </p>
                </div>

                <div className="flex flex-col gap-1.5 rounded-xl border border-border-subtle p-4">
                  <span className="text-xs font-bold text-brand-forest">
                    BƯỚC 03
                  </span>
                  <h3 className="text-sm font-bold text-gray-900">
                    Xử lý nhanh chóng
                  </h3>
                  <p className="text-xs leading-relaxed text-gray-600">
                    Đội ngũ xác nhận trong{" "}
                    <strong className="tabular-nums">15 phút</strong> và giao bù
                    rau mới hỏa tốc trong{" "}
                    <strong className="tabular-nums">2 giờ</strong> hoặc hoàn
                    tiền lập tức.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex w-full flex-col gap-3 pt-2 sm:flex-row sm:items-center">
              <a
                href={`tel:${FARM_METADATA.hotline.replace(/\s+/g, "")}`}
                className={buttonVariants({
                  variant: "default",
                  size: "default",
                  className:
                    "h-10 w-full justify-center bg-brand-forest font-semibold text-white hover:bg-brand-dark sm:h-9 sm:w-auto",
                })}
              >
                <Headphones className="mr-2 size-4" aria-hidden="true" />
                <span>Hotline hỗ trợ {FARM_METADATA.hotline}</span>
              </a>
              <Link
                href="/account/profile"
                className={buttonVariants({
                  variant: "outline",
                  size: "default",
                  className:
                    "h-10 w-full justify-center border-border-subtle hover:border-brand-forest sm:h-9 sm:w-auto",
                })}
              >
                <ReceiptText
                  className="mr-2 size-4 text-brand-forest"
                  aria-hidden="true"
                />
                <span>Xem tài khoản của tôi</span>
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
