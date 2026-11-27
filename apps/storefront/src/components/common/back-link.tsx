import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface BackLinkProps {
  readonly href: string;
  readonly label: string;
  readonly className?: string;
}

/**
 * Shared neutral back navigation link for Storefront detail and checkout headers.
 */
export function BackLink({ href, label, className }: BackLinkProps) {
  return (
    <div className={className}>
      <Link
        href={href}
        className="inline-flex items-center gap-1.5 rounded text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:outline-none"
      >
        <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </Link>
    </div>
  );
}
