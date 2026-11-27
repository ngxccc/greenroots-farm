import { SeasonStatus } from "@greenroots/shared";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
} from "@greenroots/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useAuthStore } from "@/features/auth/stores/auth.store";
import {
  createPlot,
  createSeason,
  deletePlot,
  deleteSeason,
  fetchPlots,
  fetchSeasons,
  updatePlot,
  updateSeason,
} from "../plots-seasons.api";
import {
  SEASON_STATUS_META,
  canDeletePlot,
  canDeletePlotOrSeason,
  canDeleteSeason,
  formatDisplayDate,
  getActiveSeasonForPlot,
  getNextSeasonStatus,
  type CreatePlotDto,
  type CreateSeasonDto,
  type PlotDto,
  type SeasonDto,
  type UpdatePlotDto,
  type UpdateSeasonDto,
} from "../plots-seasons.utils";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { LabTelemetrySummary } from "./lab-test-section";
import { PlotDialog } from "./plot-dialog";
import { SeasonDialog } from "./season-dialog";

type SeasonFilterStatus = "all" | SeasonStatus;

const SEASON_FILTER_OPTIONS: readonly {
  readonly value: SeasonFilterStatus;
  readonly label: string;
}[] = [
  { value: "all", label: "Tất cả" },
  { value: SeasonStatus.PLANNING, label: "Lập kế hoạch" },
  { value: SeasonStatus.ACTIVE, label: "Đang canh tác" },
  { value: SeasonStatus.HARVESTED, label: "Đã thu hoạch" },
  { value: SeasonStatus.COMPLETED, label: "Hoàn tất" },
];

/**
 * Responsive Farm Plots & Seasons Lifecycle management view (BO-01).
 * Renders mobile-first cards for farm_staff (max-w-md shell) and desktop tables for admin/super_admin.
 */
export function PlotsSeasonsView() {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();

  const canDelete = canDeletePlotOrSeason(user?.role);
  const isFarmStaff = user?.role === "farm_staff";

  const [activeTab, setActiveTab] = useState<"seasons" | "plots">("seasons");
  const [statusFilter, setStatusFilter] = useState<SeasonFilterStatus>("all");
  const [plotFilter, setPlotFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFeedback, setActionFeedback] = useState<{
    readonly variant: "success" | "destructive";
    readonly message: string;
  } | null>(null);

  const [plotDialogOpen, setPlotDialogOpen] = useState(false);
  const [editingPlot, setEditingPlot] = useState<PlotDto | null>(null);

  const [seasonDialogOpen, setSeasonDialogOpen] = useState(false);
  const [editingSeason, setEditingSeason] = useState<SeasonDto | null>(null);
  const [defaultSeasonPlotId, setDefaultSeasonPlotId] = useState<
    string | undefined
  >(undefined);

  const [deleteTarget, setDeleteTarget] = useState<
    | { readonly kind: "plot"; readonly item: PlotDto }
    | { readonly kind: "season"; readonly item: SeasonDto }
    | null
  >(null);

  const plotsQuery = useQuery({
    queryKey: ["plots"],
    queryFn: () => fetchPlots(),
  });

  const seasonsQuery = useQuery({
    queryKey: ["seasons"],
    queryFn: () => fetchSeasons(),
  });

  const plots = useMemo(() => plotsQuery.data ?? [], [plotsQuery.data]);
  const seasons = useMemo(() => seasonsQuery.data ?? [], [seasonsQuery.data]);

  const createPlotMutation = useMutation({
    mutationFn: (payload: CreatePlotDto) => createPlot(payload),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ["plots"] });
      setActionFeedback({
        variant: "success",
        message: `Đã tạo lô đất ${created.plotCode} (${created.areaSqm} m²).`,
      });
    },
  });

  const updatePlotMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdatePlotDto }) =>
      updatePlot(id, payload),
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: ["plots"] });
      await queryClient.invalidateQueries({ queryKey: ["seasons"] });
      setActionFeedback({
        variant: "success",
        message: `Đã cập nhật lô đất ${updated.plotCode}.`,
      });
    },
  });

  const deletePlotMutation = useMutation({
    mutationFn: (id: string) => deletePlot(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["plots"] });
      setActionFeedback({
        variant: "success",
        message: "Đã xóa lô đất khỏi danh sách đang hoạt động.",
      });
    },
  });

  const createSeasonMutation = useMutation({
    mutationFn: (payload: CreateSeasonDto) => createSeason(payload),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ["seasons"] });
      setActionFeedback({
        variant: "success",
        message: `Đã tạo mùa vụ "${created.seasonName}".`,
      });
    },
  });

  const updateSeasonMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateSeasonDto }) =>
      updateSeason(id, payload),
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: ["seasons"] });
      setActionFeedback({
        variant: "success",
        message: `Mùa vụ "${updated.seasonName}" đã chuyển sang ${SEASON_STATUS_META[updated.status].label}.`,
      });
    },
  });

  const deleteSeasonMutation = useMutation({
    mutationFn: (id: string) => deleteSeason(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["seasons"] });
      setActionFeedback({
        variant: "success",
        message: "Đã xóa mùa vụ ở trạng thái Lập kế hoạch.",
      });
    },
  });

  const filteredSeasons = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return seasons.filter((season) => {
      if (statusFilter !== "all" && season.status !== statusFilter) {
        return false;
      }
      if (plotFilter !== "all" && season.plotId !== plotFilter) {
        return false;
      }
      if (!q) return true;
      return (
        season.seasonName.toLowerCase().includes(q) ||
        season.plot.plotCode.toLowerCase().includes(q) ||
        season.plot.name.toLowerCase().includes(q)
      );
    });
  }, [seasons, statusFilter, plotFilter, searchQuery]);

  const filteredPlots = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return plots;
    return plots.filter(
      (plot) =>
        plot.plotCode.toLowerCase().includes(q) ||
        plot.name.toLowerCase().includes(q),
    );
  }, [plots, searchQuery]);

  const stats = useMemo(() => {
    const activeCount = seasons.filter(
      (s) => s.status === SeasonStatus.ACTIVE,
    ).length;
    const planningCount = seasons.filter(
      (s) => s.status === SeasonStatus.PLANNING,
    ).length;
    const lockedPlotsCount = plots.filter(
      (p) => !canDeletePlot(p.id, seasons).allowed,
    ).length;
    return {
      totalPlots: plots.length,
      activeCount,
      planningCount,
      lockedPlotsCount,
    };
  }, [plots, seasons]);

  async function handleAdvanceSeason(season: SeasonDto) {
    const nextStatus = getNextSeasonStatus(season.status);
    if (!nextStatus) return;
    setActionFeedback(null);
    try {
      await updateSeasonMutation.mutateAsync({
        id: season.id,
        payload: { status: nextStatus },
      });
    } catch (error) {
      setActionFeedback({
        variant: "destructive",
        message:
          error instanceof Error
            ? error.message
            : "Không thể chuyển trạng thái mùa vụ.",
      });
    }
  }

  function openCreatePlot() {
    setEditingPlot(null);
    setPlotDialogOpen(true);
  }

  function openEditPlot(plot: PlotDto) {
    setEditingPlot(plot);
    setPlotDialogOpen(true);
  }

  function openCreateSeason(plotId?: string) {
    setEditingSeason(null);
    setDefaultSeasonPlotId(plotId);
    setSeasonDialogOpen(true);
  }

  function openEditSeason(season: SeasonDto) {
    setEditingSeason(season);
    setDefaultSeasonPlotId(undefined);
    setSeasonDialogOpen(true);
  }

  const isLoading = plotsQuery.isLoading || seasonsQuery.isLoading;
  const loadError = plotsQuery.error ?? seasonsQuery.error;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-gray-900">
            Quản Lý Mùa Vụ &amp; Lô Đất
          </h1>
          <p className="text-xs text-gray-500">
            BO-01 · Chu kỳ canh tác &amp; chỉ số xét nghiệm đất/nước
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={openCreatePlot}
            className="min-h-10 gap-1.5"
          >
            <Plus className="size-4" aria-hidden="true" />
            <span>Thêm lô đất</span>
          </Button>
          <Button
            type="button"
            onClick={() => openCreateSeason()}
            disabled={plots.length === 0}
            className="min-h-10 gap-1.5 bg-brand-forest text-white hover:bg-brand-dark"
          >
            <Plus className="size-4" aria-hidden="true" />
            <span>Tạo mùa vụ</span>
          </Button>
        </div>
      </div>

      {actionFeedback ? (
        <Alert
          variant={actionFeedback.variant}
          role={actionFeedback.variant === "destructive" ? "alert" : "status"}
        >
          {actionFeedback.variant === "success" ? (
            <CheckCircle2 className="size-4" aria-hidden="true" />
          ) : (
            <AlertCircle className="size-4" aria-hidden="true" />
          )}
          <AlertDescription className="text-xs">
            {actionFeedback.message}
          </AlertDescription>
        </Alert>
      ) : null}

      {loadError ? (
        <Alert variant="destructive" role="alert">
          <AlertCircle className="size-4" aria-hidden="true" />
          <AlertDescription className="text-xs">
            {loadError instanceof Error
              ? loadError.message
              : "Không thể tải dữ liệu nông trại."}
          </AlertDescription>
        </Alert>
      ) : null}

      <div
        className={cn(
          "grid gap-3",
          isFarmStaff ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-4",
        )}
      >
        <Card className="border-border-subtle bg-surface-card shadow-xs">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-gray-500">
              Tổng số lô đất
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-extrabold text-gray-900 tabular-nums">
              {stats.totalPlots} lô
            </p>
          </CardContent>
        </Card>

        <Card className="border-border-subtle bg-surface-card shadow-xs">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-gray-500">
              Đang canh tác
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-extrabold text-brand-forest tabular-nums">
              {stats.activeCount} vụ
            </p>
          </CardContent>
        </Card>

        <Card className="border-border-subtle bg-surface-card shadow-xs">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-gray-500">
              Đang lập kế hoạch
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-extrabold text-gray-900 tabular-nums">
              {stats.planningCount} vụ
            </p>
          </CardContent>
        </Card>

        <Card className="border-border-subtle bg-surface-card shadow-xs">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-gray-500">
              Lô đang khóa xóa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-extrabold text-gray-900 tabular-nums">
              {stats.lockedPlotsCount} / {stats.totalPlots}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) =>
          setActiveTab(value === "plots" ? "plots" : "seasons")
        }
      >
        <TabsList className="w-full justify-start sm:w-auto">
          <TabsTrigger value="seasons">Mùa vụ ({seasons.length})</TabsTrigger>
          <TabsTrigger value="plots">Lô đất ({plots.length})</TabsTrigger>
        </TabsList>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {activeTab === "seasons" ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {SEASON_FILTER_OPTIONS.map((option) => {
                const selected = statusFilter === option.value;
                return (
                  <Button
                    key={option.value}
                    type="button"
                    size="sm"
                    variant={selected ? "default" : "outline"}
                    onClick={() => setStatusFilter(option.value)}
                    className={
                      selected
                        ? "bg-gray-900 text-white hover:bg-gray-800"
                        : "bg-surface-card text-gray-700"
                    }
                  >
                    {option.label}
                  </Button>
                );
              })}
            </div>
          ) : (
            <div />
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {activeTab === "seasons" ? (
              <Select
                value={plotFilter}
                onValueChange={(val) => val && setPlotFilter(val)}
              >
                <SelectTrigger
                  aria-label="Lọc theo lô đất"
                  className="w-full sm:w-44"
                >
                  <SelectValue placeholder="Tất cả lô đất" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả lô đất</SelectItem>
                  {plots.map((plot) => (
                    <SelectItem key={plot.id} value={plot.id}>
                      {plot.plotCode} · {plot.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            <div className="relative w-full sm:w-56">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm mã lô, tên mùa vụ..."
                className="pl-9"
              />
            </div>
          </div>
        </div>

        <TabsContent value="seasons" className="mt-3">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
          ) : filteredSeasons.length === 0 ? (
            <Card className="border-border-subtle bg-surface-card">
              <CardContent className="py-8 text-center text-sm text-gray-500">
                Chưa có mùa vụ nào khớp bộ lọc hiện tại.
              </CardContent>
            </Card>
          ) : (
            <>
              <div
                className={cn("space-y-3", isFarmStaff ? "block" : "md:hidden")}
              >
                {filteredSeasons.map((season) => {
                  const statusMeta = SEASON_STATUS_META[season.status];
                  const nextStatus = getNextSeasonStatus(season.status);
                  const deletable = canDelete && canDeleteSeason(season);

                  return (
                    <Card
                      key={season.id}
                      className="border-border-subtle bg-surface-card shadow-xs"
                    >
                      <CardContent className="space-y-3 pt-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-brand-forest">
                              {season.plot.plotCode} · {season.plot.name}
                            </p>
                            <h2 className="truncate text-base font-bold text-gray-900">
                              {season.seasonName}
                            </h2>
                          </div>
                          <Badge
                            variant="outline"
                            className={statusMeta.badgeClassName}
                          >
                            {statusMeta.label}
                          </Badge>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600 tabular-nums">
                          <span>
                            Gieo: {formatDisplayDate(season.startDate)}
                          </span>
                          <span>
                            Dự kiến thu:{" "}
                            {formatDisplayDate(season.expectedHarvestDate)}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {nextStatus && statusMeta.nextActionLabel ? (
                            <Button
                              type="button"
                              onClick={() => void handleAdvanceSeason(season)}
                              disabled={updateSeasonMutation.isPending}
                              className="min-h-11 flex-1 gap-1.5 bg-brand-forest text-white hover:bg-brand-dark"
                            >
                              <span>{statusMeta.nextActionLabel}</span>
                              <ArrowRight
                                className="size-4"
                                aria-hidden="true"
                              />
                            </Button>
                          ) : null}

                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label={`Chỉnh sửa mùa vụ ${season.seasonName}`}
                            onClick={() => openEditSeason(season)}
                            className="min-h-11 min-w-11"
                          >
                            <Pencil className="size-4" aria-hidden="true" />
                          </Button>

                          {canDelete ? (
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              aria-label={`Xóa mùa vụ ${season.seasonName}`}
                              disabled={!deletable}
                              title={
                                deletable
                                  ? "Xóa mùa vụ lập kế hoạch"
                                  : "Chỉ có thể xóa mùa vụ ở trạng thái Lập kế hoạch"
                              }
                              onClick={() =>
                                setDeleteTarget({
                                  kind: "season",
                                  item: season,
                                })
                              }
                              className="min-h-11 min-w-11"
                            >
                              <Trash2 className="size-4" aria-hidden="true" />
                            </Button>
                          ) : null}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {!isFarmStaff ? (
                <Card className="hidden border-border-subtle bg-surface-card shadow-xs md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Mùa vụ</TableHead>
                        <TableHead>Lô đất</TableHead>
                        <TableHead>Bắt đầu</TableHead>
                        <TableHead>Dự kiến thu</TableHead>
                        <TableHead>Trạng thái</TableHead>
                        <TableHead className="text-right">Thao tác</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSeasons.map((season) => {
                        const statusMeta = SEASON_STATUS_META[season.status];
                        const nextStatus = getNextSeasonStatus(season.status);
                        const deletable = canDelete && canDeleteSeason(season);

                        return (
                          <TableRow key={season.id}>
                            <TableCell className="font-semibold text-gray-900">
                              {season.seasonName}
                            </TableCell>
                            <TableCell className="text-xs text-gray-700">
                              <span className="font-semibold">
                                {season.plot.plotCode}
                              </span>{" "}
                              · {season.plot.name}
                            </TableCell>
                            <TableCell className="text-xs text-gray-600 tabular-nums">
                              {formatDisplayDate(season.startDate)}
                            </TableCell>
                            <TableCell className="text-xs text-gray-600 tabular-nums">
                              {formatDisplayDate(season.expectedHarvestDate)}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={statusMeta.badgeClassName}
                              >
                                {statusMeta.label}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-end gap-1.5">
                                {nextStatus && statusMeta.nextActionLabel ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() =>
                                      void handleAdvanceSeason(season)
                                    }
                                    disabled={updateSeasonMutation.isPending}
                                    className="gap-1 bg-brand-forest text-white hover:bg-brand-dark"
                                  >
                                    <span>{statusMeta.nextActionLabel}</span>
                                    <ArrowRight
                                      className="size-3.5"
                                      aria-hidden="true"
                                    />
                                  </Button>
                                ) : null}

                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  aria-label={`Chỉnh sửa mùa vụ ${season.seasonName}`}
                                  onClick={() => openEditSeason(season)}
                                >
                                  <Pencil
                                    className="size-4"
                                    aria-hidden="true"
                                  />
                                </Button>

                                {canDelete ? (
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="icon"
                                    aria-label={`Xóa mùa vụ ${season.seasonName}`}
                                    disabled={!deletable}
                                    title={
                                      deletable
                                        ? "Xóa mùa vụ lập kế hoạch"
                                        : "Chỉ có thể xóa mùa vụ ở trạng thái Lập kế hoạch"
                                    }
                                    onClick={() =>
                                      setDeleteTarget({
                                        kind: "season",
                                        item: season,
                                      })
                                    }
                                  >
                                    <Trash2
                                      className="size-4"
                                      aria-hidden="true"
                                    />
                                  </Button>
                                ) : null}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </Card>
              ) : null}
            </>
          )}
        </TabsContent>

        <TabsContent value="plots" className="mt-3">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
            </div>
          ) : filteredPlots.length === 0 ? (
            <Card className="border-border-subtle bg-surface-card">
              <CardContent className="py-8 text-center text-sm text-gray-500">
                Chưa có lô đất nào phù hợp.
              </CardContent>
            </Card>
          ) : (
            <>
              <div
                className={cn("space-y-3", isFarmStaff ? "block" : "md:hidden")}
              >
                {filteredPlots.map((plot) => {
                  const activeSeason = getActiveSeasonForPlot(plot.id, seasons);
                  const deleteGuard = canDeletePlot(plot.id, seasons);

                  return (
                    <Card
                      key={plot.id}
                      className="border-border-subtle bg-surface-card shadow-xs"
                    >
                      <CardContent className="space-y-3 pt-4">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-brand-forest">
                                {plot.plotCode}
                              </span>
                              <span className="text-xs text-gray-500 tabular-nums">
                                {plot.areaSqm} m²
                              </span>
                            </div>
                            <h2 className="text-base font-bold text-gray-900">
                              {plot.name}
                            </h2>
                          </div>

                          {activeSeason ? (
                            <Badge
                              variant="outline"
                              className={
                                SEASON_STATUS_META[activeSeason.status]
                                  .badgeClassName
                              }
                            >
                              {SEASON_STATUS_META[activeSeason.status].label}
                            </Badge>
                          ) : (
                            <Badge variant="outline">Đất trống</Badge>
                          )}
                        </div>

                        {activeSeason ? (
                          <p className="text-xs text-gray-700">
                            Mùa vụ hiện tại:{" "}
                            <span className="font-semibold">
                              {activeSeason.seasonName}
                            </span>
                          </p>
                        ) : null}

                        <LabTelemetrySummary
                          soilTestResult={plot.soilTestResult}
                          waterTestResult={plot.waterTestResult}
                        />

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => openCreateSeason(plot.id)}
                            className="min-h-11 flex-1 gap-1.5"
                          >
                            <Plus className="size-4" aria-hidden="true" />
                            <span>Tạo mùa vụ</span>
                          </Button>

                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label={`Chỉnh sửa lô đất ${plot.plotCode}`}
                            onClick={() => openEditPlot(plot)}
                            className="min-h-11 min-w-11"
                          >
                            <Pencil className="size-4" aria-hidden="true" />
                          </Button>

                          {canDelete ? (
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              aria-label={`Xóa lô đất ${plot.plotCode}`}
                              disabled={!deleteGuard.allowed}
                              title={deleteGuard.reason ?? "Xóa lô đất"}
                              onClick={() =>
                                setDeleteTarget({ kind: "plot", item: plot })
                              }
                              className="min-h-11 min-w-11"
                            >
                              <Trash2 className="size-4" aria-hidden="true" />
                            </Button>
                          ) : null}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {!isFarmStaff ? (
                <Card className="hidden border-border-subtle bg-surface-card shadow-xs md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Mã lô</TableHead>
                        <TableHead>Tên lô đất</TableHead>
                        <TableHead>Diện tích</TableHead>
                        <TableHead>Mùa vụ hiện tại</TableHead>
                        <TableHead>Xét nghiệm đất / nước</TableHead>
                        <TableHead className="text-right">Thao tác</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPlots.map((plot) => {
                        const activeSeason = getActiveSeasonForPlot(
                          plot.id,
                          seasons,
                        );
                        const deleteGuard = canDeletePlot(plot.id, seasons);

                        return (
                          <TableRow key={plot.id}>
                            <TableCell className="font-bold text-brand-forest">
                              {plot.plotCode}
                            </TableCell>
                            <TableCell className="font-medium text-gray-900">
                              {plot.name}
                            </TableCell>
                            <TableCell className="text-xs text-gray-700 tabular-nums">
                              {plot.areaSqm} m²
                            </TableCell>
                            <TableCell>
                              {activeSeason ? (
                                <div className="space-y-1">
                                  <Badge
                                    variant="outline"
                                    className={
                                      SEASON_STATUS_META[activeSeason.status]
                                        .badgeClassName
                                    }
                                  >
                                    {
                                      SEASON_STATUS_META[activeSeason.status]
                                        .label
                                    }
                                  </Badge>
                                  <p className="text-xs text-gray-600">
                                    {activeSeason.seasonName}
                                  </p>
                                </div>
                              ) : (
                                <Badge variant="outline">Đất trống</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <LabTelemetrySummary
                                soilTestResult={plot.soilTestResult}
                                waterTestResult={plot.waterTestResult}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openCreateSeason(plot.id)}
                                  className="gap-1"
                                >
                                  <Plus
                                    className="size-3.5"
                                    aria-hidden="true"
                                  />
                                  <span>Mùa vụ</span>
                                </Button>

                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  aria-label={`Chỉnh sửa lô đất ${plot.plotCode}`}
                                  onClick={() => openEditPlot(plot)}
                                >
                                  <Pencil
                                    className="size-4"
                                    aria-hidden="true"
                                  />
                                </Button>

                                {canDelete ? (
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="icon"
                                    aria-label={`Xóa lô đất ${plot.plotCode}`}
                                    disabled={!deleteGuard.allowed}
                                    title={deleteGuard.reason ?? "Xóa lô đất"}
                                    onClick={() =>
                                      setDeleteTarget({
                                        kind: "plot",
                                        item: plot,
                                      })
                                    }
                                  >
                                    <Trash2
                                      className="size-4"
                                      aria-hidden="true"
                                    />
                                  </Button>
                                ) : null}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </Card>
              ) : null}
            </>
          )}
        </TabsContent>
      </Tabs>

      <PlotDialog
        open={plotDialogOpen}
        onOpenChange={setPlotDialogOpen}
        plot={editingPlot}
        isPending={createPlotMutation.isPending || updatePlotMutation.isPending}
        onSubmit={async (payload) => {
          if (editingPlot) {
            await updatePlotMutation.mutateAsync({
              id: editingPlot.id,
              payload,
            });
          } else {
            await createPlotMutation.mutateAsync(payload as CreatePlotDto);
          }
        }}
      />

      <SeasonDialog
        open={seasonDialogOpen}
        onOpenChange={setSeasonDialogOpen}
        plots={plots}
        season={editingSeason}
        defaultPlotId={defaultSeasonPlotId}
        isPending={
          createSeasonMutation.isPending || updateSeasonMutation.isPending
        }
        onSubmit={async (payload) => {
          if (editingSeason) {
            await updateSeasonMutation.mutateAsync({
              id: editingSeason.id,
              payload,
            });
          } else {
            await createSeasonMutation.mutateAsync(payload as CreateSeasonDto);
          }
        }}
      />

      {canDelete && deleteTarget ? (
        <DeleteConfirmDialog
          open={Boolean(deleteTarget)}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
          title={
            deleteTarget.kind === "plot"
              ? `Xóa lô đất ${deleteTarget.item.plotCode}?`
              : `Xóa mùa vụ "${deleteTarget.item.seasonName}"?`
          }
          description={
            deleteTarget.kind === "plot"
              ? "Lô đất sẽ bị ẩn khỏi danh sách canh tác (soft-delete). Hành động này không xóa lịch sử mùa vụ đã hoàn tất."
              : "Mùa vụ ở trạng thái Lập kế hoạch sẽ bị xóa vĩnh viễn khi chưa có lô hàng hoặc nhật ký nào."
          }
          isPending={
            deletePlotMutation.isPending || deleteSeasonMutation.isPending
          }
          onConfirm={async () => {
            if (deleteTarget.kind === "plot") {
              await deletePlotMutation.mutateAsync(deleteTarget.item.id);
            } else {
              await deleteSeasonMutation.mutateAsync(deleteTarget.item.id);
            }
          }}
        />
      ) : null}
    </div>
  );
}
