"use client";

import Image from "next/image";
import { useState } from "react";
import { Leaf } from "lucide-react";
import { Button } from "@greenroots/ui";

interface ProductImageGalleryProps {
  readonly productName: string;
  readonly images: readonly string[];
}

/**
 * Interactive 4:3 product image showcase using `next/image` for approved hosts
 * and falling back to an organic leaf slot when no image is present or loading fails.
 *
 * @param props Product display name and approved image URLs.
 * @returns Primary 4:3 image slot plus optional thumbnail selector when multiple working images exist.
 */
export function ProductImageGallery({
  productName,
  images,
}: ProductImageGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [failedUrls, setFailedUrls] = useState<readonly string[]>([]);

  const workingImages = images.filter((url) => !failedUrls.includes(url));
  const safeIndex = selectedIndex < workingImages.length ? selectedIndex : 0;
  const activeImageUrl = workingImages[safeIndex];

  function handleImageError(url: string) {
    setFailedUrls((prev) => (prev.includes(url) ? prev : [...prev, url]));
  }

  return (
    <div className="flex flex-col">
      <div className="relative aspect-4/3 overflow-hidden border-y border-border-subtle bg-green-50 lg:rounded-xl lg:border">
        {activeImageUrl ? (
          <Image
            src={activeImageUrl}
            alt={`${productName} — ảnh sản phẩm`}
            fill
            sizes="(max-width: 1024px) 100vw, 42vw"
            className="object-cover"
            loading="eager"
            preload
            onError={() => handleImageError(activeImageUrl)}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Leaf className="size-24 text-brand-forest/40" aria-hidden="true" />
          </div>
        )}
        {workingImages.length > 1 ? (
          <span className="absolute right-3 bottom-3 rounded-full bg-black/60 px-2.5 py-0.5 text-[11px] font-semibold text-white tabular-nums lg:hidden">
            {safeIndex + 1}/{workingImages.length}
          </span>
        ) : null}
      </div>

      {workingImages.length > 1 ? (
        <div
          className="flex gap-2 overflow-x-auto px-4 pt-2.5 lg:grid lg:grid-cols-5 lg:px-0 lg:pt-3"
          role="group"
          aria-label={`Thư viện ảnh ${productName}`}
        >
          {workingImages.map((imageUrl, index) => {
            const isSelected = index === safeIndex;
            return (
              <Button
                key={`${imageUrl}-${index}`}
                type="button"
                variant="ghost"
                onClick={() => setSelectedIndex(index)}
                aria-label={`Xem ảnh ${index + 1} của ${productName}`}
                aria-pressed={isSelected}
                className={`relative aspect-square h-auto w-14 shrink-0 overflow-hidden rounded-lg border p-0 lg:w-full ${
                  isSelected
                    ? "border-brand-forest ring-2 ring-brand-forest/30"
                    : "border-border-subtle hover:border-brand-forest/60"
                }`}
              >
                <Image
                  src={imageUrl}
                  alt={`${productName} — ảnh thu nhỏ ${index + 1}`}
                  fill
                  sizes="80px"
                  className="object-cover"
                  onError={() => handleImageError(imageUrl)}
                />
              </Button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
