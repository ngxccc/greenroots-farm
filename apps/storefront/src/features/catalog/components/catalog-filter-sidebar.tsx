"use client";

import { useId } from "react";
import {
  Button,
  Checkbox,
  Label,
  RadioGroup,
  RadioGroupItem,
} from "@greenroots/ui";
import { RotateCcw } from "lucide-react";
import {
  CATALOG_PRICE_PRESETS,
  CATALOG_PRICE_PRESET_LABELS,
  type CatalogCategoryNode,
  type CatalogFilterState,
  type CatalogPricePreset,
} from "@/features/catalog/utils/catalog-query";

interface CatalogFilterSidebarProps {
  readonly categories: readonly CatalogCategoryNode[];
  readonly filters: CatalogFilterState;
  readonly onUpdateFilters: (overrides: Partial<CatalogFilterState>) => void;
  readonly onResetFilters: () => void;
  readonly showHeading?: boolean;
}

/**
 * Two-level category, certification (VietGAP / USDA), and price-range filter panel
 * shared between the desktop catalog sidebar and the mobile filter `Sheet` drawer.
 *
 * @param props Active category tree, current URL filter state, and navigation callbacks.
 * @returns Filter controls panel.
 */
export function CatalogFilterSidebar({
  categories,
  filters,
  onUpdateFilters,
  onResetFilters,
  showHeading = true,
}: CatalogFilterSidebarProps) {
  const vietgapId = useId();
  const usdaId = useId();
  const priceGroupId = useId();

  const hasActiveFilters =
    Boolean(filters.q) ||
    Boolean(filters.category) ||
    filters.vietgap ||
    filters.usda ||
    filters.price !== "all";

  return (
    <div className="flex flex-col gap-4">
      {showHeading ? (
        <div className="flex items-center justify-between border-b border-border-subtle pb-2.5">
          <h2 className="text-sm font-semibold text-gray-900">Bộ lọc</h2>
          {hasActiveFilters ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onResetFilters}
              className="h-auto px-1.5 py-0.5 text-xs font-semibold text-brand-forest hover:bg-green-50 hover:text-brand-dark"
            >
              <RotateCcw className="mr-1 size-3" aria-hidden="true" />
              Đặt lại
            </Button>
          ) : null}
        </div>
      ) : null}

      {categories.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="mb-0.5 text-xs font-semibold text-gray-900">
            Danh mục sản phẩm
          </span>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onUpdateFilters({ category: undefined })}
            className={`h-auto w-full justify-start rounded-md px-2.5 py-1.5 text-left text-xs font-semibold ${
              !filters.category
                ? "bg-green-50 text-brand-dark hover:bg-green-100 hover:text-brand-dark"
                : "text-gray-700 hover:bg-surface-warm"
            }`}
          >
            Tất cả danh mục
          </Button>

          {categories.map((root) => {
            const isRootSelected = filters.category === root.slug;
            return (
              <div key={root.id} className="flex flex-col gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onUpdateFilters({ category: root.slug })}
                  className={`h-auto w-full justify-start rounded-md px-2.5 py-1.5 text-left text-xs font-semibold ${
                    isRootSelected
                      ? "bg-green-50 text-brand-dark hover:bg-green-100 hover:text-brand-dark"
                      : "text-gray-900 hover:bg-surface-warm"
                  }`}
                >
                  {root.name}
                </Button>

                {root.children.length > 0 ? (
                  <div className="ml-2.5 flex flex-col gap-0.5 border-l border-border-subtle pl-2.5">
                    {root.children.map((child) => {
                      const isChildSelected = filters.category === child.slug;
                      return (
                        <Button
                          key={child.id}
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            onUpdateFilters({ category: child.slug })
                          }
                          className={`h-auto w-full justify-start rounded-md px-2 py-1 text-left text-xs ${
                            isChildSelected
                              ? "bg-green-50 font-semibold text-brand-dark hover:bg-green-100 hover:text-brand-dark"
                              : "font-normal text-gray-600 hover:bg-surface-warm hover:text-gray-900"
                          }`}
                        >
                          {child.name}
                        </Button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-border-subtle pt-3">
        <span className="text-xs font-semibold text-gray-900">Chứng nhận</span>
        <div className="flex items-center gap-2">
          <Checkbox
            id={vietgapId}
            checked={filters.vietgap}
            onCheckedChange={(checked) => onUpdateFilters({ vietgap: checked })}
          />
          <Label
            htmlFor={vietgapId}
            className="cursor-pointer text-xs font-normal text-gray-700"
          >
            Đạt chuẩn VietGAP
          </Label>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id={usdaId}
            checked={filters.usda}
            onCheckedChange={(checked) => onUpdateFilters({ usda: checked })}
          />
          <Label
            htmlFor={usdaId}
            className="cursor-pointer text-xs font-normal text-gray-700"
          >
            Đạt chuẩn USDA Organic
          </Label>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-border-subtle pt-3">
        <span className="text-xs font-semibold text-gray-900">Khoảng giá</span>
        <RadioGroup
          value={filters.price}
          onValueChange={(value) => {
            if (typeof value === "string") {
              onUpdateFilters({ price: value as CatalogPricePreset });
            }
          }}
        >
          {CATALOG_PRICE_PRESETS.map((preset) => {
            const itemId = `${priceGroupId}-${preset}`;
            return (
              <div key={preset} className="flex items-center gap-2">
                <RadioGroupItem id={itemId} value={preset} />
                <Label
                  htmlFor={itemId}
                  className="cursor-pointer text-xs font-normal text-gray-700 tabular-nums"
                >
                  {CATALOG_PRICE_PRESET_LABELS[preset]}
                </Label>
              </div>
            );
          })}
        </RadioGroup>
      </div>
    </div>
  );
}
