"use client";

import Image from "next/image";
import { useState } from "react";
import { Sprout } from "lucide-react";

interface TraceProductImageProps {
  readonly src?: string;
  readonly alt: string;
  readonly width: number;
  readonly height: number;
  readonly loading?: "eager" | "lazy";
  readonly className: string;
  readonly fallbackClassName: string;
  readonly iconClassName?: string;
}

/**
 * Renders a traceability product thumbnail with automatic `<Sprout />` fallback
 * when the image URL is absent or fails to load at runtime.
 *
 * @param props Image source, dimensions, and container/fallback classes.
 * @returns Next.js `Image` or fallback icon slot.
 */
export function TraceProductImage({
  src,
  alt,
  width,
  height,
  loading = "lazy",
  className,
  fallbackClassName,
  iconClassName = "size-8",
}: TraceProductImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showFallback = !src || failedSrc === src;

  if (showFallback) {
    return (
      <span role="img" aria-label={alt} className={fallbackClassName}>
        <Sprout className={iconClassName} aria-hidden="true" />
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={loading}
      onError={() => setFailedSrc(src)}
      className={className}
    />
  );
}
