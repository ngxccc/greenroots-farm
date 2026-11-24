import type { Metadata } from "next";
import { BUSINESS_RULES } from "@greenroots/shared";
import { PolicySidebar } from "@/features/policies/components/policy-sidebar";

export const metadata: Metadata = {
  title: "Điều khoản sử dụng",
  description:
    "Điều khoản sử dụng dịch vụ đặt hàng nông sản hữu cơ, chương trình Deal tươi, gói rau định kỳ và giải quyết khiếu nại tại GreenRoots Farm.",
};

/**
 * Terms of service page outlining account, pricing, subscriptions, and complaint rules.
 */
export default function TermsOfServicePage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-4 sm:py-6 lg:px-6 lg:py-8">
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
        <PolicySidebar currentPath="/policies/terms" />

        <div className="flex flex-col gap-8 lg:col-span-9">
          <section className="flex flex-col">
            <div className="flex flex-col gap-1.5 border-b border-border-subtle pb-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
                    Điều khoản sử dụng dịch vụ
                  </h1>
                </div>
                <span className="text-xs font-medium text-gray-500 tabular-nums">
                  Cập nhật: 22/11/2026
                </span>
              </div>
              <p className="text-sm leading-relaxed text-pretty text-gray-600 sm:text-base">
                Khi đặt hàng nông sản hữu cơ hoặc đăng ký gói rau định kỳ tại
                GreenRoots Farm, bạn đồng ý tuân thủ các quy định minh bạch dưới
                đây.
              </p>
            </div>

            <div className="divide-y divide-border-subtle border-b border-border-subtle">
              <div className="flex flex-col gap-1.5 py-5">
                <h2 className="text-base font-bold text-gray-900">
                  1. Tài khoản & Thông tin đặt hàng
                </h2>
                <p className="text-sm leading-relaxed text-pretty text-gray-600">
                  Khách hàng cần cung cấp số điện thoại và địa chỉ giao hàng
                  chính xác tại khu vực phục vụ (TP.HCM) để đội xe lạnh 4°C giao
                  đúng khung giờ. Mỗi tài khoản chịu trách nhiệm bảo mật thông
                  tin đăng nhập và lịch sử đơn hàng của mình.
                </p>
              </div>

              <div className="flex flex-col gap-1.5 py-5">
                <h2 className="text-base font-bold text-gray-900">
                  2. Giá bán & Chương trình Deal tươi
                </h2>
                <p className="text-sm leading-relaxed text-pretty text-gray-600">
                  Giá sản phẩm đã bao gồm thuế VAT theo quy định. Các sản phẩm
                  thuộc chương trình Deal tươi được áp dụng mức giá ưu đãi theo
                  từng đợt thu hoạch và hiển thị rõ hạn sử dụng tốt nhất trước
                  khi thanh toán.
                </p>
              </div>

              <div className="flex flex-col gap-1.5 py-5">
                <h2 className="text-base font-bold text-gray-900">
                  3. Gói rau định kỳ & Thanh toán
                </h2>
                <p className="text-sm leading-relaxed text-pretty text-gray-600">
                  Khách hàng có thể tạm ngưng, đổi lịch giao hoặc hủy gói rau
                  định kỳ trước <span className="tabular-nums">21:00</span> tối
                  hôm trước ngày thu hoạch mà không phát sinh phí phạt. Đơn hàng
                  hỗ trợ thanh toán chuyển khoản VietQR qua PayOS hoặc tiền mặt
                  khi nhận hàng (COD).
                </p>
              </div>

              <div className="flex flex-col gap-1.5 py-5">
                <h2 className="text-base font-bold text-gray-900">
                  4. Truy xuất QR & Giải quyết khiếu nại
                </h2>
                <p className="text-sm leading-relaxed text-pretty text-gray-600">
                  Mọi lô hàng giao đến đều đính kèm tem QR truy xuất nhật ký
                  canh tác. Nếu sản phẩm dập nát hoặc không đạt độ tươi cam kết,
                  khách hàng gửi yêu cầu kèm ảnh trong vòng{" "}
                  <span className="font-semibold tabular-nums">
                    {BUSINESS_RULES.COMPLAINT_WINDOW_HOURS} giờ
                  </span>{" "}
                  kể từ khi nhận để được đổi mới hoặc hoàn tiền theo Chính sách
                  đổi trả.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
