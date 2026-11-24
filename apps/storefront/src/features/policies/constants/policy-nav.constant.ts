export interface PolicyNavItem {
  readonly label: string;
  readonly href: string;
}

/**
 * Navigation items for informational and policy pages.
 */
export const POLICY_NAV_ITEMS: readonly PolicyNavItem[] = [
  {
    label: "Giới thiệu nông trại",
    href: "/about",
  },
  {
    label: "Chính sách giao hàng",
    href: "/policies/shipping",
  },
  {
    label: "Đổi trả độ tươi 2h",
    href: "/policies/returns",
  },
  {
    label: "Điều khoản sử dụng",
    href: "/policies/terms",
  },
  {
    label: "Chính sách bảo mật",
    href: "/policies/privacy",
  },
] as const;
