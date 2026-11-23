import Link from "next/link";

export function StorefrontFooter() {
  return (
    <footer className="mt-auto border-t border-border-subtle bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-6 text-xs text-gray-500 sm:flex-row sm:gap-2 sm:py-4 lg:px-6">
        <span className="order-2 text-center sm:order-1 sm:text-left">
          © 2026 GreenRoots Farm — Từ Nông Trại Hữu Cơ Đến Bàn Ăn
        </span>
        <div className="order-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 sm:order-2 sm:justify-end">
          <Link
            href="/about"
            className="py-1 font-semibold transition-colors hover:text-brand-forest"
          >
            Giới thiệu
          </Link>
          <Link
            href="/policies/shipping"
            className="py-1 font-semibold transition-colors hover:text-brand-forest"
          >
            Chính sách giao hàng
          </Link>
          <Link
            href="/policies/returns"
            className="py-1 font-semibold transition-colors hover:text-brand-forest"
          >
            Đổi trả độ tươi
          </Link>
        </div>
      </div>
    </footer>
  );
}
