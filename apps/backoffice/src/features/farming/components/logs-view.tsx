import { FarmingActionType } from "@greenroots/shared";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Textarea,
  cn,
} from "@greenroots/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowUpDown,
  Bug,
  CheckCircle2,
  Droplets,
  Film,
  FlaskConical,
  Lock,
  PackageCheck,
  PenLine,
  Scissors,
  Sprout,
  Wheat,
} from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { uploadSignedMedia } from "@/lib/cloudinary-upload";
import {
  createSeasonLog,
  fetchAvailableSeasons,
  fetchSeasonLogs,
} from "../logs.api";
import {
  FARMING_ACTION_LIST,
  FARMING_ACTION_MAP,
  SEASON_STATUS_LABELS,
  buildCreateFarmingLogPayload,
  formatLogTimestamp,
  isActionAllowedForSeasonStatus,
  isVideoMediaUrl,
  pickDefaultSeasonId,
  validateFarmingLogDescription,
  type FarmingLogDto,
  type PendingMediaAttachment,
  type SeasonDto,
} from "../logs.utils";
import { CorrectionLogDialog } from "./logs-correction-dialog";
import { MediaAttachmentPicker } from "./logs-media-picker";

const ACTION_ICONS: Record<FarmingActionType, ReactNode> = {
  [FarmingActionType.SEEDING]: (
    <Sprout className="size-5 shrink-0" aria-hidden="true" />
  ),
  [FarmingActionType.WATERING]: (
    <Droplets className="size-5 shrink-0" aria-hidden="true" />
  ),
  [FarmingActionType.BIO_FERTILIZING]: (
    <Wheat className="size-5 shrink-0" aria-hidden="true" />
  ),
  [FarmingActionType.WEEDING]: (
    <Scissors className="size-5 shrink-0" aria-hidden="true" />
  ),
  [FarmingActionType.PEST_CONTROL]: (
    <Bug className="size-5 shrink-0" aria-hidden="true" />
  ),
  [FarmingActionType.SOIL_TESTING]: (
    <FlaskConical className="size-5 shrink-0" aria-hidden="true" />
  ),
  [FarmingActionType.HARVESTING]: (
    <PackageCheck className="size-5 shrink-0" aria-hidden="true" />
  ),
  [FarmingActionType.CORRECTION]: (
    <PenLine className="size-5 shrink-0" aria-hidden="true" />
  ),
};

const TIMELINE_LIMIT = 20;

function formatSeasonOptionLabel(season: SeasonDto): string {
  const statusLabel = SEASON_STATUS_LABELS[season.status];
  return `${season.plot.plotCode} · ${season.seasonName} (${statusLabel})`;
}

/**
 * Farming Logs operational view: season selector, 2x4 action grid, deferred Cloudinary
 * media uploader, append-only chronological timeline, and linked correction log modal.
 */
export function FarmingLogsView() {
  const queryClient = useQueryClient();

  const [selectedSeasonId, setSelectedSeasonId] = useState<string>("");
  const [selectedAction, setSelectedAction] = useState<FarmingActionType>(
    FarmingActionType.WATERING,
  );
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState<PendingMediaAttachment[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    readonly variant: "destructive" | "success";
    readonly message: string;
  } | null>(null);

  const [actionFilter, setActionFilter] = useState<"all" | FarmingActionType>(
    "all",
  );
  const [sortOrder, setSortOrder] = useState<"loggedAt:desc" | "loggedAt:asc">(
    "loggedAt:desc",
  );
  const [page, setPage] = useState(1);

  const [correctionTarget, setCorrectionTarget] =
    useState<FarmingLogDto | null>(null);

  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  const seasonsQuery = useQuery({
    queryKey: ["farming-logs", "seasons"],
    queryFn: fetchAvailableSeasons,
  });

  const seasons = useMemo(() => seasonsQuery.data ?? [], [seasonsQuery.data]);

  const effectiveSeasonId = useMemo(
    () => selectedSeasonId || pickDefaultSeasonId(seasons),
    [seasons, selectedSeasonId],
  );

  const activeSeason = useMemo(
    () => seasons.find((item) => item.id === effectiveSeasonId) ?? null,
    [seasons, effectiveSeasonId],
  );

  const effectiveAction = useMemo(() => {
    if (!activeSeason) return selectedAction;
    if (isActionAllowedForSeasonStatus(activeSeason.status, selectedAction)) {
      return selectedAction;
    }
    return (
      FARMING_ACTION_LIST.find((item) =>
        isActionAllowedForSeasonStatus(activeSeason.status, item.value),
      )?.value ?? selectedAction
    );
  }, [activeSeason, selectedAction]);

  const logsQuery = useQuery({
    queryKey: [
      "farming-logs",
      "timeline",
      effectiveSeasonId,
      actionFilter,
      sortOrder,
      page,
    ],
    enabled: Boolean(effectiveSeasonId),
    queryFn: () =>
      fetchSeasonLogs(effectiveSeasonId, {
        actionType: actionFilter === "all" ? undefined : actionFilter,
        sort: sortOrder,
        page,
        limit: TIMELINE_LIMIT,
      }),
  });

  function clearPendingAttachments() {
    for (const item of attachments) {
      URL.revokeObjectURL(item.previewUrl);
    }
    setAttachments([]);
    setMediaError(null);
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveSeasonId) {
        throw new Error("Vui lòng chọn mùa vụ trước khi ghi nhật ký.");
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

      const payload = buildCreateFarmingLogPayload({
        actionType: effectiveAction,
        description,
        mediaUrls: uploadedUrls,
      });

      return createSeasonLog(
        effectiveSeasonId,
        payload,
        idempotencyKeyRef.current,
      );
    },
    onSuccess: async (created) => {
      clearPendingAttachments();
      setDescription("");
      idempotencyKeyRef.current = crypto.randomUUID();
      setPage(1);
      setFeedback({
        variant: "success",
        message: `Đã ghi nhật ký "${FARMING_ACTION_MAP[created.actionType].label}" vào ${formatLogTimestamp(created.loggedAt)}.`,
      });
      await queryClient.invalidateQueries({
        queryKey: ["farming-logs", "timeline", effectiveSeasonId],
      });
    },
    onError: (error) => {
      setFeedback({
        variant: "destructive",
        message:
          error instanceof Error
            ? error.message
            : "Không thể lưu nhật ký canh tác.",
      });
    },
  });

  const logs = logsQuery.data?.items ?? [];
  const meta = logsQuery.data?.meta;
  const totalPages = meta ? Math.max(1, Math.ceil(meta.total / meta.limit)) : 1;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Canh tác"
        title="Nhật ký canh tác"
        description="Bản ghi bất biến (Append-only) theo từng mùa vụ."
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <Lock className="size-3" aria-hidden="true" />
              <span>Bất biến</span>
            </Badge>
            <Badge variant="secondary">VietGAP</Badge>
          </div>
        }
      />

      {seasonsQuery.isError ? (
        <Alert variant="destructive" role="alert">
          <AlertCircle className="size-4" aria-hidden="true" />
          <AlertDescription className="text-xs">
            {seasonsQuery.error instanceof Error
              ? seasonsQuery.error.message
              : "Không thể tải danh sách mùa vụ."}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <Card className="min-w-0 border-border-subtle bg-surface-card shadow-sm lg:col-span-5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold text-gray-900">
              Ghi nhật ký hiện trường
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="farming-season-select">
                1. Chọn mùa vụ &amp; lô đất
              </Label>
              {seasonsQuery.isPending ? (
                <Skeleton className="h-11 w-full rounded-lg" />
              ) : (
                <Select
                  value={effectiveSeasonId}
                  onValueChange={(value) => {
                    if (!value) return;
                    setSelectedSeasonId(value);
                    setPage(1);
                    setFeedback(null);
                    idempotencyKeyRef.current = crypto.randomUUID();
                  }}
                >
                  <SelectTrigger
                    id="farming-season-select"
                    aria-label="Chọn mùa vụ và lô đất"
                    className="min-h-11 w-full min-w-0"
                  >
                    <SelectValue placeholder="Chọn mùa vụ...">
                      {activeSeason
                        ? formatSeasonOptionLabel(activeSeason)
                        : "Chọn mùa vụ..."}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {seasons.length === 0 ? (
                      <SelectItem value="__empty" disabled>
                        Chưa có mùa vụ nào
                      </SelectItem>
                    ) : (
                      seasons.map((season) => (
                        <SelectItem key={season.id} value={season.id}>
                          {formatSeasonOptionLabel(season)}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm leading-none font-medium">
                  2. Chọn hành động (Lưới 2×4)
                </p>
                {activeSeason ? (
                  <span className="text-xs text-gray-500">
                    {SEASON_STATUS_LABELS[activeSeason.status]}
                  </span>
                ) : null}
              </div>
              <div
                role="group"
                aria-label="Chọn hành động canh tác"
                className="grid grid-cols-2 gap-2.5"
              >
                {FARMING_ACTION_LIST.map((item) => {
                  const selected = effectiveAction === item.value;
                  const allowed = activeSeason
                    ? isActionAllowedForSeasonStatus(
                        activeSeason.status,
                        item.value,
                      )
                    : true;
                  return (
                    <Button
                      key={item.value}
                      type="button"
                      variant="outline"
                      disabled={!allowed || createMutation.isPending}
                      aria-pressed={selected}
                      onClick={() => {
                        setSelectedAction(item.value);
                        if (feedback) setFeedback(null);
                      }}
                      className={cn(
                        "h-auto min-h-16 flex-col gap-1.5 rounded-xl p-3 text-xs font-bold whitespace-normal",
                        selected
                          ? "border-2 border-brand-forest bg-green-50 text-brand-dark ring-2 ring-brand-forest/20 hover:bg-green-50 hover:text-brand-dark"
                          : "border border-gray-300 bg-surface-card text-gray-700 hover:border-gray-400 hover:bg-gray-50",
                      )}
                    >
                      {ACTION_ICONS[item.value]}
                      <span className="text-center leading-tight">
                        {item.label}
                      </span>
                    </Button>
                  );
                })}
              </div>
              {activeSeason &&
              (activeSeason.status === "planning" ||
                activeSeason.status === "completed") ? (
                <p className="text-xs text-gray-500">
                  Mùa vụ ở trạng thái{" "}
                  {SEASON_STATUS_LABELS[activeSeason.status].toLowerCase()} chỉ
                  cho phép các thao tác phù hợp theo quy định bất biến.
                </p>
              ) : null}
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="farming-log-description">
                  3. Mô tả &amp; ảnh/video hiện trường
                </Label>
                <Textarea
                  id="farming-log-description"
                  rows={3}
                  value={description}
                  disabled={createMutation.isPending || !effectiveSeasonId}
                  onChange={(event) => {
                    setDescription(event.target.value);
                    if (feedback) setFeedback(null);
                  }}
                  placeholder="Ví dụ: Tưới nhỏ giọt lúc 5h sáng, độ ẩm đất đạt chuẩn..."
                  className="min-h-20 rounded-xl border-border-subtle bg-surface-card p-3 text-sm"
                />
              </div>

              <MediaAttachmentPicker
                attachments={attachments}
                onChange={setAttachments}
                errorMessage={mediaError}
                onError={setMediaError}
                disabled={createMutation.isPending || !effectiveSeasonId}
              />

              {feedback ? (
                <Alert
                  variant={feedback.variant}
                  role={feedback.variant === "destructive" ? "alert" : "status"}
                >
                  {feedback.variant === "success" ? (
                    <CheckCircle2 className="size-4" aria-hidden="true" />
                  ) : (
                    <AlertCircle className="size-4" aria-hidden="true" />
                  )}
                  <AlertDescription className="text-xs">
                    {feedback.message}
                  </AlertDescription>
                </Alert>
              ) : null}

              <Button
                type="button"
                disabled={createMutation.isPending || !effectiveSeasonId}
                onClick={() => {
                  setFeedback(null);
                  createMutation.mutate();
                }}
                className="min-h-12 w-full font-bold"
              >
                {createMutation.isPending
                  ? "Đang tải tệp & lưu nhật ký..."
                  : "Lưu nhật ký bất biến"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0 border-border-subtle bg-surface-card shadow-sm lg:col-span-7">
          <CardHeader className="flex flex-col gap-3 border-b border-border-subtle pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-0.5">
              <CardTitle className="text-base font-bold text-gray-900">
                Dòng thời gian nhật ký
              </CardTitle>
              <p className="text-xs text-gray-500 tabular-nums">
                {meta
                  ? `${meta.total} bản ghi · Không thể sửa hoặc xóa`
                  : "Chọn mùa vụ để xem lịch sử canh tác"}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={actionFilter}
                onValueChange={(value) => {
                  if (!value) return;
                  setActionFilter(value);
                  setPage(1);
                }}
              >
                <SelectTrigger
                  aria-label="Lọc theo hành động"
                  className="h-9 w-full min-w-0 sm:w-44"
                >
                  <SelectValue>
                    {actionFilter === "all"
                      ? "Tất cả hành động"
                      : FARMING_ACTION_MAP[actionFilter].label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả hành động</SelectItem>
                  {FARMING_ACTION_LIST.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setSortOrder((prev) =>
                    prev === "loggedAt:desc" ? "loggedAt:asc" : "loggedAt:desc",
                  );
                  setPage(1);
                }}
                className="gap-1.5"
              >
                <ArrowUpDown className="size-3.5" aria-hidden="true" />
                <span>
                  {sortOrder === "loggedAt:desc" ? "Mới nhất" : "Cũ nhất"}
                </span>
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {!effectiveSeasonId && !seasonsQuery.isPending ? (
              <div className="p-6 text-center text-sm text-gray-500">
                Chưa có mùa vụ nào để hiển thị nhật ký.
              </div>
            ) : logsQuery.isPending ? (
              <div className="space-y-4 p-6">
                <Skeleton className="h-20 w-full rounded-lg" />
                <Skeleton className="h-20 w-full rounded-lg" />
                <Skeleton className="h-20 w-full rounded-lg" />
              </div>
            ) : logsQuery.isError ? (
              <div className="p-6">
                <Alert variant="destructive" role="alert">
                  <AlertCircle className="size-4" aria-hidden="true" />
                  <AlertDescription className="text-xs">
                    {logsQuery.error instanceof Error
                      ? logsQuery.error.message
                      : "Không thể tải nhật ký canh tác."}
                  </AlertDescription>
                </Alert>
              </div>
            ) : logs.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">
                Chưa có bản ghi canh tác nào phù hợp với bộ lọc hiện tại.
              </div>
            ) : (
              <div className="divide-y divide-border-subtle">
                {logs.map((log) => {
                  const actionMeta = FARMING_ACTION_MAP[log.actionType];
                  return (
                    <article key={log.id} className="space-y-2.5 p-5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className={cn("gap-1", actionMeta.badgeClassName)}
                          >
                            {actionMeta.label}
                          </Badge>
                          <span className="text-xs font-medium text-gray-500 tabular-nums">
                            {formatLogTimestamp(log.loggedAt)}
                          </span>
                          <span className="text-xs text-gray-500">
                            · {log.staff.fullName}
                          </span>
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setCorrectionTarget(log)}
                          className="h-7 gap-1 px-2 text-xs text-gray-700 hover:text-gray-900"
                        >
                          <PenLine className="size-3.5" aria-hidden="true" />
                          <span>Đính chính</span>
                        </Button>
                      </div>

                      {log.correctsLog ? (
                        <div className="border-l-2 border-amber-400 pl-3 text-xs text-gray-600">
                          <span className="font-semibold text-gray-800">
                            Đính chính cho bản ghi{" "}
                            {
                              FARMING_ACTION_MAP[log.correctsLog.actionType]
                                .label
                            }{" "}
                            ({formatLogTimestamp(log.correctsLog.loggedAt)}):
                          </span>{" "}
                          <span className="line-clamp-2">
                            {log.correctsLog.description}
                          </span>
                        </div>
                      ) : null}

                      <p className="text-sm leading-relaxed whitespace-pre-line text-gray-900">
                        {log.description}
                      </p>

                      {log.mediaUrls.length > 0 ? (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {log.mediaUrls.map((url, index) =>
                            isVideoMediaUrl(url) ? (
                              <a
                                key={url}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle px-2.5 py-1.5 text-xs font-medium text-brand-dark hover:bg-gray-50"
                              >
                                <Film className="size-3.5" aria-hidden="true" />
                                <span>Video #{index + 1}</span>
                              </a>
                            ) : (
                              <a
                                key={url}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block size-20 overflow-hidden rounded-lg border border-border-subtle"
                              >
                                <img
                                  src={url}
                                  alt={`Ảnh hiện trường ${index + 1}`}
                                  loading="lazy"
                                  className="h-full w-full object-cover"
                                />
                              </a>
                            ),
                          )}
                        </div>
                      ) : null}

                      {log.correctedBy.length > 0 ? (
                        <p className="text-xs text-amber-800 tabular-nums">
                          Đã có {log.correctedBy.length} bản ghi đính chính liên
                          kết (lần gần nhất{" "}
                          {formatLogTimestamp(
                            log.correctedBy[log.correctedBy.length - 1]!
                              .loggedAt,
                          )}
                          ).
                        </p>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}

            {meta && totalPages > 1 ? (
              <div className="flex items-center justify-between border-t border-border-subtle px-5 py-3">
                <span className="text-xs text-gray-500 tabular-nums">
                  Trang {meta.page} / {totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || logsQuery.isFetching}
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  >
                    Trước
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages || logsQuery.isFetching}
                    onClick={() =>
                      setPage((prev) => Math.min(totalPages, prev + 1))
                    }
                  >
                    Sau
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <CorrectionLogDialog
        open={correctionTarget !== null}
        onOpenChange={(next) => {
          if (!next) setCorrectionTarget(null);
        }}
        seasonId={effectiveSeasonId}
        targetLog={correctionTarget}
        onCreated={async (created) => {
          setPage(1);
          setFeedback({
            variant: "success",
            message: `Đã lưu bản ghi đính chính vào ${formatLogTimestamp(created.loggedAt)}.`,
          });
          await queryClient.invalidateQueries({
            queryKey: ["farming-logs", "timeline", effectiveSeasonId],
          });
        }}
      />
    </div>
  );
}
