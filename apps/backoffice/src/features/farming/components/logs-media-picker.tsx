import { Alert, AlertDescription, Button, Input } from "@greenroots/ui";
import { AlertCircle, Camera, Film, X } from "lucide-react";
import { useEffect, useId, useRef, type ChangeEvent } from "react";
import { createSafeBlobPreviewUrl } from "@/lib/cloudinary-upload";
import {
  MAX_FARMING_LOG_MEDIA,
  resolveMediaResourceType,
  validateMediaSelection,
  type PendingMediaAttachment,
} from "../logs.utils";

interface MediaAttachmentPickerProps {
  readonly attachments: readonly PendingMediaAttachment[];
  readonly onChange: (next: PendingMediaAttachment[]) => void;
  readonly errorMessage: string | null;
  readonly onError: (message: string | null) => void;
  readonly disabled?: boolean;
}

/**
 * Deferred Cloudinary media picker for farming logs (max 3 images/videos).
 * Validates MIME type and size on selection and creates local `blob:` previews;
 * actual signed upload to Cloudinary happens only on form submission.
 */
export function MediaAttachmentPicker({
  attachments,
  onChange,
  errorMessage,
  onError,
  disabled = false,
}: MediaAttachmentPickerProps) {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const latestAttachmentsRef =
    useRef<readonly PendingMediaAttachment[]>(attachments);

  useEffect(() => {
    latestAttachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    return () => {
      for (const item of latestAttachmentsRef.current) {
        URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, []);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    if (picked.length === 0) return;

    const validationError = validateMediaSelection(picked, attachments.length);
    if (validationError) {
      onError(validationError);
      return;
    }

    onError(null);
    const created: PendingMediaAttachment[] = picked.map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: createSafeBlobPreviewUrl(file),
      resourceType: resolveMediaResourceType(file.type),
    }));
    onChange([...attachments, ...created]);
  }

  function handleRemove(targetId: string) {
    const target = attachments.find((item) => item.id === targetId);
    if (target) {
      URL.revokeObjectURL(target.previewUrl);
    }
    onError(null);
    onChange(attachments.filter((item) => item.id !== targetId));
  }

  const remaining = MAX_FARMING_LOG_MEDIA - attachments.length;

  return (
    <div className="space-y-2.5">
      <Input
        ref={fileInputRef}
        id={inputId}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
        onChange={handleFileChange}
        disabled={disabled || remaining <= 0}
        className="sr-only"
        aria-label="Chọn ảnh hoặc video hiện trường"
      />

      <Button
        type="button"
        variant="outline"
        disabled={disabled || remaining <= 0}
        onClick={() => fileInputRef.current?.click()}
        className="min-h-11 w-full gap-2"
      >
        <Camera className="size-4" aria-hidden="true" />
        <span>
          {remaining > 0
            ? `Chọn ảnh / video hiện trường (${attachments.length}/${MAX_FARMING_LOG_MEDIA})`
            : `Đã đủ ${MAX_FARMING_LOG_MEDIA}/${MAX_FARMING_LOG_MEDIA} tệp đính kèm`}
        </span>
      </Button>

      {errorMessage ? (
        <Alert variant="destructive" role="alert">
          <AlertCircle className="size-4" aria-hidden="true" />
          <AlertDescription className="text-xs">
            {errorMessage}
          </AlertDescription>
        </Alert>
      ) : null}

      {attachments.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {attachments.map((item) => (
            <div
              key={item.id}
              className="relative aspect-square overflow-hidden rounded-lg border border-border-subtle bg-gray-100"
            >
              {item.resourceType === "image" ? (
                <img
                  src={item.previewUrl}
                  alt={item.file.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center text-gray-700">
                  <Film
                    className="size-5 text-brand-forest"
                    aria-hidden="true"
                  />
                  <span className="line-clamp-2 text-xs font-medium">
                    {item.file.name}
                  </span>
                </div>
              )}
              <Button
                type="button"
                size="icon-xs"
                variant="destructive"
                disabled={disabled}
                aria-label={`Xóa tệp ${item.file.name}`}
                onClick={() => handleRemove(item.id)}
                className="absolute top-1 right-1 size-6 rounded-full"
              >
                <X className="size-3.5" aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
