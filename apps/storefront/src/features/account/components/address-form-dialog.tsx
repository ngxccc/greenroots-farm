"use client";

import { useRouter } from "next/navigation";
import { useState, type SubmitEvent } from "react";
import { HCMC_DISTRICTS } from "@greenroots/shared";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from "@greenroots/ui";
import { Loader2 } from "lucide-react";
import {
  createAddressAction,
  updateAddressAction,
} from "@/lib/address/address-actions";
import {
  buildUpdateAddressDiff,
  createAddressFormSchema,
} from "@/lib/address/address-validation";
import { invalidateStorefrontClientSession } from "@/lib/auth/client-logout";
import type { CustomerAddress } from "@/types/address.types";
import { AddressFormFields } from "./address-form-fields";

interface AddressFormDialogViewProps {
  readonly open: boolean;
  readonly mode: "create" | "edit";
  readonly receiverName: string;
  readonly phoneNumber: string;
  readonly districtCode: string;
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
  readonly onDistrictCodeChange: (value: string) => void;
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
  districtCode,
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
  onDistrictCodeChange,
  onStreetAddressChange,
  onIsDefaultChange,
  onSubmit,
}: AddressFormDialogViewProps) {
  const isCreate = mode === "create";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={!isPending}
        className="max-h-[90vh] overflow-y-auto bg-white sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle className="font-bold text-gray-900">
            {isCreate
              ? "Thêm địa chỉ giao hàng mới"
              : "Cập nhật địa chỉ giao hàng"}
          </DialogTitle>
          <DialogDescription>
            {isCreate
              ? "Chọn quận/huyện TP.HCM để hệ thống ước lượng lộ trình giao lạnh từ nông trại Củ Chi."
              : "Chỉnh sửa thông tin người nhận hoặc địa chỉ chi tiết tại TP.HCM."}
          </DialogDescription>
        </DialogHeader>

        <form noValidate onSubmit={onSubmit} className="space-y-4">
          <AddressFormFields
            idPrefix="account-address-form"
            receiverName={receiverName}
            phoneNumber={phoneNumber}
            districtCode={districtCode}
            streetAddress={streetAddress}
            showDefaultCheckbox={isCreate}
            isDefault={isDefault}
            lockDefaultChecked={lockDefaultChecked}
            isAlreadyDefaultBadge={!isCreate && isEditingDefault}
            disabled={isPending}
            errorMessage={errorMessage}
            onReceiverNameChange={onReceiverNameChange}
            onPhoneNumberChange={onPhoneNumberChange}
            onDistrictCodeChange={onDistrictCodeChange}
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

const DEFAULT_DISTRICT_CODE = HCMC_DISTRICTS[0].code;

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
  const [districtCode, setDistrictCode] = useState(() =>
    editingAddress ? editingAddress.districtCode : DEFAULT_DISTRICT_CODE,
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
        districtCode,
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
        districtCode,
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
        toast.success("Đã cập nhật địa chỉ giao hàng");
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
      districtCode,
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
      toast.success("Đã thêm địa chỉ giao hàng mới");
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
      districtCode={districtCode}
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
      onDistrictCodeChange={setDistrictCode}
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
