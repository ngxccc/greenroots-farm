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
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@greenroots/ui";
import { AlertCircle } from "lucide-react";
import { useState, type SyntheticEvent } from "react";
import {
  validateSeasonInput,
  type CreateSeasonDto,
  type PlotDto,
  type SeasonDto,
  type UpdateSeasonDto,
} from "../plots-seasons.utils";

interface SeasonDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly plots: readonly PlotDto[];
  readonly season: SeasonDto | null;
  readonly defaultPlotId?: string;
  readonly isPending: boolean;
  readonly onSubmit: (
    payload: CreateSeasonDto | UpdateSeasonDto,
  ) => Promise<void>;
}

/**
 * Dialog for creating a new season in `planning` status or editing an existing season.
 */
export function SeasonDialog({
  open,
  onOpenChange,
  plots,
  season,
  defaultPlotId,
  isPending,
  onSubmit,
}: SeasonDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {season ? "Cập nhật mùa vụ" : "Tạo mùa vụ mới"}
          </DialogTitle>
          <DialogDescription>
            Mùa vụ mới khởi tạo ở trạng thái Lập kế hoạch và gắn với một lô đất
            đang hoạt động.
          </DialogDescription>
        </DialogHeader>

        {open ? (
          <SeasonDialogForm
            key={season?.id ?? defaultPlotId ?? "new-season"}
            plots={plots}
            season={season}
            defaultPlotId={defaultPlotId}
            isPending={isPending}
            onClose={() => onOpenChange(false)}
            onSubmit={onSubmit}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SeasonDialogForm({
  plots,
  season,
  defaultPlotId,
  isPending,
  onClose,
  onSubmit,
}: {
  readonly plots: readonly PlotDto[];
  readonly season: SeasonDto | null;
  readonly defaultPlotId?: string;
  readonly isPending: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (
    payload: CreateSeasonDto | UpdateSeasonDto,
  ) => Promise<void>;
}) {
  const [plotId, setPlotId] = useState(
    season?.plotId ?? defaultPlotId ?? plots[0]?.id ?? "",
  );
  const [seasonName, setSeasonName] = useState(season?.seasonName ?? "");
  const [startDate, setStartDate] = useState(
    () =>
      season?.startDate.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
  );
  const [expectedHarvestDate, setExpectedHarvestDate] = useState(
    () =>
      season?.expectedHarvestDate.slice(0, 10) ??
      new Date().toISOString().slice(0, 10),
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateSeasonInput({
      plotId,
      seasonName,
      startDate,
      expectedHarvestDate,
    });

    if (!validation.valid) {
      setErrorMessage(validation.error);
      return;
    }

    setErrorMessage(null);
    try {
      await onSubmit({
        plotId,
        seasonName: seasonName.trim(),
        startDate,
        expectedHarvestDate,
      });
      onClose();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Không thể lưu thông tin mùa vụ.",
      );
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="season-plot">Lô đất canh tác</Label>
        <Select
          value={plotId}
          onValueChange={(value) => value && setPlotId(value)}
          disabled={Boolean(season && season.status !== "planning")}
        >
          <SelectTrigger id="season-plot" className="w-full">
            <SelectValue placeholder="Chọn lô đất" />
          </SelectTrigger>
          <SelectContent>
            {plots.map((plot) => (
              <SelectItem key={plot.id} value={plot.id}>
                {plot.plotCode} · {plot.name} ({plot.areaSqm} m²)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="season-name">Tên mùa vụ / Giống cây</Label>
        <Input
          id="season-name"
          placeholder="VD: Cải ngọt hữu cơ — Vụ Thu 2026"
          value={seasonName}
          onChange={(e) => setSeasonName(e.target.value)}
          required
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="season-start">Ngày bắt đầu</Label>
          <Input
            id="season-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="season-harvest">Ngày dự kiến thu hoạch</Label>
          <Input
            id="season-harvest"
            type="date"
            value={expectedHarvestDate}
            onChange={(e) => setExpectedHarvestDate(e.target.value)}
            required
          />
        </div>
      </div>

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
          onClick={onClose}
          disabled={isPending}
        >
          Hủy
        </Button>
        <Button
          type="submit"
          disabled={isPending || plots.length === 0}
          className="bg-brand-forest text-white hover:bg-brand-dark"
        >
          {isPending ? "Đang lưu..." : season ? "Lưu thay đổi" : "Tạo mùa vụ"}
        </Button>
      </DialogFooter>
    </form>
  );
}
