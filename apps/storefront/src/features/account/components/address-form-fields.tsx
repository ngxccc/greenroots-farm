"use client";

import { BUSINESS_RULES } from "@greenroots/shared";
import {
  Alert,
  AlertDescription,
  Checkbox,
  Input,
  Label,
} from "@greenroots/ui";
import { AlertCircle, Truck } from "lucide-react";
import { DeliveryQuoteSummary } from "@/components/common/delivery-quote-summary";
import {
  ADDRESS_RECEIVER_NAME_MAX_LENGTH,
  ADDRESS_STREET_MAX_LENGTH,
} from "@/features/account/schemas/address-validation";
import { invalidateStorefrontClientSession } from "@/features/auth/utils/client-logout";
import { PlaceAutocompleteInput } from "@/features/geocoding/components/place-autocomplete-input";
import type { PlaceSuggestion } from "@/features/geocoding/types/geocoding.types";
import { useShippingQuote } from "@/features/shipping/hooks/use-shipping-quote";
import { formatVnd } from "@/lib/format";
import { useAuthStore } from "@/stores/auth.store";

interface DeliveryQuotePreviewProps {
  readonly placeId?: string | null;
  readonly addressId?: string | null;
  readonly districtName?: string;
  readonly isSubscription?: boolean;
}

/**
 * Displays dynamic server-computed delivery quote via `POST /api/shipping/quote` for
 * authenticated customers, or static delivery coverage policy for unauthenticated guests.
 */
export function DeliveryQuotePreview({
  placeId = null,
  addressId = null,
  districtName,
  isSubscription = false,
}: DeliveryQuotePreviewProps) {
  const activeUser = useAuthStore((state) => state.user);
  const isAuthenticated = Boolean(activeUser);
  const hasTarget = Boolean(addressId) || Boolean(placeId);

  const serverQuote = useShippingQuote({
    enabled: isAuthenticated && hasTarget,
    addressId,
    placeId: addressId ? null : placeId,
    isSubscription,
    onSessionInvalidated: invalidateStorefrontClientSession,
  });

  if (isAuthenticated) {
    if (!hasTarget) {
      return (
        <div className="flex items-center gap-2 rounded-xl border border-border-subtle bg-surface-warm p-3 text-xs text-gray-600">
          <Truck
            className="size-4 shrink-0 text-brand-forest"
            aria-hidden="true"
          />
          <span>
            Chọn địa chỉ từ danh sách gợi ý để xem khoảng cách và phí giao hàng
            chính xác.
          </span>
        </div>
      );
    }

    return (
      <DeliveryQuoteSummary
        districtName={addressId ? undefined : districtName}
        quote={serverQuote.quote}
        isLoading={serverQuote.status === "loading"}
        errorMessage={serverQuote.errorMessage}
        onRetry={serverQuote.retry}
      />
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border-subtle bg-surface-warm p-3 text-xs text-gray-600">
      <Truck className="size-4 shrink-0 text-brand-forest" aria-hidden="true" />
      <span>
        Giao hỏa tốc TP.HCM trong bán kính{" "}
        <strong className="font-semibold text-gray-900 tabular-nums">
          {BUSINESS_RULES.SHIPPING.MAX_RADIUS_KM} km
        </strong>
        , phí cơ bản từ{" "}
        <strong className="font-semibold text-gray-900 tabular-nums">
          {formatVnd(BUSINESS_RULES.SHIPPING.BASE_FEE_VND)}
        </strong>
        . Đăng nhập để tính phí chính xác.
      </span>
    </div>
  );
}

interface AddressFormFieldsProps {
  readonly idPrefix: string;
  readonly receiverName: string;
  readonly phoneNumber: string;
  readonly placeId: string;
  readonly selectedPlaceLabel?: string;
  readonly selectedDistrictName?: string;
  readonly streetAddress: string;
  readonly showDefaultCheckbox: boolean;
  readonly isDefault: boolean;
  readonly lockDefaultChecked?: boolean;
  readonly isAlreadyDefaultBadge?: boolean;
  readonly disabled?: boolean;
  readonly errorMessage?: string | null;
  readonly onReceiverNameChange: (value: string) => void;
  readonly onPhoneNumberChange: (value: string) => void;
  readonly onPlaceSelect: (suggestion: PlaceSuggestion) => void;
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
  placeId,
  selectedPlaceLabel = "",
  selectedDistrictName,
  streetAddress,
  showDefaultCheckbox,
  isDefault,
  lockDefaultChecked = false,
  isAlreadyDefaultBadge = false,
  disabled = false,
  errorMessage = null,
  onReceiverNameChange,
  onPhoneNumberChange,
  onPlaceSelect,
  onStreetAddressChange,
  onIsDefaultChange,
}: AddressFormFieldsProps) {
  const receiverInputId = `${idPrefix}-receiver-name`;
  const phoneInputId = `${idPrefix}-phone-number`;
  const placeInputId = `${idPrefix}-place-search`;
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
          htmlFor={placeInputId}
          className="text-xs font-semibold text-gray-800"
        >
          Tìm địa chỉ tại TP.HCM
        </Label>
        <PlaceAutocompleteInput
          id={placeInputId}
          selectedPlaceId={placeId}
          selectedLabel={selectedPlaceLabel}
          disabled={disabled}
          onSelectPlace={onPlaceSelect}
        />
      </div>

      <div className="space-y-1.5">
        <Label
          htmlFor={streetInputId}
          className="text-xs font-semibold text-gray-800"
        >
          Địa chỉ chi tiết (Số nhà, hẻm, ghi chú giao hàng)
        </Label>
        <Input
          id={streetInputId}
          type="text"
          value={streetAddress}
          maxLength={ADDRESS_STREET_MAX_LENGTH}
          disabled={disabled}
          required
          placeholder="Ví dụ: 142/5 Lê Đức Thọ, Phường 15"
          onChange={(event) => onStreetAddressChange(event.target.value)}
          className="h-10 bg-white text-sm"
        />
      </div>

      <DeliveryQuotePreview
        placeId={placeId || null}
        districtName={selectedDistrictName}
      />

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
