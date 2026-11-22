import { Leaf } from "lucide-react";

interface BrandLogoProps {
  readonly variant?: "on-dark" | "on-light";
  readonly size?: "sm" | "md" | "lg";
  readonly showTagline?: boolean;
}

const ICON_SIZE_CLASSES = {
  sm: "size-5",
  md: "size-6",
  lg: "size-7",
} as const;

/**
 * Canonical GreenRoots Farm logo pairing the Lucide `Leaf` emblem with the brand wordmark.
 */
export function BrandLogo({
  variant = "on-dark",
  size = "md",
  showTagline = false,
}: BrandLogoProps) {
  const isDarkSurface = variant === "on-dark";

  return (
    <span className="inline-flex items-center gap-2.5">
      <Leaf className={ICON_SIZE_CLASSES[size]} aria-hidden="true" />

      <span className="flex flex-col leading-none">
        <span className="flex items-center gap-1">
          <span
            className={`text-lg font-extrabold tracking-tight ${
              isDarkSurface ? "text-white" : "text-gray-900"
            }`}
          >
            GreenRoots
          </span>
          <span
            className={`text-xs font-semibold ${
              isDarkSurface ? "text-green-100" : "text-brand-forest"
            }`}
          >
            Farm
          </span>
        </span>
        {showTagline ? (
          <span
            className={`mt-0.5 text-[10px] font-semibold tracking-wider uppercase ${
              isDarkSurface ? "text-green-200" : "text-gray-500"
            }`}
          >
            Nông trại hữu cơ Củ Chi
          </span>
        ) : null}
      </span>
    </span>
  );
}
