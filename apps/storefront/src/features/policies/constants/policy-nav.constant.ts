import { ShieldCheck, Sprout, Truck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface PolicyNavItem {
  readonly label: string;
  readonly href: string;
  readonly icon: LucideIcon;
}

/**
 * Navigation items for informational and policy pages.
 */
export const POLICY_NAV_ITEMS: readonly PolicyNavItem[] = [
  {
    label: "Giới thiệu nông trại",
    href: "/about",
    icon: Sprout,
  },
  {
    label: "Chính sách giao hàng",
    href: "/policies/shipping",
    icon: Truck,
  },
  {
    label: "Đổi trả độ tươi 2h",
    href: "/policies/returns",
    icon: ShieldCheck,
  },
] as const;
