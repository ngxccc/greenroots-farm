import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Checkbox,
  Input,
  Label,
} from "@greenroots/ui";
import {
  AlertCircle,
  ExternalLink,
  FlaskConical,
  Upload,
  X,
} from "lucide-react";
import { useState, type ChangeEvent } from "react";
import { validateMediaFile } from "@/lib/cloudinary-upload";
import {
  formatDisplayDate,
  type SoilTestDraft,
  type SoilTestResult,
  type WaterTestDraft,
  type WaterTestResult,
} from "../plots-seasons.utils";

export interface PendingCertPreview {
  readonly file: File;
  readonly previewUrl: string;
}

interface SoilTestEditorProps {
  readonly value: SoilTestDraft | null;
  readonly onChange: (next: SoilTestDraft | null) => void;
  readonly pendingCert?: PendingCertPreview | null;
  readonly onPendingCertChange?: (next: PendingCertPreview | null) => void;
}

interface WaterTestEditorProps {
  readonly value: WaterTestDraft | null;
  readonly onChange: (next: WaterTestDraft | null) => void;
  readonly pendingCert?: PendingCertPreview | null;
  readonly onPendingCertChange?: (next: PendingCertPreview | null) => void;
}

function createEmptySoilTest(): SoilTestDraft {
  return {
    ph: null,
    nitrogen_ppm: null,
    phosphorus_ppm: null,
    potassium_ppm: null,
    heavy_metals: {
      lead_ppm: null,
      cadmium_ppm: null,
      pass: false,
    },
    tested_at: new Date().toISOString().slice(0, 10),
  };
}

function createEmptyWaterTest(): WaterTestDraft {
  return {
    ph: null,
    ec_ms_cm: null,
    dissolved_oxygen_ppm: null,
    e_coli_cfu_100ml: null,
    heavy_metals_pass: false,
    tested_at: new Date().toISOString().slice(0, 10),
  };
}

function parseNullableNumber(raw: string): number | null {
  if (raw.trim() === "") {
    return null;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Editable structured soil test telemetry section with deferred signed Cloudinary certificate upload.
 */
export function SoilTestEditor({
  value,
  onChange,
  pendingCert,
  onPendingCertChange,
}: SoilTestEditorProps) {
  const [uploadError, setUploadError] = useState<string | null>(null);

  function handleCertificateSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !value) return;

    const validationError = validateMediaFile(file, "image");
    if (validationError) {
      setUploadError(validationError);
      return;
    }

    setUploadError(null);
    if (pendingCert) {
      URL.revokeObjectURL(pendingCert.previewUrl);
    }
    onPendingCertChange?.({
      file,
      previewUrl: URL.createObjectURL(file),
    });
  }

  return (
    <div className="space-y-3 border-t border-border-subtle pt-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="enable-soil-test"
            checked={Boolean(value)}
            onCheckedChange={(checked) =>
              onChange(checked ? (value ?? createEmptySoilTest()) : null)
            }
          />
          <Label htmlFor="enable-soil-test" className="text-sm font-semibold">
            Kết quả xét nghiệm đất (Soil Test)
          </Label>
        </div>
        {value ? (
          <Badge variant="outline" className="text-xs tabular-nums">
            pH {value.ph ?? "—"}
          </Badge>
        ) : null}
      </div>

      {value ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="soil-ph" className="text-xs">
              pH đất
            </Label>
            <Input
              id="soil-ph"
              type="number"
              step="0.1"
              min="0"
              max="14"
              placeholder="VD: 6.5"
              value={value.ph ?? ""}
              onChange={(e) =>
                onChange({ ...value, ph: parseNullableNumber(e.target.value) })
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="soil-n" className="text-xs">
              Nitơ (ppm)
            </Label>
            <Input
              id="soil-n"
              type="number"
              step="0.1"
              min="0"
              placeholder="VD: 45"
              value={value.nitrogen_ppm ?? ""}
              onChange={(e) =>
                onChange({
                  ...value,
                  nitrogen_ppm: parseNullableNumber(e.target.value),
                })
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="soil-p" className="text-xs">
              Phốt pho (ppm)
            </Label>
            <Input
              id="soil-p"
              type="number"
              step="0.1"
              min="0"
              placeholder="VD: 30"
              value={value.phosphorus_ppm ?? ""}
              onChange={(e) =>
                onChange({
                  ...value,
                  phosphorus_ppm: parseNullableNumber(e.target.value),
                })
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="soil-k" className="text-xs">
              Kali (ppm)
            </Label>
            <Input
              id="soil-k"
              type="number"
              step="0.1"
              min="0"
              placeholder="VD: 120"
              value={value.potassium_ppm ?? ""}
              onChange={(e) =>
                onChange({
                  ...value,
                  potassium_ppm: parseNullableNumber(e.target.value),
                })
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="soil-lead" className="text-xs">
              Chì Pb (ppm)
            </Label>
            <Input
              id="soil-lead"
              type="number"
              step="0.01"
              min="0"
              placeholder="VD: 0.1"
              value={value.heavy_metals.lead_ppm ?? ""}
              onChange={(e) =>
                onChange({
                  ...value,
                  heavy_metals: {
                    ...value.heavy_metals,
                    lead_ppm: parseNullableNumber(e.target.value),
                  },
                })
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="soil-cadmium" className="text-xs">
              Cadimi Cd (ppm)
            </Label>
            <Input
              id="soil-cadmium"
              type="number"
              step="0.01"
              min="0"
              placeholder="VD: 0.02"
              value={value.heavy_metals.cadmium_ppm ?? ""}
              onChange={(e) =>
                onChange({
                  ...value,
                  heavy_metals: {
                    ...value.heavy_metals,
                    cadmium_ppm: parseNullableNumber(e.target.value),
                  },
                })
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="soil-tested-at" className="text-xs">
              Ngày xét nghiệm
            </Label>
            <Input
              id="soil-tested-at"
              type="date"
              value={value.tested_at.slice(0, 10)}
              onChange={(e) =>
                onChange({ ...value, tested_at: e.target.value })
              }
            />
          </div>
          <div className="col-span-2 flex items-end gap-2">
            <div className="flex items-center gap-2 pb-2">
              <Checkbox
                id="soil-heavy-pass"
                checked={value.heavy_metals.pass}
                onCheckedChange={(checked) =>
                  onChange({
                    ...value,
                    heavy_metals: {
                      ...value.heavy_metals,
                      pass: Boolean(checked),
                    },
                  })
                }
              />
              <Label htmlFor="soil-heavy-pass" className="text-xs font-medium">
                Đạt chuẩn kim loại nặng
              </Label>
            </div>
          </div>

          <div className="col-span-full space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="soil-cert-url" className="text-xs">
                Chứng nhận phòng lab (certificate_url)
              </Label>
              <Label
                htmlFor="soil-cert-file"
                className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-brand-forest hover:underline"
              >
                <Upload className="size-3.5" aria-hidden="true" />
                <span>Chọn ảnh chứng nhận</span>
              </Label>
              <Input
                id="soil-cert-file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleCertificateSelected}
                className="hidden"
              />
            </div>
            {pendingCert ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-brand-forest/40 bg-green-50/50 p-2">
                <div className="flex min-w-0 items-center gap-2">
                  <img
                    src={pendingCert.previewUrl}
                    alt="Chứng nhận đất chờ lưu"
                    className="size-10 shrink-0 rounded object-cover"
                  />
                  <span className="truncate text-xs text-gray-700">
                    {pendingCert.file.name} (chờ lưu)
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    URL.revokeObjectURL(pendingCert.previewUrl);
                    onPendingCertChange?.(null);
                  }}
                  aria-label="Bỏ ảnh chứng nhận đất"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
            ) : null}
            <Input
              id="soil-cert-url"
              type="url"
              placeholder="https://res.cloudinary.com/..."
              value={value.certificate_url ?? ""}
              onChange={(e) =>
                onChange({
                  ...value,
                  certificate_url: e.target.value.trim() || undefined,
                })
              }
            />
            {uploadError ? (
              <Alert variant="destructive" role="alert">
                <AlertCircle className="size-4" aria-hidden="true" />
                <AlertDescription className="text-xs">
                  {uploadError}
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Editable structured water test telemetry section with deferred signed Cloudinary certificate upload.
 */
export function WaterTestEditor({
  value,
  onChange,
  pendingCert,
  onPendingCertChange,
}: WaterTestEditorProps) {
  const [uploadError, setUploadError] = useState<string | null>(null);

  function handleCertificateSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !value) return;

    const validationError = validateMediaFile(file, "image");
    if (validationError) {
      setUploadError(validationError);
      return;
    }

    setUploadError(null);
    if (pendingCert) {
      URL.revokeObjectURL(pendingCert.previewUrl);
    }
    onPendingCertChange?.({
      file,
      previewUrl: URL.createObjectURL(file),
    });
  }

  return (
    <div className="space-y-3 border-t border-border-subtle pt-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="enable-water-test"
            checked={Boolean(value)}
            onCheckedChange={(checked) =>
              onChange(checked ? (value ?? createEmptyWaterTest()) : null)
            }
          />
          <Label htmlFor="enable-water-test" className="text-sm font-semibold">
            Kết quả xét nghiệm nước (Water Test)
          </Label>
        </div>
        {value ? (
          <Badge variant="outline" className="text-xs tabular-nums">
            pH {value.ph ?? "—"}
          </Badge>
        ) : null}
      </div>

      {value ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="water-ph" className="text-xs">
              pH nước
            </Label>
            <Input
              id="water-ph"
              type="number"
              step="0.1"
              min="0"
              max="14"
              placeholder="VD: 6.8"
              value={value.ph ?? ""}
              onChange={(e) =>
                onChange({ ...value, ph: parseNullableNumber(e.target.value) })
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="water-ec" className="text-xs">
              EC (mS/cm)
            </Label>
            <Input
              id="water-ec"
              type="number"
              step="0.1"
              min="0"
              placeholder="VD: 1.1"
              value={value.ec_ms_cm ?? ""}
              onChange={(e) =>
                onChange({
                  ...value,
                  ec_ms_cm: parseNullableNumber(e.target.value),
                })
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="water-do" className="text-xs">
              Oxy hòa tan (ppm)
            </Label>
            <Input
              id="water-do"
              type="number"
              step="0.1"
              min="0"
              placeholder="VD: 7.2"
              value={value.dissolved_oxygen_ppm ?? ""}
              onChange={(e) =>
                onChange({
                  ...value,
                  dissolved_oxygen_ppm: parseNullableNumber(e.target.value),
                })
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="water-ecoli" className="text-xs">
              E.coli (CFU/100ml)
            </Label>
            <Input
              id="water-ecoli"
              type="number"
              step="1"
              min="0"
              placeholder="VD: 0"
              value={value.e_coli_cfu_100ml ?? ""}
              onChange={(e) =>
                onChange({
                  ...value,
                  e_coli_cfu_100ml: parseNullableNumber(e.target.value),
                })
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="water-tested-at" className="text-xs">
              Ngày xét nghiệm
            </Label>
            <Input
              id="water-tested-at"
              type="date"
              value={value.tested_at.slice(0, 10)}
              onChange={(e) =>
                onChange({ ...value, tested_at: e.target.value })
              }
            />
          </div>
          <div className="flex items-end pb-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="water-heavy-pass"
                checked={value.heavy_metals_pass}
                onCheckedChange={(checked) =>
                  onChange({
                    ...value,
                    heavy_metals_pass: Boolean(checked),
                  })
                }
              />
              <Label htmlFor="water-heavy-pass" className="text-xs font-medium">
                Đạt chuẩn KLN
              </Label>
            </div>
          </div>

          <div className="col-span-full space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="water-cert-url" className="text-xs">
                Chứng nhận phòng lab (certificate_url)
              </Label>
              <Label
                htmlFor="water-cert-file"
                className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-brand-forest hover:underline"
              >
                <Upload className="size-3.5" aria-hidden="true" />
                <span>Chọn ảnh chứng nhận</span>
              </Label>
              <Input
                id="water-cert-file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleCertificateSelected}
                className="hidden"
              />
            </div>
            {pendingCert ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-brand-forest/40 bg-green-50/50 p-2">
                <div className="flex min-w-0 items-center gap-2">
                  <img
                    src={pendingCert.previewUrl}
                    alt="Chứng nhận nước chờ lưu"
                    className="size-10 shrink-0 rounded object-cover"
                  />
                  <span className="truncate text-xs text-gray-700">
                    {pendingCert.file.name} (chờ lưu)
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    URL.revokeObjectURL(pendingCert.previewUrl);
                    onPendingCertChange?.(null);
                  }}
                  aria-label="Bỏ ảnh chứng nhận nước"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
            ) : null}
            <Input
              id="water-cert-url"
              type="url"
              placeholder="https://res.cloudinary.com/..."
              value={value.certificate_url ?? ""}
              onChange={(e) =>
                onChange({
                  ...value,
                  certificate_url: e.target.value.trim() || undefined,
                })
              }
            />
            {uploadError ? (
              <Alert variant="destructive" role="alert">
                <AlertCircle className="size-4" aria-hidden="true" />
                <AlertDescription className="text-xs">
                  {uploadError}
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Compact lab telemetry display for soil and water test results on plot cards and table rows.
 */
export function LabTelemetrySummary({
  soilTestResult,
  waterTestResult,
}: {
  readonly soilTestResult: SoilTestResult | null;
  readonly waterTestResult: WaterTestResult | null;
}) {
  if (!soilTestResult && !waterTestResult) {
    return (
      <span className="text-xs text-gray-500">Chưa có xét nghiệm đất/nước</span>
    );
  }

  return (
    <div className="space-y-1.5 text-xs">
      {soilTestResult ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <FlaskConical
            className="size-3.5 shrink-0 text-brand-forest"
            aria-hidden="true"
          />
          <span className="font-semibold text-gray-800">Đất:</span>
          <span className="text-gray-700 tabular-nums">
            pH {soilTestResult.ph} · NPK {soilTestResult.nitrogen_ppm}/
            {soilTestResult.phosphorus_ppm}/{soilTestResult.potassium_ppm}
          </span>
          <Badge
            variant="outline"
            className={
              soilTestResult.heavy_metals.pass
                ? "border-emerald-200 bg-emerald-50 text-brand-dark"
                : "border-red-200 bg-red-50 text-status-spoiled"
            }
          >
            {soilTestResult.heavy_metals.pass ? "Đạt KLN" : "Vượt ngưỡng"}
          </Badge>
          <span className="text-gray-500 tabular-nums">
            ({formatDisplayDate(soilTestResult.tested_at)})
          </span>
          {soilTestResult.certificate_url ? (
            <a
              href={soilTestResult.certificate_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 font-medium text-brand-forest hover:underline"
            >
              <span>Chứng nhận</span>
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          ) : null}
        </div>
      ) : null}

      {waterTestResult ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <FlaskConical
            className="size-3.5 shrink-0 text-brand-forest"
            aria-hidden="true"
          />
          <span className="font-semibold text-gray-800">Nước:</span>
          <span className="text-gray-700 tabular-nums">
            pH {waterTestResult.ph} · EC {waterTestResult.ec_ms_cm} · DO{" "}
            {waterTestResult.dissolved_oxygen_ppm}
          </span>
          <Badge
            variant="outline"
            className={
              waterTestResult.heavy_metals_pass
                ? "border-emerald-200 bg-emerald-50 text-brand-dark"
                : "border-red-200 bg-red-50 text-status-spoiled"
            }
          >
            {waterTestResult.heavy_metals_pass ? "Đạt chuẩn" : "Không đạt"}
          </Badge>
          <span className="text-gray-500 tabular-nums">
            ({formatDisplayDate(waterTestResult.tested_at)})
          </span>
          {waterTestResult.certificate_url ? (
            <a
              href={waterTestResult.certificate_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 font-medium text-brand-forest hover:underline"
            >
              <span>Chứng nhận</span>
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
