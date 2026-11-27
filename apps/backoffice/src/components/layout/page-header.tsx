import type { ReactNode } from "react";

export interface PageHeaderProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly description?: string;
  readonly actions?: ReactNode;
}

/**
 * Shared Backoffice page header enforcing consistent eyebrow, heading scale,
 * description copy, and right-aligned action slots across all screens.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
          {eyebrow}
        </p>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {description ? (
          <p className="text-sm text-gray-600">{description}</p>
        ) : null}
      </div>

      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
