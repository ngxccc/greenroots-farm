import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Input,
  Label,
  Skeleton,
} from "@greenroots/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { useRef, useState, type ChangeEvent, type SubmitEvent } from "react";
import {
  mapFarmSettingsDtoToFormValues,
  mapFormValuesToUpdateFarmSettingsDto,
  validateFarmSettingsForm,
  type FarmSettingsFormValues,
  type FarmSettingsValidationErrors,
} from "@/features/admin/farm-settings-validation";
import { api, extractApiErrorMessage } from "@/lib/api-client";
import { uploadSignedMedia } from "@/lib/cloudinary-upload";

const FARM_SETTINGS_QUERY_KEY = ["farms", "settings"] as const;

/**
 * Farm operational profile, shipping invariants (ADR-0034), flash sale, payment toggles,
 * and VietGAP certificate upload panel (BO-10 #130).
 */
export function FarmSettingsPanel() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [draftValues, setDraftValues] = useState<FarmSettingsFormValues | null>(
    null,
  );
  const [fieldErrors, setFieldErrors] = useState<FarmSettingsValidationErrors>(
    {},
  );
  const [submitStatus, setSubmitStatus] = useState<{
    readonly variant: "success" | "destructive";
    readonly title: string;
    readonly description: string;
  } | null>(null);
  const [uploadingCert, setUploadingCert] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const settingsQuery = useQuery({
    queryKey: FARM_SETTINGS_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/farms/settings");
      if (error) {
        throw new Error(
          extractApiErrorMessage(error, "Không thể tải cấu hình nông trại."),
        );
      }
      return data.data;
    },
  });

  const formValues =
    draftValues ??
    (settingsQuery.data
      ? mapFarmSettingsDtoToFormValues(settingsQuery.data)
      : null);

  const updateMutation = useMutation({
    mutationFn: async (values: FarmSettingsFormValues) => {
      const payload = mapFormValuesToUpdateFarmSettingsDto(values);
      const { data, error } = await api.PATCH("/api/v1/farms/settings", {
        body: payload,
      });
      if (error) {
        throw new Error(
          extractApiErrorMessage(error, "Không thể lưu cấu hình nông trại."),
        );
      }
      return data.data;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(FARM_SETTINGS_QUERY_KEY, updated);
      setDraftValues(mapFarmSettingsDtoToFormValues(updated));
      setFieldErrors({});
      setSubmitStatus({
        variant: "success",
        title: "Đã lưu cấu hình nông trại",
        description:
          "Thông số vận hành, cấu hình giao hàng và phương thức thanh toán đã được cập nhật.",
      });
    },
    onError: (err) => {
      setSubmitStatus({
        variant: "destructive",
        title: "Lưu cấu hình thất bại",
        description:
          err instanceof Error
            ? err.message
            : "Đã có lỗi xảy ra khi cập nhật cấu hình nông trại.",
      });
    },
  });

  function updateField<K extends keyof FarmSettingsFormValues>(
    key: K,
    value: FarmSettingsFormValues[K],
  ) {
    setDraftValues((prev) => {
      const base =
        prev ??
        (settingsQuery.data
          ? mapFarmSettingsDtoToFormValues(settingsQuery.data)
          : null);
      return base ? { ...base, [key]: value } : null;
    });
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  async function handleCertificateUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setUploadingCert(true);
    try {
      const result = await uploadSignedMedia(file, "farms", "image");
      updateField("certificationUrl", result.secureUrl);
    } catch (err) {
      setUploadError(
        err instanceof Error
          ? err.message
          : "Không thể tải ảnh chứng nhận VietGAP.",
      );
    } finally {
      setUploadingCert(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!formValues) return;

    setSubmitStatus(null);
    const errors = validateFarmSettingsForm(formValues);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setSubmitStatus({
        variant: "destructive",
        title: "Dữ liệu cấu hình chưa hợp lệ",
        description:
          "Vui lòng kiểm tra các trường được đánh dấu lỗi (bao gồm ràng buộc bán kính giao hàng ADR-0034).",
      });
      return;
    }

    setFieldErrors({});
    updateMutation.mutate(formValues);
  }

  if (settingsQuery.isPending || !formValues) {
    if (settingsQuery.isError) {
      return (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Không thể tải cấu hình nông trại</AlertTitle>
          <AlertDescription>
            {settingsQuery.error instanceof Error
              ? settingsQuery.error.message
              : "Đã có lỗi xảy ra khi tải dữ liệu."}
          </AlertDescription>
        </Alert>
      );
    }

    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {submitStatus && (
        <Alert variant={submitStatus.variant}>
          {submitStatus.variant === "success" ? (
            <CheckCircle2 aria-hidden="true" />
          ) : (
            <AlertCircle aria-hidden="true" />
          )}
          <AlertTitle>{submitStatus.title}</AlertTitle>
          <AlertDescription>{submitStatus.description}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border-border-subtle bg-surface-card">
          <CardHeader className="border-b border-border-subtle pb-4">
            <CardTitle className="text-lg font-bold text-gray-900">
              Hồ sơ Nông trại &amp; Liên hệ
            </CardTitle>
            <CardDescription className="text-sm text-gray-600">
              Thông tin pháp lý, tọa độ xuất phát và kênh liên hệ chính thức.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 pt-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="farm-name">Tên thương hiệu</Label>
                <Input
                  id="farm-name"
                  value={formValues.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  aria-invalid={Boolean(fieldErrors.name)}
                />
                {fieldErrors.name && (
                  <p className="text-xs text-destructive">{fieldErrors.name}</p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="farm-legal-name">Tên pháp lý</Label>
                <Input
                  id="farm-legal-name"
                  value={formValues.legalName}
                  onChange={(e) => updateField("legalName", e.target.value)}
                  aria-invalid={Boolean(fieldErrors.legalName)}
                />
                {fieldErrors.legalName && (
                  <p className="text-xs text-destructive">
                    {fieldErrors.legalName}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="farm-tagline">Khẩu hiệu (Tagline)</Label>
                <Input
                  id="farm-tagline"
                  value={formValues.tagline}
                  onChange={(e) => updateField("tagline", e.target.value)}
                  placeholder="Rau hữu cơ thu hoạch trong ngày"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="farm-tax-id">Mã số thuế</Label>
                <Input
                  id="farm-tax-id"
                  value={formValues.taxId}
                  onChange={(e) => updateField("taxId", e.target.value)}
                  className="tabular-nums"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="farm-address">Địa chỉ nông trại</Label>
              <Input
                id="farm-address"
                value={formValues.address}
                onChange={(e) => updateField("address", e.target.value)}
                aria-invalid={Boolean(fieldErrors.address)}
              />
              {fieldErrors.address && (
                <p className="text-xs text-destructive">
                  {fieldErrors.address}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="farm-lat">Vĩ độ (Latitude)</Label>
                <Input
                  id="farm-lat"
                  type="number"
                  step="any"
                  value={formValues.latitude}
                  onChange={(e) =>
                    updateField("latitude", Number(e.target.value))
                  }
                  className="tabular-nums"
                  aria-invalid={Boolean(fieldErrors.latitude)}
                />
                {fieldErrors.latitude && (
                  <p className="text-xs text-destructive">
                    {fieldErrors.latitude}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="farm-lng">Kinh độ (Longitude)</Label>
                <Input
                  id="farm-lng"
                  type="number"
                  step="any"
                  value={formValues.longitude}
                  onChange={(e) =>
                    updateField("longitude", Number(e.target.value))
                  }
                  className="tabular-nums"
                  aria-invalid={Boolean(fieldErrors.longitude)}
                />
                {fieldErrors.longitude && (
                  <p className="text-xs text-destructive">
                    {fieldErrors.longitude}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="farm-hotline-primary">Hotline chính</Label>
                <Input
                  id="farm-hotline-primary"
                  value={formValues.hotlinePrimary}
                  onChange={(e) =>
                    updateField("hotlinePrimary", e.target.value)
                  }
                  className="tabular-nums"
                  aria-invalid={Boolean(fieldErrors.hotlinePrimary)}
                />
                {fieldErrors.hotlinePrimary && (
                  <p className="text-xs text-destructive">
                    {fieldErrors.hotlinePrimary}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="farm-hotline-support">Hotline hỗ trợ</Label>
                <Input
                  id="farm-hotline-support"
                  value={formValues.hotlineSupport}
                  onChange={(e) =>
                    updateField("hotlineSupport", e.target.value)
                  }
                  className="tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="farm-email-primary">Email chính</Label>
                <Input
                  id="farm-email-primary"
                  type="email"
                  value={formValues.emailPrimary}
                  onChange={(e) => updateField("emailPrimary", e.target.value)}
                  aria-invalid={Boolean(fieldErrors.emailPrimary)}
                />
                {fieldErrors.emailPrimary && (
                  <p className="text-xs text-destructive">
                    {fieldErrors.emailPrimary}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="farm-email-support">Email hỗ trợ</Label>
                <Input
                  id="farm-email-support"
                  type="email"
                  value={formValues.emailSupport}
                  onChange={(e) => updateField("emailSupport", e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="farm-hours-weekdays">Giờ làm việc T2–T6</Label>
                <Input
                  id="farm-hours-weekdays"
                  value={formValues.weekdaysHours}
                  onChange={(e) => updateField("weekdaysHours", e.target.value)}
                  aria-invalid={Boolean(fieldErrors.weekdaysHours)}
                />
                {fieldErrors.weekdaysHours && (
                  <p className="text-xs text-destructive">
                    {fieldErrors.weekdaysHours}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="farm-hours-weekend">Giờ làm việc T7–CN</Label>
                <Input
                  id="farm-hours-weekend"
                  value={formValues.weekendHours}
                  onChange={(e) => updateField("weekendHours", e.target.value)}
                  aria-invalid={Boolean(fieldErrors.weekendHours)}
                />
                {fieldErrors.weekendHours && (
                  <p className="text-xs text-destructive">
                    {fieldErrors.weekendHours}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card className="border-border-subtle bg-surface-card">
            <CardHeader className="border-b border-border-subtle pb-4">
              <CardTitle className="text-lg font-bold text-gray-900">
                Giao hàng &amp; Flash Sale
              </CardTitle>
              <CardDescription className="text-sm text-gray-600">
                Áp dụng quy tắc bán kính ADR-0034: ngưỡng miễn phí và gói định
                kỳ không vượt quá bán kính tối đa.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 pt-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ship-max-radius">Bán kính tối đa (km)</Label>
                  <Input
                    id="ship-max-radius"
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={formValues.maxRadiusKm}
                    onChange={(e) =>
                      updateField("maxRadiusKm", Number(e.target.value))
                    }
                    className="tabular-nums"
                    aria-invalid={Boolean(fieldErrors.maxRadiusKm)}
                  />
                  {fieldErrors.maxRadiusKm && (
                    <p className="text-xs text-destructive">
                      {fieldErrors.maxRadiusKm}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ship-sub-free-radius">
                    Miễn phí gói định kỳ (km)
                  </Label>
                  <Input
                    id="ship-sub-free-radius"
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={formValues.subscriptionFreeRadiusKm}
                    onChange={(e) =>
                      updateField(
                        "subscriptionFreeRadiusKm",
                        Number(e.target.value),
                      )
                    }
                    className="tabular-nums"
                    aria-invalid={Boolean(fieldErrors.subscriptionFreeRadiusKm)}
                  />
                  {fieldErrors.subscriptionFreeRadiusKm && (
                    <p className="text-xs text-destructive">
                      {fieldErrors.subscriptionFreeRadiusKm}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ship-free-threshold">
                    Ngưỡng miễn phí (km)
                  </Label>
                  <Input
                    id="ship-free-threshold"
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={formValues.freeKmThreshold}
                    onChange={(e) =>
                      updateField("freeKmThreshold", Number(e.target.value))
                    }
                    className="tabular-nums"
                    aria-invalid={Boolean(fieldErrors.freeKmThreshold)}
                  />
                  {fieldErrors.freeKmThreshold && (
                    <p className="text-xs text-destructive">
                      {fieldErrors.freeKmThreshold}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ship-base-fee">Phí cơ bản (VND)</Label>
                  <Input
                    id="ship-base-fee"
                    type="number"
                    step="1000"
                    min="0"
                    value={formValues.baseFeeVnd}
                    onChange={(e) =>
                      updateField("baseFeeVnd", Number(e.target.value))
                    }
                    className="tabular-nums"
                    aria-invalid={Boolean(fieldErrors.baseFeeVnd)}
                  />
                  {fieldErrors.baseFeeVnd && (
                    <p className="text-xs text-destructive">
                      {fieldErrors.baseFeeVnd}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ship-per-km">Phụ phí / km (VND)</Label>
                  <Input
                    id="ship-per-km"
                    type="number"
                    step="1000"
                    min="0"
                    value={formValues.perKmRateVnd}
                    onChange={(e) =>
                      updateField("perKmRateVnd", Number(e.target.value))
                    }
                    className="tabular-nums"
                    aria-invalid={Boolean(fieldErrors.perKmRateVnd)}
                  />
                  {fieldErrors.perKmRateVnd && (
                    <p className="text-xs text-destructive">
                      {fieldErrors.perKmRateVnd}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ship-detour-factor">Hệ số đường vòng</Label>
                  <Input
                    id="ship-detour-factor"
                    type="number"
                    step="0.05"
                    min="1"
                    value={formValues.detourFactor}
                    onChange={(e) =>
                      updateField("detourFactor", Number(e.target.value))
                    }
                    className="tabular-nums"
                    aria-invalid={Boolean(fieldErrors.detourFactor)}
                  />
                  {fieldErrors.detourFactor && (
                    <p className="text-xs text-destructive">
                      {fieldErrors.detourFactor}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-border-subtle pt-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="flash-hours">
                    Ngưỡng HSD Flash Sale (giờ)
                  </Label>
                  <Input
                    id="flash-hours"
                    type="number"
                    min="1"
                    value={formValues.hoursThreshold}
                    onChange={(e) =>
                      updateField("hoursThreshold", Number(e.target.value))
                    }
                    className="tabular-nums"
                    aria-invalid={Boolean(fieldErrors.hoursThreshold)}
                  />
                  {fieldErrors.hoursThreshold && (
                    <p className="text-xs text-destructive">
                      {fieldErrors.hoursThreshold}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="flash-discount">
                    Giảm giá Flash Sale (%)
                  </Label>
                  <Input
                    id="flash-discount"
                    type="number"
                    min="1"
                    max="99"
                    value={formValues.discountPercent}
                    onChange={(e) =>
                      updateField("discountPercent", Number(e.target.value))
                    }
                    className="tabular-nums"
                    aria-invalid={Boolean(fieldErrors.discountPercent)}
                  />
                  {fieldErrors.discountPercent && (
                    <p className="text-xs text-destructive">
                      {fieldErrors.discountPercent}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border-subtle bg-surface-card">
            <CardHeader className="border-b border-border-subtle pb-4">
              <CardTitle className="text-lg font-bold text-gray-900">
                Thanh toán &amp; Chứng nhận VietGAP
              </CardTitle>
              <CardDescription className="text-sm text-gray-600">
                Cấu hình cổng thanh toán, tài khoản đối soát và ảnh chứng nhận
                VietGAP cấp nông trại.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 pt-4">
              <div className="flex flex-wrap gap-6">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-800">
                  <Checkbox
                    checked={formValues.isPayosEnabled}
                    onCheckedChange={(checked) => {
                      updateField("isPayosEnabled", Boolean(checked));
                      setFieldErrors((prev) => {
                        const next = { ...prev };
                        delete next.paymentMethods;
                        return next;
                      });
                    }}
                  />
                  <span>Bật thanh toán VietQR (PayOS)</span>
                </label>

                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-800">
                  <Checkbox
                    checked={formValues.isCodEnabled}
                    onCheckedChange={(checked) => {
                      updateField("isCodEnabled", Boolean(checked));
                      setFieldErrors((prev) => {
                        const next = { ...prev };
                        delete next.paymentMethods;
                        return next;
                      });
                    }}
                  />
                  <span>Bật thanh toán tiền mặt (COD)</span>
                </label>
              </div>
              {fieldErrors.paymentMethods && (
                <p className="text-xs text-destructive">
                  {fieldErrors.paymentMethods}
                </p>
              )}

              <div className="grid grid-cols-1 gap-4 border-t border-border-subtle pt-4 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="bank-name">Ngân hàng</Label>
                  <Input
                    id="bank-name"
                    value={formValues.bankName}
                    onChange={(e) => updateField("bankName", e.target.value)}
                    placeholder="Vietcombank"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="bank-account">Số tài khoản</Label>
                  <Input
                    id="bank-account"
                    value={formValues.accountNumber}
                    onChange={(e) =>
                      updateField("accountNumber", e.target.value)
                    }
                    className="tabular-nums"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="bank-holder">Chủ tài khoản</Label>
                  <Input
                    id="bank-holder"
                    value={formValues.accountHolder}
                    onChange={(e) =>
                      updateField("accountHolder", e.target.value)
                    }
                  />
                </div>
              </div>
              {fieldErrors.bankInfo && (
                <p className="text-xs text-destructive">
                  {fieldErrors.bankInfo}
                </p>
              )}

              <div className="flex flex-col gap-3 border-t border-border-subtle pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor="vietgap-upload">Ảnh chứng nhận VietGAP</Label>
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      id="vietgap-upload"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleCertificateUpload}
                      className="sr-only"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={uploadingCert}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="size-3.5" aria-hidden="true" />
                      <span>
                        {uploadingCert
                          ? "Đang tải lên..."
                          : "Tải ảnh chứng nhận"}
                      </span>
                    </Button>
                    {formValues.certificationUrl && (
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => updateField("certificationUrl", null)}
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                        <span>Gỡ ảnh</span>
                      </Button>
                    )}
                  </div>
                </div>

                {uploadError && (
                  <Alert variant="destructive">
                    <AlertCircle aria-hidden="true" />
                    <AlertTitle>Tải ảnh thất bại</AlertTitle>
                    <AlertDescription>{uploadError}</AlertDescription>
                  </Alert>
                )}

                {formValues.certificationUrl ? (
                  <div className="flex items-center gap-4">
                    <img
                      src={formValues.certificationUrl}
                      alt="Chứng nhận VietGAP của nông trại"
                      className="h-20 w-28 rounded-lg border border-border-subtle object-cover"
                    />
                    <a
                      href={formValues.certificationUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-forest hover:underline"
                    >
                      <span>Xem ảnh chứng nhận đầy đủ</span>
                      <ExternalLink className="size-3.5" aria-hidden="true" />
                    </a>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">
                    Chưa có ảnh chứng nhận VietGAP (JPEG, PNG hoặc WebP, tối đa
                    5MB).
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={updateMutation.isPending || uploadingCert}
          className="bg-brand-forest px-6 text-white hover:bg-brand-dark"
        >
          <Save className="size-4" aria-hidden="true" />
          <span>
            {updateMutation.isPending
              ? "Đang lưu cấu hình..."
              : "Lưu cấu hình nông trại"}
          </span>
        </Button>
      </div>
    </form>
  );
}
