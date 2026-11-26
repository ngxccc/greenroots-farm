"use client";

import { useRouter } from "next/navigation";
import { useState, type SubmitEvent } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@greenroots/ui";
import { Loader2 } from "lucide-react";
import {
  createAddressAction,
  updateAddressAction,
} from "@/features/account/actions/address-actions";
import {
  buildUpdateAddressDiff,
  createAddressFormSchema,
} from "@/features/account/schemas/address-validation";
import { invalidateStorefrontClientSession } from "@/features/auth/utils/client-logout";
import type { PlaceSuggestion } from "@/features/geocoding/types/geocoding.types";
import type { CustomerAddress } from "@/features/account/types/address.types";
import { AddressFormFields } from "./address-form-fields";

interface AddressFormDialogViewProps {
  readonly open: boolean;
  readonly mode: "create" | "edit";
  readonly receiverName: string;
  readonly phoneNumber: string;
  readonly placeId: string;
  readonly selectedPlaceLabel: string;
  readonly selectedWardName?: string;
  readonly streetAddress: string;
  readonly isDefault: boolean;
  readonly lockDefaultChecked?: boolean;
  readonly isEditingDefault?: boolean;
  readonly canSubmit: boolean;
  readonly isPending: boolean;
  readonly errorMessage: string | null;
  readonly onOpenChange?: (open: boolean) => void;
  readonly onReceiverNameChange: (value: string) => void;
  readonly onPhoneNumberChange: (value: string) => void;
  readonly onPlaceSelect: (suggestion: PlaceSuggestion) => void;
  readonly onStreetAddressChange: (value: string) => void;
  readonly onIsDefaultChange: (checked: boolean) => void;
  readonly onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
}

/**
 * Pure presentational modal dialog for creating or editing a customer delivery address.
 * Separates Create (`isDefault` checkbox allowed) from Edit (`isDefault` omitted per `EDGE-5`).
 */
export function AddressFormDialogView({
  open,
  mode,
  receiverName,
  phoneNumber,
  placeId,
  selectedPlaceLabel,
  selectedWardName,
  streetAddress,
  isDefault,
  lockDefaultChecked = false,
  isEditingDefault = false,
  canSubmit,
  isPending,
  errorMessage,
  onOpenChange,
  onReceiverNameChange,
  onPhoneNumberChange,
  onPlaceSelect,
  onStreetAddressChange,
  onIsDefaultChange,
  onSubmit,
}: AddressFormDialogViewProps) {
  const isCreate = mode === "create";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={!isPending}
        className="max-h-[90vh] overflow-x-hidden overflow-y-auto bg-white sm:max-w-xl"
      >
        <DialogHeader className="min-w-0">
          <DialogTitle className="font-bold text-gray-900">
            {isCreate
              ? "Thêm địa chỉ giao hàng mới"
              : "Cập nhật địa chỉ giao hàng"}
          </DialogTitle>
          <DialogDescription>
            {isCreate
              ? "Tìm và chọn địa chỉ TP.HCM để hệ thống ước lượng lộ trình giao hỏa tốc từ Urban Hub Bình Thạnh."
              : "Chỉnh sửa thông tin người nhận hoặc địa chỉ chi tiết tại TP.HCM."}
          </DialogDescription>
        </DialogHeader>

        <form noValidate onSubmit={onSubmit} className="min-w-0 space-y-4">
          <AddressFormFields
            idPrefix="account-address-form"
            receiverName={receiverName}
            phoneNumber={phoneNumber}
            placeId={placeId}
            selectedPlaceLabel={selectedPlaceLabel}
            selectedWardName={selectedWardName}
            streetAddress={streetAddress}
            showDefaultCheckbox={isCreate}
            isDefault={isDefault}
            lockDefaultChecked={lockDefaultChecked}
            isAlreadyDefaultBadge={!isCreate && isEditingDefault}
            disabled={isPending}
            errorMessage={errorMessage}
            onReceiverNameChange={onReceiverNameChange}
            onPhoneNumberChange={onPhoneNumberChange}
            onPlaceSelect={onPlaceSelect}
            onStreetAddressChange={onStreetAddressChange}
            onIsDefaultChange={onIsDefaultChange}
          />

          <DialogFooter className="pt-1">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => onOpenChange?.(false)}
              className="cursor-pointer"
            >
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit || isPending}
              className="cursor-pointer gap-2 bg-brand-forest font-semibold text-white hover:bg-brand-dark"
            >
              {isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  <span>Đang lưu...</span>
                </>
              ) : (
                <span>{isCreate ? "Lưu địa chỉ" : "Lưu thay đổi"}</span>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface AddressFormDialogProps {
  readonly open: boolean;
  readonly editingAddress: CustomerAddress | null;
  readonly existingCount: number;
  readonly defaultReceiverName: string;
  readonly defaultPhoneNumber: string | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreated: (address: CustomerAddress) => void;
  readonly onUpdated: (address: CustomerAddress) => void;
}

function AddressFormDialogBody({
  editingAddress,
  existingCount,
  defaultReceiverName,
  defaultPhoneNumber,
  onOpenChange,
  onCreated,
  onUpdated,
}: Omit<AddressFormDialogProps, "open">) {
  const router = useRouter();

  const [receiverName, setReceiverName] = useState(() =>
    editingAddress ? editingAddress.receiverName : defaultReceiverName,
  );
  const [phoneNumber, setPhoneNumber] = useState(() =>
    editingAddress ? editingAddress.phoneNumber : (defaultPhoneNumber ?? ""),
  );
  const [placeId, setPlaceId] = useState(() =>
    editingAddress ? editingAddress.placeId : "",
  );
  const [selectedPlaceLabel, setSelectedPlaceLabel] = useState(() =>
    editingAddress
      ? `${editingAddress.streetAddress}, ${editingAddress.ward}, ${editingAddress.city}`
      : "",
  );
  const [selectedWardName, setSelectedWardName] = useState(() =>
    editingAddress ? editingAddress.ward : undefined,
  );
  const [streetAddress, setStreetAddress] = useState(() =>
    editingAddress ? editingAddress.streetAddress : "",
  );
  const [isDefault, setIsDefault] = useState(() =>
    editingAddress ? editingAddress.isDefault : existingCount === 0,
  );
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mode = editingAddress ? "edit" : "create";
  const lockDefaultChecked = mode === "create" && existingCount === 0;

  const editDiff = editingAddress
    ? buildUpdateAddressDiff(editingAddress, {
        receiverName,
        phoneNumber,
        placeId,
        streetAddress,
      })
    : null;
  const canSubmit =
    mode === "create" ||
    (editDiff !== null && (!editDiff.ok || editDiff.patch !== null));

  function handleOpenChange(nextOpen: boolean) {
    if (isPending) {
      return;
    }
    onOpenChange(nextOpen);
  }

  function handlePlaceSelect(suggestion: PlaceSuggestion) {
    setPlaceId(suggestion.placeId);
    setSelectedPlaceLabel(suggestion.description);
    setSelectedWardName(suggestion.ward);
    if (suggestion.streetName) {
      setStreetAddress(suggestion.streetName);
    }
  }

  function handleSessionInvalidated() {
    invalidateStorefrontClientSession();
    onOpenChange(false);
    router.replace("/login?redirect=%2Faccount%2Faddresses");
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) {
      return;
    }

    setErrorMessage(null);

    if (editingAddress) {
      const diff = buildUpdateAddressDiff(editingAddress, {
        receiverName,
        phoneNumber,
        placeId,
        streetAddress,
      });
      if (!diff.ok) {
        setErrorMessage(diff.message);
        return;
      }
      if (diff.patch === null) {
        return;
      }

      setIsPending(true);
      try {
        const result = await updateAddressAction(editingAddress.id, diff.patch);
        if (!result.ok) {
          if (result.sessionInvalidated) {
            handleSessionInvalidated();
            return;
          }
          setErrorMessage(result.message);
          return;
        }

        onUpdated(result.address);
        onOpenChange(false);
        router.refresh();
      } catch {
        setErrorMessage("Không thể kết nối tới máy chủ GreenRoots Farm.");
      } finally {
        setIsPending(false);
      }
      return;
    }

    const parsed = createAddressFormSchema.safeParse({
      receiverName,
      phoneNumber,
      placeId,
      streetAddress,
      isDefault: lockDefaultChecked ? true : isDefault,
    });
    if (!parsed.success) {
      setErrorMessage(
        parsed.error.issues.at(0)?.message ??
          "Vui lòng kiểm tra lại thông tin địa chỉ.",
      );
      return;
    }

    setIsPending(true);
    try {
      const result = await createAddressAction(parsed.data);
      if (!result.ok) {
        if (result.sessionInvalidated) {
          handleSessionInvalidated();
          return;
        }
        setErrorMessage(result.message);
        return;
      }

      onCreated(result.address);
      onOpenChange(false);
      router.refresh();
    } catch {
      setErrorMessage("Không thể kết nối tới máy chủ GreenRoots Farm.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <AddressFormDialogView
      open={true}
      mode={mode}
      receiverName={receiverName}
      phoneNumber={phoneNumber}
      placeId={placeId}
      selectedPlaceLabel={selectedPlaceLabel}
      selectedWardName={selectedWardName}
      streetAddress={streetAddress}
      isDefault={isDefault}
      lockDefaultChecked={lockDefaultChecked}
      isEditingDefault={editingAddress?.isDefault ?? false}
      canSubmit={canSubmit}
      isPending={isPending}
      errorMessage={errorMessage}
      onOpenChange={handleOpenChange}
      onReceiverNameChange={setReceiverName}
      onPhoneNumberChange={setPhoneNumber}
      onPlaceSelect={handlePlaceSelect}
      onStreetAddressChange={setStreetAddress}
      onIsDefaultChange={setIsDefault}
      onSubmit={(event) => void handleSubmit(event)}
    />
  );
}

/**
 * Stateful modal dialog coordinating validated Create/Edit delivery address submissions
 * against BFF Server Actions with terminal `401` session cleanup.
 */
export function AddressFormDialog(props: AddressFormDialogProps) {
  if (!props.open) {
    return null;
  }

  return (
    <AddressFormDialogBody
      key={props.editingAddress?.id ?? "create"}
      editingAddress={props.editingAddress}
      existingCount={props.existingCount}
      defaultReceiverName={props.defaultReceiverName}
      defaultPhoneNumber={props.defaultPhoneNumber}
      onOpenChange={props.onOpenChange}
      onCreated={props.onCreated}
      onUpdated={props.onUpdated}
    />
  );
}
