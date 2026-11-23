"use client";

import { HCMC_DISTRICTS, findHcmcDistrictByCode } from "@greenroots/shared";
import {
  Alert,
  AlertDescription,
  Badge,
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@greenroots/ui";
import { AlertCircle, Truck } from "lucide-react";
import { FARM_METADATA } from "@/constants/farm-metadata.constant";
import {
  ADDRESS_RECEIVER_NAME_MAX_LENGTH,
  ADDRESS_STREET_MAX_LENGTH,
} from "@/lib/address/address-validation";
import { formatVnd } from "@/lib/format";
import { estimateDistrictPreviewQuote } from "@/lib/shipping";

interface DeliveryQuotePreviewProps {
  readonly districtCode: string;
}

/**
 * Canonical 24-district Ho Chi Minh City selector using human-readable Vietnamese district labels.
 */
export function HcmcDistrictSelect({
  id,
  value,
  disabled = false,
  onValueChange,
}: {
  readonly id: string;
  readonly value: string;
  readonly disabled?: boolean;
  readonly onValueChange: (code: string) => void;
}) {
  const selectedDistrict = findHcmcDistrictByCode(value);

  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(nextValue) => {
        if (nextValue) {
          onValueChange(nextValue);
        }
      }}
    >
      <SelectTrigger id={id} className="h-10 w-full bg-white text-sm">
        <SelectValue placeholder="Chọn quận / huyện">
          {selectedDistrict?.name ?? value}
        </SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {HCMC_DISTRICTS.map((item) => (
          <SelectItem key={item.code} value={item.code} className="text-sm">
            {item.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Displays deterministic Haversine road-distance and estimated express fee preview
 * from GreenRoots Farm using `HCMC_DISTRICTS` and `estimateDistrictPreviewQuote()`.
 *
 * @param props Selected canonical HCMC `districtCode`.
 * @returns Styled summary card showing distance and VND fee or out-of-radius badge.
 */
export function DeliveryQuotePreview({
  districtCode,
}: DeliveryQuotePreviewProps) {
  const district = findHcmcDistrictByCode(districtCode) ?? HCMC_DISTRICTS[0];
  const quote = estimateDistrictPreviewQuote(district);

  return (
    <div className="space-y-1.5 rounded-xl border border-border-subtle bg-surface-warm p-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-gray-600">
          <Truck
            className="size-4 shrink-0 text-brand-forest"
            aria-hidden="true"
          />
          <span>Khoảng cách ước tính ({district.name})</span>
        </span>
        <span className="font-bold text-gray-900 tabular-nums">
          ~{quote.roadDistanceKm} km
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-gray-600">Phí giao hỏa tốc dự kiến</span>
        {quote.isDeliverable ? (
          <Badge className="border-0 bg-green-100 text-brand-dark tabular-nums">
            {formatVnd(quote.feeVnd)}
          </Badge>
        ) : (
          <Badge variant="destructive">
            Ngoài phạm vi giao tươi {FARM_METADATA.maxDeliveryRadiusKm} km
          </Badge>
        )}
      </div>
    </div>
  );
}

interface AddressFormFieldsProps {
  readonly idPrefix: string;
  readonly receiverName: string;
  readonly phoneNumber: string;
  readonly districtCode: string;
  readonly streetAddress: string;
  readonly showDefaultCheckbox: boolean;
  readonly isDefault: boolean;
  readonly lockDefaultChecked?: boolean;
  readonly isAlreadyDefaultBadge?: boolean;
  readonly disabled?: boolean;
  readonly errorMessage?: string | null;
  readonly onReceiverNameChange: (value: string) => void;
  readonly onPhoneNumberChange: (value: string) => void;
  readonly onDistrictCodeChange: (value: string) => void;
  readonly onStreetAddressChange: (value: string) => void;
  readonly onIsDefaultChange?: (checked: boolean) => void;
}

/**
 * Shared validated HCMC address input fields and live distance preview reused across
 * `/account/addresses` modal CRUD and `AddressDialog` quick-create flows.
 */
export function AddressFormFields({
  idPrefix,
  receiverName,
  phoneNumber,
  districtCode,
  streetAddress,
  showDefaultCheckbox,
  isDefault,
  lockDefaultChecked = false,
  isAlreadyDefaultBadge = false,
  disabled = false,
  errorMessage = null,
  onReceiverNameChange,
  onPhoneNumberChange,
  onDistrictCodeChange,
  onStreetAddressChange,
  onIsDefaultChange,
}: AddressFormFieldsProps) {
  const receiverInputId = `${idPrefix}-receiver-name`;
  const phoneInputId = `${idPrefix}-phone-number`;
  const districtSelectId = `${idPrefix}-district`;
  const streetInputId = `${idPrefix}-street-address`;
  const defaultCheckboxId = `${idPrefix}-default`;

  return (
    <div className="space-y-4">
      {errorMessage ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden="true" />
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label
            htmlFor={receiverInputId}
            className="text-xs font-semibold text-gray-800"
          >
            Tên người nhận
          </Label>
          <Input
            id={receiverInputId}
            type="text"
            value={receiverName}
            maxLength={ADDRESS_RECEIVER_NAME_MAX_LENGTH}
            disabled={disabled}
            required
            placeholder="Ví dụ: Nguyễn Minh Anh"
            onChange={(event) => onReceiverNameChange(event.target.value)}
            className="h-10 bg-white text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor={phoneInputId}
            className="text-xs font-semibold text-gray-800"
          >
            Số điện thoại người nhận
          </Label>
          <Input
            id={phoneInputId}
            type="tel"
            inputMode="numeric"
            value={phoneNumber}
            disabled={disabled}
            required
            placeholder="Ví dụ: 0908412679"
            onChange={(event) => onPhoneNumberChange(event.target.value)}
            className="h-10 bg-white text-sm tabular-nums"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label
          htmlFor={districtSelectId}
          className="text-xs font-semibold text-gray-800"
        >
          Quận / Huyện / TP. Thủ Đức (TP.HCM)
        </Label>
        <HcmcDistrictSelect
          id={districtSelectId}
          value={districtCode}
          disabled={disabled}
          onValueChange={onDistrictCodeChange}
        />
      </div>

      <div className="space-y-1.5">
        <Label
          htmlFor={streetInputId}
          className="text-xs font-semibold text-gray-800"
        >
          Địa chỉ chi tiết (Số nhà, tên đường, phường)
        </Label>
        <Input
          id={streetInputId}
          type="text"
          value={streetAddress}
          maxLength={ADDRESS_STREET_MAX_LENGTH}
          disabled={disabled}
          required
          placeholder="Ví dụ: 142 Lê Đức Thọ, Phường 15"
          onChange={(event) => onStreetAddressChange(event.target.value)}
          className="h-10 bg-white text-sm"
        />
      </div>

      <DeliveryQuotePreview districtCode={districtCode} />

      {showDefaultCheckbox ? (
        <div className="space-y-1 pt-0.5">
          <div className="flex items-center gap-2">
            <Checkbox
              id={defaultCheckboxId}
              checked={lockDefaultChecked ? true : isDefault}
              disabled={disabled || lockDefaultChecked}
              onCheckedChange={(checked) => onIsDefaultChange?.(checked)}
            />
            <Label
              htmlFor={defaultCheckboxId}
              className="cursor-pointer text-xs font-medium text-gray-700"
            >
              Đặt làm địa chỉ giao hàng mặc định
            </Label>
          </div>
          {lockDefaultChecked ? (
            <p className="text-[11px] text-gray-500">
              Địa chỉ đầu tiên tự động được đặt làm mặc định.
            </p>
          ) : null}
        </div>
      ) : isAlreadyDefaultBadge ? (
        <p className="text-xs font-medium text-brand-dark">
          Đang là địa chỉ giao hàng mặc định. Để đổi mặc định sang địa chỉ khác,
          dùng menu tùy chọn trên thẻ địa chỉ.
        </p>
      ) : null}
    </div>
  );
}
