import type { Metadata } from "next";
import { PolicySidebar } from "@/features/policies/components/policy-sidebar";

export const metadata: Metadata = {
  title: "Chính sách bảo mật",
  description:
    "Chính sách bảo mật thông tin khách hàng, thanh toán PayOS VietQR và quyền kiểm soát dữ liệu tài khoản tại GreenRoots Farm.",
};

/**
 * Privacy policy page explaining data collection scope, payment security, and account controls.
 */
export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-4 sm:py-6 lg:px-6 lg:py-8">
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
        <PolicySidebar currentPath="/policies/privacy" />

        <div className="flex flex-col gap-8 lg:col-span-9">
          <section className="flex flex-col gap-6">
            <div className="flex flex-col gap-1.5 border-b border-border-subtle pb-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
                    Chính sách bảo mật thông tin
                  </h1>
                </div>
                <span className="text-xs font-medium text-gray-500 tabular-nums">
                  Cập nhật: 22/11/2026
                </span>
              </div>
              <p className="text-sm leading-relaxed text-pretty text-gray-600 sm:text-base">
                GreenRoots Farm cam kết thu thập tối thiểu, lưu trữ an toàn và
                không chia sẻ dữ liệu cá nhân của khách hàng cho bên thứ ba
                ngoài mục đích giao nhận và thanh toán.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1 rounded-lg">
                <span className="text-xs font-semibold">Dữ liệu thu thập</span>
                <span className="text-base font-bold">
                  Chỉ phục vụ giao hàng & hóa đơn
                </span>
                <span className="text-xs leading-relaxed text-gray-600">
                  Họ tên, số điện thoại, địa chỉ nhận rau và email xác nhận đơn.
                </span>
              </div>
              <div className="flex flex-col gap-1 rounded-lg bg-surface-warm">
                <span className="text-xs font-semibold">
                  Thanh toán PayOS VietQR
                </span>
                <span className="text-base font-bold text-gray-900">
                  Không lưu thông tin thẻ ngân hàng
                </span>
                <span className="text-xs leading-relaxed text-gray-600">
                  Giao dịch được xử lý trực tiếp qua cổng thanh toán chuẩn ngân
                  hàng.
                </span>
              </div>
            </div>

            <div className="divide-y divide-border-subtle border-y border-border-subtle">
              <div className="flex flex-col gap-1.5 py-5">
                <h2 className="text-base font-bold text-gray-900">
                  1. Phạm vi sử dụng dữ liệu
                </h2>
                <p className="text-sm leading-relaxed text-pretty text-gray-600">
                  Thông tin liên hệ và tọa độ giao hàng chỉ được dùng để điều
                  phối xe lạnh giao đơn, gửi thông báo trạng thái lô rau định kỳ
                  và xử lý khiếu nại độ tươi khi có yêu cầu.
                </p>
              </div>

              <div className="flex flex-col gap-1.5 py-5">
                <h2 className="text-base font-bold text-gray-900">
                  2. Bảo mật phiên & Quyền kiểm soát của bạn
                </h2>
                <p className="text-sm leading-relaxed text-pretty text-gray-600">
                  Bạn có thể tự xem, cập nhật địa chỉ, đăng xuất các thiết bị
                  đang hoạt động hoặc yêu cầu xóa dữ liệu tài khoản bất kỳ lúc
                  nào tại mục Hồ sơ & Bảo mật.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
