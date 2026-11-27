import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
} from "@greenroots/ui";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { useRef, useState } from "react";
import { uploadSignedMedia } from "@/lib/cloudinary-upload";
import { createSeasonLog } from "../logs.api";
import {
  FARMING_ACTION_MAP,
  buildCorrectionLogPayload,
  formatLogTimestamp,
  validateFarmingLogDescription,
  type FarmingLogDto,
  type PendingMediaAttachment,
} from "../logs.utils";
import { MediaAttachmentPicker } from "./logs-media-picker";

interface CorrectionLogDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly seasonId: string;
  readonly targetLog: FarmingLogDto | null;
  readonly onCreated: (created: FarmingLogDto) => void;
}

/**
 * Modal for appending a linked correction record (`actionType: "correction"`, `correctsLogId`)
 * without mutating or deleting the original immutable farming log.
 */
export function CorrectionLogDialog({
  open,
  onOpenChange,
  seasonId,
  targetLog,
  onCreated,
}: CorrectionLogDialogProps) {
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState<PendingMediaAttachment[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  function resetDialogState() {
    for (const item of attachments) {
      URL.revokeObjectURL(item.previewUrl);
    }
    setDescription("");
    setAttachments([]);
    setMediaError(null);
    setFormError(null);
    idempotencyKeyRef.current = crypto.randomUUID();
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (!targetLog) {
        throw new Error("Không tìm thấy bản ghi gốc cần đính chính.");
      }

      const descriptionError = validateFarmingLogDescription(description);
      if (descriptionError) {
        throw new Error(descriptionError);
      }

      const uploadedUrls: string[] = [];
      for (const item of attachments) {
        const uploaded = await uploadSignedMedia(
          item.file,
          "farming_logs",
          item.resourceType,
        );
        uploadedUrls.push(uploaded.secureUrl);
      }

      const payload = buildCorrectionLogPayload({
        correctsLogId: targetLog.id,
        description,
        mediaUrls: uploadedUrls,
      });

      return createSeasonLog(seasonId, payload, idempotencyKeyRef.current);
    },
    onSuccess: (created) => {
      resetDialogState();
      onOpenChange(false);
      onCreated(created);
    },
    onError: (error) => {
      setFormError(
        error instanceof Error
          ? error.message
          : "Không thể lưu bản ghi đính chính.",
      );
    },
  });

  const targetMeta = targetLog
    ? FARMING_ACTION_MAP[targetLog.actionType]
    : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !mutation.isPending) {
          resetDialogState();
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tạo bản ghi đính chính</DialogTitle>
          <DialogDescription>
            Nhật ký gốc được giữ nguyên (bất biến). Bản ghi đính chính sẽ được
            bổ sung và liên kết trực tiếp tới bản ghi gốc.
          </DialogDescription>
        </DialogHeader>

        {targetLog && targetMeta ? (
          <div className="space-y-1 border-l-2 border-amber-400 pl-3 text-xs text-gray-700">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={targetMeta.badgeClassName}>
                {targetMeta.label}
              </Badge>
              <span className="text-gray-500 tabular-nums">
                {formatLogTimestamp(targetLog.loggedAt)}
              </span>
              <span className="text-gray-500">
                · {targetLog.staff.fullName}
              </span>
            </div>
            <p className="line-clamp-3 text-gray-800">
              {targetLog.description}
            </p>
          </div>
        ) : null}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="correction-log-description">
              Nội dung đính chính
            </Label>
            <Textarea
              id="correction-log-description"
              rows={3}
              value={description}
              disabled={mutation.isPending}
              onChange={(event) => {
                setDescription(event.target.value);
                if (formError) setFormError(null);
              }}
              placeholder="Ghi rõ thông tin cần đính chính so với bản ghi gốc..."
            />
          </div>

          <MediaAttachmentPicker
            attachments={attachments}
            onChange={setAttachments}
            errorMessage={mediaError}
            onError={setMediaError}
            disabled={mutation.isPending}
          />

          {formError ? (
            <Alert variant="destructive" role="alert">
              <AlertCircle className="size-4" aria-hidden="true" />
              <AlertDescription className="text-xs">
                {formError}
              </AlertDescription>
            </Alert>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => {
              resetDialogState();
              onOpenChange(false);
            }}
          >
            Hủy
          </Button>
          <Button
            type="button"
            disabled={mutation.isPending}
            onClick={() => {
              setFormError(null);
              mutation.mutate();
            }}
          >
            {mutation.isPending
              ? "Đang lưu đính chính..."
              : "Lưu bản ghi đính chính"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
