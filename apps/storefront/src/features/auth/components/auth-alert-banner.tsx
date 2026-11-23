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
      variant={isError ? "destructive" : "success"}
      role={isError ? "alert" : "status"}
      className="px-3.5 py-3"
    >
      {isError ? (
        <AlertCircle aria-hidden="true" />
      ) : (
        <CheckCircle2 aria-hidden="true" />
      )}
      <AlertDescription className="text-xs">{message}</AlertDescription>
    </Alert>
  );
}
