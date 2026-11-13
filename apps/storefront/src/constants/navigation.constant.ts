import type { CategoryShelfKey } from "@/types/storefront.types";

export interface StorefrontShelfNavItem {
  readonly key: CategoryShelfKey | "plans";
  readonly label: string;
  readonly targetId: string;
  readonly iconName: "flame" | "leaf" | "package" | "sprout" | "calendar";
}

/**
 * Primary home shelves matching the SF-01 Grocery-First layout.
 */
export const HOME_SHELF_NAV: readonly StorefrontShelfNavItem[] = [
  { key: "rescue", label: "Deal tươi", targetId: "rescue", iconName: "flame" },
  {
    key: "leaf",
    label: "Rau ăn lá",
    targetId: "shelf-leaf",
    iconName: "leaf",
  },
  {
    key: "fruit",
    label: "Củ & Quả",
    targetId: "shelf-fruit",
    iconName: "package",
  },
  {
    key: "spice",
    label: "Gia vị & Nấm",
    targetId: "shelf-spice",
    iconName: "sprout",
  },
  {
    key: "plans",
    label: "Gói định kỳ",
    targetId: "plans",
    iconName: "calendar",
  },
] as const;
