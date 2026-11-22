import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { BadgeCheck, Leaf, QrCode, Star } from "lucide-react";
import { BrandLogo } from "@/components/common/brand-logo";

interface AuthSplitLayoutProps {
  readonly children: ReactNode;
}

const PRODUCE_SHOWCASE = [
  {
    src: "/images/auth/lettuce.jpg",
    alt: "Xà lách Romaine hữu cơ tươi",
  },
  {
    src: "/images/auth/tomato.jpg",
    alt: "Cà chua bi hữu cơ chín mọng",
  },
] as const;

const CUSTOMER_PERKS = [
  {
    icon: BadgeCheck,
    text: "Thu hoạch lúc 4h sáng, giao xe lạnh trong ngày",
  },
  {
    icon: QrCode,
    text: "Quét mã QR xem nhật ký canh tác từng lô rau",
  },
  {
    icon: Star,
    text: "Tích điểm thành viên và đổi ưu đãi mỗi đơn hàng",
  },
] as const;

/**
 * Shared Stitch split-panel layout for Storefront authentication routes (`/login`, `/register`,
 * and upcoming recovery screens). Renders a compact brand banner on mobile so forms stay
 * above the fold, expanding to the full produce showcase on desktop (`lg+`).
 */
export default function AuthSplitLayout({ children }: AuthSplitLayoutProps) {
  return (
    <main className="flex min-h-screen w-full flex-col lg:grid lg:grid-cols-12">
      <section
        aria-label="Giới thiệu GreenRoots Farm"
        className="relative flex flex-col justify-between gap-4 overflow-hidden bg-brand-forest px-5 py-4 text-white sm:px-8 sm:py-5 lg:col-span-6 lg:gap-6 lg:p-12"
      >
        <Leaf
          className="pointer-events-none absolute -right-10 -bottom-12 hidden size-64 text-white opacity-10 select-none lg:block"
          aria-hidden="true"
        />

        <div className="relative z-10 flex items-center justify-between gap-3 lg:flex-col lg:items-start lg:gap-6">
          <Link
            href="/"
            className="inline-flex self-start rounded px-1 py-0.5 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
          >
            <BrandLogo variant="on-dark" size="lg" />
          </Link>

          <span className="inline-flex rounded-full bg-brand-dark px-3 py-1 text-[11px] font-semibold text-white lg:hidden">
            Rau hữu cơ cắt sáng
          </span>

          <div className="hidden max-w-md flex-col gap-2 lg:flex">
            <span className="inline-flex self-start rounded-full bg-brand-dark px-3 py-1 text-xs font-semibold text-white">
              Từ Nông Trại Hữu Cơ Đến Bàn Ăn
            </span>
            <h1 className="text-[26px] leading-8.5 font-extrabold tracking-tight text-balance md:text-[36px] md:leading-11">
              Rau củ hữu cơ tươi cắt mỗi sáng
            </h1>
          </div>
        </div>

        <div className="relative z-10 hidden grid-cols-2 gap-4 lg:grid">
          {PRODUCE_SHOWCASE.map((item) => (
            <div
              key={item.src}
              className="relative aspect-video overflow-hidden rounded-lg border border-brand-dark bg-brand-dark"
            >
              <Image
                src={item.src}
                alt={item.alt}
                fill
                loading="eager"
                sizes="22vw"
                className="object-cover"
              />
            </div>
          ))}
        </div>

        <ul className="relative z-10 hidden flex-col gap-2.5 text-sm leading-5.5 text-white sm:text-[15px] lg:flex">
          {CUSTOMER_PERKS.map((perk) => {
            const Icon = perk.icon;
            return (
              <li key={perk.text} className="flex items-center gap-2.5">
                <Icon className="size-5 shrink-0" aria-hidden="true" />
                <span>{perk.text}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section
        aria-label="Biểu mẫu xác thực tài khoản"
        className="flex flex-1 flex-col items-center justify-start bg-surface-card px-5 py-6 sm:p-8 lg:col-span-6 lg:justify-center lg:p-12"
      >
        <div className="w-full max-w-md">{children}</div>
      </section>
    </main>
  );
}
