import Link from "next/link";
import { ArrowLeft, Home } from "lucide-react";

/**
 * Shared footer navigation links for Storefront account verification and recovery pages.
 */
export function AuthFooterLinks() {
  return (
    <div className="flex w-full flex-col items-center gap-2.5 border-t border-border-subtle pt-4">
      <Link
        href="/login"
        className="inline-flex items-center gap-1.5 rounded text-[13px] font-semibold text-brand-forest hover:underline focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:outline-none"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        <span>Quay lại đăng nhập</span>
      </Link>

      <Link
        href="/"
        className="inline-flex items-center gap-1.5 rounded text-xs font-semibold text-gray-500 transition-colors hover:text-brand-forest focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:outline-none"
      >
        <Home className="size-4" aria-hidden="true" />
        <span>Về trang chủ GreenRoots Farm</span>
      </Link>
    </div>
  );
}
