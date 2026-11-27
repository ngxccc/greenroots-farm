import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@greenroots/ui";
import { AlertCircle } from "lucide-react";
import { useState } from "react";

interface DeleteConfirmDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description: string;
  readonly isPending: boolean;
  readonly onConfirm: () => Promise<void>;
}

/**
 * Confirmation dialog for admin/super_admin plot or planning-season deletion.
 */
export function DeleteConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  isPending,
  onConfirm,
}: DeleteConfirmDialogProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleConfirm() {
    setErrorMessage(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Không thể thực hiện xóa.",
      );
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setErrorMessage(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {errorMessage ? (
          <Alert variant="destructive" role="alert">
            <AlertCircle className="size-4" aria-hidden="true" />
            <AlertDescription className="text-xs">
              {errorMessage}
            </AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Hủy
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={isPending}
          >
            {isPending ? "Đang xóa..." : "Xác nhận xóa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
