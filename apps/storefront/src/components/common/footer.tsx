import { Leaf, ShieldCheck } from "lucide-react";
import { FARM_METADATA } from "@/constants/farm-metadata.constant";

export function StorefrontFooter() {
  return (
    <footer className="bg-brand-dark text-sm text-green-50">
      <div className="mx-auto grid max-w-screen-xl gap-6 px-4 py-8 md:grid-cols-3">
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-base font-bold text-white">
            <Leaf className="size-5" />
            {FARM_METADATA.brandName}
          </p>
          <p className="leading-relaxed text-green-100/90">
            {FARM_METADATA.fullAddress}. Rau trồng và giao trực tiếp từ vườn đến
            bàn ăn, không qua trung gian.
          </p>
        </div>

        <div className="space-y-2">
          <p className="font-bold text-white">Cam kết tươi sống</p>
          <p className="leading-relaxed text-green-100/90">
            {FARM_METADATA.rescueNote}
          </p>
        </div>

        <div className="space-y-2">
          <p className="font-bold text-white">Liên hệ và chứng nhận</p>
          <div className="flex items-center gap-2 text-green-100">
            <ShieldCheck className="size-4 shrink-0" />
            <span>{FARM_METADATA.certifications.join(" · ")}</span>
          </div>
          <p className="text-green-100">Hotline: {FARM_METADATA.hotline}</p>
        </div>
      </div>
    </footer>
  );
}
