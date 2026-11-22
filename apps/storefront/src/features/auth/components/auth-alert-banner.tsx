"use client";

import { Alert, AlertDescription } from "@greenroots/ui";
import { AlertCircle, CheckCircle2 } from "lucide-react";

interface AuthAlertBannerProps {
  readonly variant: "error" | "success";
  readonly message: string;
}

/**
 * Accessible inline feedback banner for authentication forms composed with `@greenroots/ui` `Alert`.
 */
export function AuthAlertBanner({ variant, message }: AuthAlertBannerProps) {
  const isError = variant === "error";

  return (
    <Alert
      variant={isError ? "destructive" : "default"}
      role={isError ? "alert" : "status"}
      className={
        isError
          ? "border-red-200 bg-red-50 px-3.5 py-3 text-red-900 *:data-[slot=alert-description]:text-xs *:data-[slot=alert-description]:text-red-900/90"
          : "border-green-200 bg-green-50 px-3.5 py-3 text-brand-dark *:data-[slot=alert-description]:text-xs *:data-[slot=alert-description]:text-brand-dark/90 *:[svg]:text-status-fresh"
      }
    >
      {isError ? (
        <AlertCircle aria-hidden="true" />
      ) : (
        <CheckCircle2 aria-hidden="true" />
      )}
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
