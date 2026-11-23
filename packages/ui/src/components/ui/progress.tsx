"use client";

import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

const progressTrackVariants = cva(
  "relative flex w-full items-center overflow-x-hidden rounded-full",
  {
    variants: {
      variant: {
        default: "h-1 bg-muted",
        rescue: "h-1.5 bg-red-50",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const progressIndicatorVariants = cva("h-full transition-all", {
  variants: {
    variant: {
      default: "bg-primary",
      rescue: "rounded-full bg-status-spoiled",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

function Progress({
  className,
  children,
  value,
  variant,
  ...props
}: ProgressPrimitive.Root.Props & VariantProps<typeof progressTrackVariants>) {
  return (
    <ProgressPrimitive.Root
      value={value}
      data-slot="progress"
      className={cn("flex flex-wrap gap-3", className)}
      {...props}
    >
      {children}
      <ProgressTrack variant={variant}>
        <ProgressIndicator variant={variant} />
      </ProgressTrack>
    </ProgressPrimitive.Root>
  );
}

function ProgressTrack({
  className,
  variant,
  ...props
}: ProgressPrimitive.Track.Props & VariantProps<typeof progressTrackVariants>) {
  return (
    <ProgressPrimitive.Track
      className={cn(progressTrackVariants({ variant }), className)}
      data-slot="progress-track"
      {...props}
    />
  );
}

function ProgressIndicator({
  className,
  variant,
  ...props
}: ProgressPrimitive.Indicator.Props &
  VariantProps<typeof progressIndicatorVariants>) {
  return (
    <ProgressPrimitive.Indicator
      data-slot="progress-indicator"
      className={cn(progressIndicatorVariants({ variant }), className)}
      {...props}
    />
  );
}

function ProgressLabel({ className, ...props }: ProgressPrimitive.Label.Props) {
  return (
    <ProgressPrimitive.Label
      className={cn("text-sm font-medium", className)}
      data-slot="progress-label"
      {...props}
    />
  );
}

function ProgressValue({ className, ...props }: ProgressPrimitive.Value.Props) {
  return (
    <ProgressPrimitive.Value
      className={cn(
        "ml-auto text-sm text-muted-foreground tabular-nums",
        className,
      )}
      data-slot="progress-value"
      {...props}
    />
  );
}

export {
  Progress,
  ProgressTrack,
  ProgressIndicator,
  ProgressLabel,
  ProgressValue,
};
