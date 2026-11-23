"use client";

import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@greenroots/ui";
import { AlertCircle, Loader2 } from "lucide-react";

interface ConfirmActionDialogProps {
  readonly open: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly pendingLabel: string;
  readonly cancelLabel?: string;
  readonly isPending?: boolean;
  readonly errorMessage?: string | null;
  readonly onConfirm?: () => void;
}

/**
 * Reusable confirmation modal for destructive account/session operations, displaying
 * loading state and inline `Alert` error feedback without auto-closing on failure.
 *
 * @param props Dialog visibility, localization copy, pending/error states, and confirm handler.
 * @returns Accessible Base UI confirmation dialog composed from `@greenroots/ui`.
 */
export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pendingLabel,
  cancelLabel = "Hủy",
  isPending = false,
  errorMessage = null,
  onConfirm,
}: ConfirmActionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={!isPending}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {errorMessage ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" aria-hidden="true" />
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter>
          <DialogClose
            render={
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                className="cursor-pointer"
              />
            }
          >
            {cancelLabel}
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            disabled={isPending}
            onClick={onConfirm}
            className="cursor-pointer gap-2"
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                <span>{pendingLabel}</span>
              </>
            ) : (
              <span>{confirmLabel}</span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
