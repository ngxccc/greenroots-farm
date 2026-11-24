"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@greenroots/ui";
import { PanelLeft } from "lucide-react";
import { POLICY_NAV_ITEMS } from "../constants/policy-nav.constant";

export interface PolicySidebarProps {
  readonly currentPath: string;
}

export interface PolicySidebarViewProps {
  readonly currentPath: string;
  readonly mobileSheetOpen?: boolean;
  readonly onMobileSheetOpenChange?: (open: boolean) => void;
}

interface PolicyNavListProps {
  readonly currentPath: string;
  readonly onNavigate?: () => void;
}

function PolicyNavList({ currentPath, onNavigate }: PolicyNavListProps) {
  return (
    <nav aria-label="Danh mục chính sách" className="flex flex-col gap-1">
      {POLICY_NAV_ITEMS.map((item) => {
        const isActive = currentPath === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            onClick={onNavigate}
            className={
              isActive
                ? "flex w-full items-center rounded-lg bg-green-50 px-3 py-2.5 text-xs font-semibold text-brand-dark transition-colors focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:outline-none sm:text-sm"
                : "flex w-full items-center rounded-lg px-3 py-2.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100 hover:text-brand-dark focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:outline-none sm:text-sm"
            }
          >
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Responsive policy navigation sidebar following the profile sidebar pattern:
 * compact mobile trigger bar collapsing sidebar into a left Sheet drawer (< lg)
 * and full left rail on desktop (>= lg).
 */
export function PolicySidebarView({
  currentPath,
  mobileSheetOpen = false,
  onMobileSheetOpenChange,
}: PolicySidebarViewProps) {
  const activeItem = POLICY_NAV_ITEMS.find((item) => item.href === currentPath);
  const activeNavLabel = activeItem?.label ?? "Thông tin & Chính sách";

  return (
    <aside
      aria-label="Thông tin và chính sách"
      className="w-full lg:col-span-3"
    >
      {/* Compact mobile trigger bar (< lg) */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-surface-card px-3 py-2 shadow-xs lg:hidden">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Mở danh mục chính sách"
          onClick={() => onMobileSheetOpenChange?.(true)}
          className="h-8 cursor-pointer gap-2 px-2 text-xs font-semibold text-gray-800 hover:bg-gray-100"
        >
          <PanelLeft className="size-4 text-brand-forest" aria-hidden="true" />
          <span>{activeNavLabel}</span>
        </Button>
        <span className="truncate text-xs font-medium text-gray-500">
          Thông tin & Chính sách
        </span>
      </div>

      {/* Desktop flat rail (>= lg) */}
      <div className="hidden lg:flex lg:flex-col lg:gap-2 lg:border-r lg:border-border-subtle lg:pr-6">
        <span className="px-3 py-1.5 text-xs font-semibold text-gray-500">
          Thông tin & Chính sách
        </span>
        <PolicyNavList currentPath={currentPath} />
      </div>

      {/* Mobile slide-over Sheet drawer */}
      <Sheet open={mobileSheetOpen} onOpenChange={onMobileSheetOpenChange}>
        <SheetContent side="left" className="w-72 bg-surface-card p-0 sm:w-80">
          <SheetHeader className="border-b border-border-subtle px-4 py-3.5 text-left">
            <SheetTitle className="text-sm font-bold text-gray-900">
              Thông tin & Chính sách
            </SheetTitle>
            <SheetDescription className="sr-only">
              Điều hướng các trang giới thiệu nông trại và chính sách vận
              chuyển, đổi trả GreenRoots Farm.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 p-4">
            <PolicyNavList
              currentPath={currentPath}
              onNavigate={() => onMobileSheetOpenChange?.(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </aside>
  );
}

/**
 * Stateful policy navigation sidebar container handling mobile drawer state.
 */
export function PolicySidebar({ currentPath }: PolicySidebarProps) {
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  return (
    <PolicySidebarView
      currentPath={currentPath}
      mobileSheetOpen={mobileSheetOpen}
      onMobileSheetOpenChange={setMobileSheetOpen}
    />
  );
}
