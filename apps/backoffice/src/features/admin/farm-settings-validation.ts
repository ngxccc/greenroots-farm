import type { components } from "@/types/api-schema";

type FarmSettingsDto = components["schemas"]["FarmSettingsDto"];
type UpdateFarmSettingsDto = components["schemas"]["UpdateFarmSettingsDto"];

/**
 * Controlled form state for editing singleton `FarmSettings` in BO-10.
 * Excludes plot-level `soilTestResult` and `waterTestResult` (owned by BO-01).
 */
export interface FarmSettingsFormValues {
  name: string;
  legalName: string;
  tagline: string;
  taxId: string;
  address: string;
  latitude: number;
  longitude: number;
  certificationUrl: string | null;
  hotlinePrimary: string;
  hotlineSupport: string;
  emailPrimary: string;
  emailSupport: string;
  weekdaysHours: string;
  weekendHours: string;
  baseFeeVnd: number;
  freeKmThreshold: number;
  perKmRateVnd: number;
  detourFactor: number;
  maxRadiusKm: number;
  subscriptionFreeRadiusKm: number;
  hoursThreshold: number;
  discountPercent: number;
  isPayosEnabled: boolean;
  isCodEnabled: boolean;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
}

/**
 * Field-keyed Vietnamese validation errors for `FarmSettingsFormValues`.
 */
export type FarmSettingsValidationErrors = Partial<
  Record<keyof FarmSettingsFormValues | "paymentMethods" | "bankInfo", string>
>;

/**
 * Validates ADR-0034 shipping radius invariants (`subscriptionFreeRadiusKm <= maxRadiusKm`
 * and `freeKmThreshold <= maxRadiusKm`) and positive radius bounds.
 * Both cross-field checks run independently so simultaneous violations surface both errors.
 *
 * @param config Shipping radius values to validate.
 * @returns Field-keyed error messages (empty object when valid).
 */
export function validateShippingRadii(config: {
  readonly maxRadiusKm: number;
  readonly subscriptionFreeRadiusKm: number;
  readonly freeKmThreshold: number;
}): Pick<
  FarmSettingsValidationErrors,
  "maxRadiusKm" | "subscriptionFreeRadiusKm" | "freeKmThreshold"
> {
  const errors: Pick<
    FarmSettingsValidationErrors,
    "maxRadiusKm" | "subscriptionFreeRadiusKm" | "freeKmThreshold"
  > = {};

  if (!Number.isFinite(config.maxRadiusKm) || config.maxRadiusKm <= 0) {
    errors.maxRadiusKm = "Bán kính giao tối đa phải lớn hơn 0 km.";
  }

  if (
    !Number.isFinite(config.subscriptionFreeRadiusKm) ||
    config.subscriptionFreeRadiusKm <= 0
  ) {
    errors.subscriptionFreeRadiusKm =
      "Bán kính miễn phí gói định kỳ phải lớn hơn 0 km.";
  } else if (
    Number.isFinite(config.maxRadiusKm) &&
    config.maxRadiusKm > 0 &&
    config.subscriptionFreeRadiusKm > config.maxRadiusKm
  ) {
    errors.subscriptionFreeRadiusKm =
      "Bán kính miễn phí gói định kỳ không được vượt quá bán kính giao tối đa.";
  }

  if (!Number.isFinite(config.freeKmThreshold) || config.freeKmThreshold <= 0) {
    errors.freeKmThreshold = "Ngưỡng miễn phụ phí phải lớn hơn 0 km.";
  } else if (
    Number.isFinite(config.maxRadiusKm) &&
    config.maxRadiusKm > 0 &&
    config.freeKmThreshold > config.maxRadiusKm
  ) {
    errors.freeKmThreshold =
      "Ngưỡng miễn phụ phí không được vượt quá bán kính giao tối đa.";
  }

  return errors;
}

/**
 * Validates the complete BO-10 Farm Settings form before submitting `PATCH /api/v1/farms/settings`.
 *
 * @param values Current form state.
 * @returns Field-keyed error dictionary (empty when valid).
 */
export function validateFarmSettingsForm(
  values: FarmSettingsFormValues,
): FarmSettingsValidationErrors {
  const errors: FarmSettingsValidationErrors = {};

  if (!values.name.trim()) {
    errors.name = "Vui lòng nhập tên thương hiệu nông trại.";
  }
  if (!values.legalName.trim()) {
    errors.legalName = "Vui lòng nhập tên pháp lý đơn vị.";
  }
  if (!values.address.trim()) {
    errors.address = "Vui lòng nhập địa chỉ nông trại.";
  }
  if (
    !Number.isFinite(values.latitude) ||
    values.latitude < -90 ||
    values.latitude > 90
  ) {
    errors.latitude = "Vĩ độ phải nằm trong khoảng -90 đến 90.";
  }
  if (
    !Number.isFinite(values.longitude) ||
    values.longitude < -180 ||
    values.longitude > 180
  ) {
    errors.longitude = "Kinh độ phải nằm trong khoảng -180 đến 180.";
  }
  if (!values.hotlinePrimary.trim()) {
    errors.hotlinePrimary = "Vui lòng nhập số hotline chính.";
  }
  if (!values.emailPrimary.trim()) {
    errors.emailPrimary = "Vui lòng nhập email liên hệ chính.";
  }
  if (!values.weekdaysHours.trim()) {
    errors.weekdaysHours = "Vui lòng nhập giờ làm việc ngày thường.";
  }
  if (!values.weekendHours.trim()) {
    errors.weekendHours = "Vui lòng nhập giờ làm việc cuối tuần.";
  }

  if (!Number.isFinite(values.baseFeeVnd) || values.baseFeeVnd < 0) {
    errors.baseFeeVnd = "Phí giao hàng cơ bản không được âm.";
  }
  if (!Number.isFinite(values.perKmRateVnd) || values.perKmRateVnd < 0) {
    errors.perKmRateVnd = "Phụ phí mỗi km không được âm.";
  }
  if (!Number.isFinite(values.detourFactor) || values.detourFactor < 1) {
    errors.detourFactor = "Hệ số đường vòng phải từ 1.0 trở lên.";
  }

  Object.assign(
    errors,
    validateShippingRadii({
      maxRadiusKm: values.maxRadiusKm,
      subscriptionFreeRadiusKm: values.subscriptionFreeRadiusKm,
      freeKmThreshold: values.freeKmThreshold,
    }),
  );

  if (!Number.isFinite(values.hoursThreshold) || values.hoursThreshold <= 0) {
    errors.hoursThreshold = "Ngưỡng giờ Flash Sale phải lớn hơn 0.";
  }
  if (
    !Number.isFinite(values.discountPercent) ||
    values.discountPercent <= 0 ||
    values.discountPercent >= 100
  ) {
    errors.discountPercent =
      "Phần trăm giảm giá phải nằm trong khoảng 1% – 99%.";
  }

  if (!values.isPayosEnabled && !values.isCodEnabled) {
    errors.paymentMethods =
      "Phải bật ít nhất một phương thức thanh toán (PayOS hoặc COD).";
  }

  const hasAnyBankField =
    values.bankName.trim() !== "" ||
    values.accountNumber.trim() !== "" ||
    values.accountHolder.trim() !== "";
  const hasAllBankFields =
    values.bankName.trim() !== "" &&
    values.accountNumber.trim() !== "" &&
    values.accountHolder.trim() !== "";

  if (hasAnyBankField && !hasAllBankFields) {
    errors.bankInfo =
      "Vui lòng điền đủ Tên ngân hàng, Số tài khoản và Chủ tài khoản hoặc để trống cả 3 trường.";
  }

  return errors;
}

/**
 * Converts a `FarmSettingsDto` API response into controlled form values.
 *
 * @param dto Response payload from `GET /api/v1/farms/settings`.
 * @returns Initialized `FarmSettingsFormValues`.
 */
export function mapFarmSettingsDtoToFormValues(
  dto: FarmSettingsDto,
): FarmSettingsFormValues {
  return {
    name: dto.name,
    legalName: dto.legalName,
    tagline: dto.tagline ?? "",
    taxId: dto.taxId ?? "",
    address: dto.address,
    latitude: dto.latitude,
    longitude: dto.longitude,
    certificationUrl: dto.certificationUrl ?? null,
    hotlinePrimary: dto.hotlines.primary,
    hotlineSupport: dto.hotlines.support ?? "",
    emailPrimary: dto.emails.primary,
    emailSupport: dto.emails.support ?? "",
    weekdaysHours: dto.workingHours.weekdays,
    weekendHours: dto.workingHours.weekend,
    baseFeeVnd: dto.shippingConfig.baseFeeVnd,
    freeKmThreshold: dto.shippingConfig.freeKmThreshold,
    perKmRateVnd: dto.shippingConfig.perKmRateVnd,
    detourFactor: dto.shippingConfig.detourFactor,
    maxRadiusKm: dto.shippingConfig.maxRadiusKm,
    subscriptionFreeRadiusKm: dto.shippingConfig.subscriptionFreeRadiusKm,
    hoursThreshold: dto.flashSaleConfig.hoursThreshold,
    discountPercent: dto.flashSaleConfig.discountPercent,
    isPayosEnabled: dto.isPayosEnabled,
    isCodEnabled: dto.isCodEnabled,
    bankName: dto.bankInfo?.bankName ?? "",
    accountNumber: dto.bankInfo?.accountNumber ?? "",
    accountHolder: dto.bankInfo?.accountHolder ?? "",
  };
}

/**
 * Serializes validated `FarmSettingsFormValues` into `UpdateFarmSettingsDto`
 * for `PATCH /api/v1/farms/settings`.
 *
 * @param values Validated form state.
 * @returns Request payload conforming to `UpdateFarmSettingsDto`.
 */
export function mapFormValuesToUpdateFarmSettingsDto(
  values: FarmSettingsFormValues,
): UpdateFarmSettingsDto {
  const bankName = values.bankName.trim();
  const accountNumber = values.accountNumber.trim();
  const accountHolder = values.accountHolder.trim();
  const hotlineSupport = values.hotlineSupport.trim();
  const emailSupport = values.emailSupport.trim();

  return {
    name: values.name.trim(),
    legalName: values.legalName.trim(),
    tagline: values.tagline.trim() || null,
    taxId: values.taxId.trim() || null,
    address: values.address.trim(),
    latitude: Number(values.latitude),
    longitude: Number(values.longitude),
    certificationUrl: values.certificationUrl,
    hotlines: {
      primary: values.hotlinePrimary.trim(),
      ...(hotlineSupport ? { support: hotlineSupport } : {}),
    },
    emails: {
      primary: values.emailPrimary.trim(),
      ...(emailSupport ? { support: emailSupport } : {}),
    },
    workingHours: {
      weekdays: values.weekdaysHours.trim(),
      weekend: values.weekendHours.trim(),
    },
    bankInfo:
      bankName && accountNumber && accountHolder
        ? { bankName, accountNumber, accountHolder }
        : null,
    shippingConfig: {
      baseFeeVnd: Math.round(Number(values.baseFeeVnd)),
      freeKmThreshold: Number(values.freeKmThreshold),
      perKmRateVnd: Math.round(Number(values.perKmRateVnd)),
      detourFactor: Number(values.detourFactor),
      maxRadiusKm: Number(values.maxRadiusKm),
      subscriptionFreeRadiusKm: Number(values.subscriptionFreeRadiusKm),
    },
    flashSaleConfig: {
      hoursThreshold: Math.round(Number(values.hoursThreshold)),
      discountPercent: Math.round(Number(values.discountPercent)),
    },
    isPayosEnabled: values.isPayosEnabled,
    isCodEnabled: values.isCodEnabled,
  };
}
