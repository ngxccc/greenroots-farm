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
} from "@greenroots/ui";
import { AlertCircle } from "lucide-react";
import { useState, type SyntheticEvent } from "react";
import { uploadSignedMedia } from "@/lib/cloudinary-upload";
import {
  validatePlotInput,
  type CreatePlotDto,
  type PlotDto,
  type SoilTestDraft,
  type SoilTestResult,
  type UpdatePlotDto,
  type WaterTestDraft,
  type WaterTestResult,
} from "../plots-seasons.utils";
import {
  SoilTestEditor,
  WaterTestEditor,
  type PendingCertPreview,
} from "./lab-test-section";

interface PlotDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly plot: PlotDto | null;
  readonly isPending: boolean;
  readonly onSubmit: (payload: CreatePlotDto | UpdatePlotDto) => Promise<void>;
}

/**
 * Dialog for creating or updating a cultivation plot and its soil/water lab results.
 */
export function PlotDialog({
  open,
  onOpenChange,
  plot,
  isPending,
  onSubmit,
}: PlotDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {plot ? `Cập nhật lô đất ${plot.plotCode}` : "Thêm lô đất mới"}
          </DialogTitle>
          <DialogDescription>
            Khai báo mã lô, diện tích canh tác (m²) và chỉ số xét nghiệm
            đất/nước theo chuẩn VietGAP.
          </DialogDescription>
        </DialogHeader>

        {open ? (
          <PlotDialogForm
            key={plot?.id ?? "new-plot"}
            plot={plot}
            isPending={isPending}
            onClose={() => onOpenChange(false)}
            onSubmit={onSubmit}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PlotDialogForm({
  plot,
  isPending,
  onClose,
  onSubmit,
}: {
  readonly plot: PlotDto | null;
  readonly isPending: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (payload: CreatePlotDto | UpdatePlotDto) => Promise<void>;
}) {
  const [plotCode, setPlotCode] = useState(plot?.plotCode ?? "");
  const [name, setName] = useState(plot?.name ?? "");
  const [areaSqm, setAreaSqm] = useState(plot ? String(plot.areaSqm) : "500");
  const [soilTestResult, setSoilTestResult] = useState<SoilTestDraft | null>(
    plot?.soilTestResult ?? null,
  );
  const [waterTestResult, setWaterTestResult] = useState<WaterTestDraft | null>(
    plot?.waterTestResult ?? null,
  );
  const [pendingSoilCert, setPendingSoilCert] =
    useState<PendingCertPreview | null>(null);
  const [pendingWaterCert, setPendingWaterCert] =
    useState<PendingCertPreview | null>(null);
  const [isUploadingCerts, setIsUploadingCerts] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const numericArea = Number(areaSqm);
    const validation = validatePlotInput({
      plotCode,
      name,
      areaSqm: numericArea,
      soilTestResult,
      waterTestResult,
    });

    if (!validation.valid) {
      setErrorMessage(validation.error);
      return;
    }

    setErrorMessage(null);
    setIsUploadingCerts(true);
    try {
      let nextSoil = soilTestResult;
      if (nextSoil && pendingSoilCert) {
        const uploaded = await uploadSignedMedia(pendingSoilCert.file, "plots");
        nextSoil = { ...nextSoil, certificate_url: uploaded.secureUrl };
        URL.revokeObjectURL(pendingSoilCert.previewUrl);
        setPendingSoilCert(null);
      }

      let nextWater = waterTestResult;
      if (nextWater && pendingWaterCert) {
        const uploaded = await uploadSignedMedia(
          pendingWaterCert.file,
          "plots",
        );
        nextWater = { ...nextWater, certificate_url: uploaded.secureUrl };
        URL.revokeObjectURL(pendingWaterCert.previewUrl);
        setPendingWaterCert(null);
      }

      await onSubmit({
        plotCode: plotCode.trim(),
        name: name.trim(),
        areaSqm: numericArea,
        soilTestResult: nextSoil
          ? ({
              ...nextSoil,
              tested_at: toIsoDateTime(nextSoil.tested_at),
            } as SoilTestResult)
          : null,
        waterTestResult: nextWater
          ? ({
              ...nextWater,
              tested_at: toIsoDateTime(nextWater.tested_at),
            } as WaterTestResult)
          : null,
      });
      onClose();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Không thể lưu thông tin lô đất.",
      );
    } finally {
      setIsUploadingCerts(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="plot-code">Mã lô đất</Label>
          <Input
            id="plot-code"
            placeholder="VD: PLOT-A1"
            value={plotCode}
            onChange={(e) => setPlotCode(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="plot-name">Tên lô đất</Label>
          <Input
            id="plot-name"
            placeholder="VD: Nhà màng A1 — Rau ăn lá"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="plot-area">Diện tích (m²)</Label>
        <Input
          id="plot-area"
          type="number"
          min="1"
          step="1"
          value={areaSqm}
          onChange={(e) => setAreaSqm(e.target.value)}
          required
        />
      </div>

      <SoilTestEditor
        value={soilTestResult}
        onChange={(next) => {
          setSoilTestResult(next);
          if (!next && pendingSoilCert) {
            URL.revokeObjectURL(pendingSoilCert.previewUrl);
            setPendingSoilCert(null);
          }
        }}
        pendingCert={pendingSoilCert}
        onPendingCertChange={setPendingSoilCert}
      />

      <WaterTestEditor
        value={waterTestResult}
        onChange={(next) => {
          setWaterTestResult(next);
          if (!next && pendingWaterCert) {
            URL.revokeObjectURL(pendingWaterCert.previewUrl);
            setPendingWaterCert(null);
          }
        }}
        pendingCert={pendingWaterCert}
        onPendingCertChange={setPendingWaterCert}
      />

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
          disabled={isPending || isUploadingCerts}
        >
          Hủy
        </Button>
        <Button
          type="submit"
          disabled={isPending || isUploadingCerts}
          className="bg-brand-forest text-white hover:bg-brand-dark"
        >
          {isPending || isUploadingCerts
            ? "Đang lưu..."
            : plot
              ? "Lưu thay đổi"
              : "Tạo lô đất"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function toIsoDateTime(value: string): string {
  if (value.includes("T")) {
    return value;
  }
  return `${value.slice(0, 10)}T00:00:00.000Z`;
}
