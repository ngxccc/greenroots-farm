import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import type { ReactNode } from "react";
import { Toaster } from "@greenroots/ui";
import { FARM_METADATA } from "@/constants/farm-metadata.constant";
import "@/styles/globals.css";

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["vietnamese", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-be-vietnam-pro",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: `${FARM_METADATA.brandName} – Siêu thị Nông sản Sạch`,
    template: `%s - ${FARM_METADATA.brandName}`,
  },
  description: `Nông sản hữu cơ thu hoạch lúc ${FARM_METADATA.harvestTimeLabel} tại ${FARM_METADATA.locationShort}, vận chuyển xe lạnh đêm về Urban Hub TP.HCM, minh bạch nhật ký canh tác qua QR và giao hỏa tốc ${FARM_METADATA.expressDeliveryLabel}.`,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#15803D",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html
      lang="vi"
      data-scroll-behavior="smooth"
      className={beVietnamPro.variable}
    >
      <body className="flex min-h-screen flex-col bg-surface-warm font-sans text-gray-900 antialiased">
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
