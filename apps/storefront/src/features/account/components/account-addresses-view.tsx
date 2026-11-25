"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, AlertDescription, Button, Skeleton } from "@greenroots/ui";
import { AlertCircle, MapPin, Plus } from "lucide-react";
import { ConfirmActionDialog } from "@/components/common/confirm-action-dialog";
import {
  deleteAddressAction,
  setDefaultAddressAction,
} from "@/features/account/actions/address-actions";
import { MAX_USER_ADDRESSES } from "@/features/account/schemas/address-validation";
import { invalidateStorefrontClientSession } from "@/features/auth/utils/client-logout";
import { useAuthStore } from "@/stores/auth.store";
import { useDeliveryAddressStore } from "@/stores/delivery-address.store";
import type { CustomerAddress } from "@/features/account/types/address.types";
import type { StorefrontSessionUser } from "@/features/auth/types/auth.types";
import { AccountProfileDegradedCard } from "./account-profile-view";
import { AddressCard } from "./address-card";
import { AddressFormDialog } from "./address-form-dialog";

interface AccountAddressesViewProps {
  readonly initialUser: StorefrontSessionUser;
  readonly initialAddresses: readonly CustomerAddress[];
}

/**
 * Formats a context-aware delete confirmation prompt warning when deleting an active default address
 * while another saved address remains (`INV-ADDR-5`, `EDGE-4`).
 *
 * @param address Target address selected for deletion.
 * @param totalAddresses Current count of saved addresses before deletion.
 * @returns Localized Vietnamese confirmation description.
 */
export function buildDeleteAddressConfirmDescription(
  address: CustomerAddress,
  totalAddresses: number,
): string {
  if (address.isDefault && totalAddresses > 1) {
    return `Bạn có chắc muốn xóa địa chỉ mặc định "${address.streetAddress}, ${address.district}"? Hệ thống sẽ tự động đặt địa chỉ mới nhất còn lại làm mặc định.`;
  }
  return `Bạn có chắc muốn xóa địa chỉ "${address.streetAddress}, ${address.district}"? Các đơn hàng đã đặt trước đó vẫn giữ nguyên địa chỉ giao hàng.`;
}

interface AccountAddressesListCardProps {
  readonly addresses: readonly CustomerAddress[];
  readonly pendingActionAddressId?: string | null;
  readonly listActionError?: string | null;
  readonly onOpenCreate: () => void;
  readonly onRequestSetDefault: (address: CustomerAddress) => void;
  readonly onRequestEdit: (address: CustomerAddress) => void;
  readonly onRequestDelete: (address: CustomerAddress) => void;
}

/**
 * Pure presentational saved-address book panel enforcing the 10-address cap badge/disabled state (`INV-SF-ADDR-7`, `EDGE-3`).
 */
export function AccountAddressesListCard({
  addresses,
  pendingActionAddressId = null,
  listActionError = null,
  onOpenCreate,
  onRequestSetDefault,
  onRequestEdit,
  onRequestDelete,
}: AccountAddressesListCardProps) {
  const reachedCap = addresses.length >= MAX_USER_ADDRESSES;

  return (
    <section
      aria-label="Danh sách địa chỉ giao hàng"
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col justify-between gap-3 border-b border-border-subtle pb-4 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
            Sổ địa chỉ giao hàng
          </h1>
          <span className="text-xs font-semibold text-brand-dark tabular-nums sm:text-sm">
            {addresses.length} / {MAX_USER_ADDRESSES} địa chỉ
          </span>
        </div>

        <Button
          type="button"
          disabled={reachedCap}
          onClick={onOpenCreate}
          className="h-9 cursor-pointer gap-1.5 rounded-lg bg-brand-forest px-3.5 text-xs font-semibold text-white hover:bg-brand-dark"
        >
          <Plus className="size-4" aria-hidden="true" />
          <span>Thêm địa chỉ mới</span>
        </Button>
      </div>

      {reachedCap ? (
        <p className="text-xs text-gray-600">
          Bạn đã lưu tối đa {MAX_USER_ADDRESSES} địa chỉ. Vui lòng xóa bớt hoặc
          chỉnh sửa địa chỉ hiện có.
        </p>
      ) : null}

      {listActionError ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden="true" />
          <AlertDescription>{listActionError}</AlertDescription>
        </Alert>
      ) : null}

      {addresses.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg bg-surface-warm px-6 py-10 text-center">
          <span
            aria-hidden="true"
            className="flex size-12 items-center justify-center rounded-full bg-green-50 text-brand-dark"
          >
            <MapPin className="size-6" />
          </span>
          <div className="space-y-1">
            <p className="text-sm font-bold text-gray-900">
              Bạn chưa lưu địa chỉ giao hàng nào
            </p>
            <p className="text-xs text-gray-500">
              Thêm địa chỉ tại TP.HCM để chọn nhanh khi đặt rau củ và tính phí
              giao lạnh chính xác hơn.
            </p>
          </div>
          <Button
            type="button"
            onClick={onOpenCreate}
            className="mt-1 h-9 cursor-pointer gap-1.5 rounded-lg bg-brand-forest px-4 text-xs font-semibold text-white hover:bg-brand-dark"
          >
            <Plus className="size-4" aria-hidden="true" />
            <span>Thêm địa chỉ đầu tiên</span>
          </Button>
        </div>
      ) : (
        <div className="divide-y divide-border-subtle border-b border-border-subtle">
          {addresses.map((address) => (
            <AddressCard
              key={address.id}
              address={address}
              isPending={pendingActionAddressId === address.id}
              onRequestSetDefault={onRequestSetDefault}
              onRequestEdit={onRequestEdit}
              onRequestDelete={onRequestDelete}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Coordinates the 2-column customer address book dashboard inside `StorefrontShell`:
 * shared `AccountSidebar`, cap-aware `"Thêm địa chỉ mới"` button, modal `AddressFormDialog`,
 * per-card `DropdownMenu` actions, and server-synced `ConfirmActionDialog` delete flow.
 */
export function AccountAddressesView({
  initialUser,
  initialAddresses,
}: AccountAddressesViewProps) {
  const router = useRouter();
  const setUser = useAuthStore((state) => state.setUser);

  const addresses = useDeliveryAddressStore((state) => state.addresses);
  const isDeliveryHydrated = useDeliveryAddressStore(
    (state) => state.isHydrated,
  );
  const setAddresses = useDeliveryAddressStore((state) => state.setAddresses);
  const reconcileAfterCreate = useDeliveryAddressStore(
    (state) => state.reconcileAfterCreate,
  );
  const reconcileAfterUpdate = useDeliveryAddressStore(
    (state) => state.reconcileAfterUpdate,
  );
  const reconcileAfterSetDefault = useDeliveryAddressStore(
    (state) => state.reconcileAfterSetDefault,
  );
  const reconcileAfterDelete = useDeliveryAddressStore(
    (state) => state.reconcileAfterDelete,
  );

  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<CustomerAddress | null>(
    null,
  );
  const [deletingAddress, setDeletingAddress] =
    useState<CustomerAddress | null>(null);
  const [pendingActionAddressId, setPendingActionAddressId] = useState<
    string | null
  >(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [listActionError, setListActionError] = useState<string | null>(null);

  useEffect(() => {
    setUser(initialUser);
    setAddresses(initialAddresses);
  }, [initialAddresses, initialUser, setAddresses, setUser]);

  const activeAddresses = isDeliveryHydrated ? addresses : initialAddresses;
  const reachedCap = activeAddresses.length >= MAX_USER_ADDRESSES;

  function handleSessionInvalidated() {
    invalidateStorefrontClientSession();
    router.replace("/login?redirect=%2Faccount%2Faddresses");
  }

  function handleOpenCreate() {
    if (reachedCap) {
      return;
    }
    setListActionError(null);
    setEditingAddress(null);
    setFormDialogOpen(true);
  }

  function handleOpenEdit(address: CustomerAddress) {
    setListActionError(null);
    setEditingAddress(address);
    setFormDialogOpen(true);
  }

  function handleRequestDelete(address: CustomerAddress) {
    setListActionError(null);
    setDeleteError(null);
    setDeletingAddress(address);
  }

  async function handleSetDefault(address: CustomerAddress) {
    if (pendingActionAddressId || address.isDefault) {
      return;
    }

    setListActionError(null);
    setPendingActionAddressId(address.id);
    try {
      const result = await setDefaultAddressAction(address.id);
      if (!result.ok) {
        if (result.sessionInvalidated) {
          handleSessionInvalidated();
          return;
        }
        setListActionError(result.message);
        return;
      }

      reconcileAfterSetDefault(result.address);
      router.refresh();
    } catch {
      setListActionError("Không thể kết nối tới máy chủ GreenRoots Farm.");
    } finally {
      setPendingActionAddressId(null);
    }
  }

  async function handleConfirmDelete() {
    if (!deletingAddress || isDeleting) {
      return;
    }

    setDeleteError(null);
    setIsDeleting(true);
    try {
      const result = await deleteAddressAction(deletingAddress.id);
      if (!result.ok) {
        if (result.sessionInvalidated) {
          setDeletingAddress(null);
          handleSessionInvalidated();
          return;
        }
        setDeleteError(result.message);
        return;
      }

      reconcileAfterDelete(deletingAddress.id, result.addresses);
      setDeletingAddress(null);
      router.refresh();
    } catch {
      setDeleteError("Không thể kết nối tới máy chủ GreenRoots Farm.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <AccountAddressesListCard
        addresses={activeAddresses}
        pendingActionAddressId={pendingActionAddressId}
        listActionError={listActionError}
        onOpenCreate={handleOpenCreate}
        onRequestSetDefault={(target) => void handleSetDefault(target)}
        onRequestEdit={handleOpenEdit}
        onRequestDelete={handleRequestDelete}
      />

      <AddressFormDialog
        open={formDialogOpen}
        editingAddress={editingAddress}
        existingCount={activeAddresses.length}
        defaultReceiverName={initialUser.fullName}
        defaultPhoneNumber={initialUser.phone}
        onOpenChange={setFormDialogOpen}
        onCreated={reconcileAfterCreate}
        onUpdated={reconcileAfterUpdate}
      />

      <ConfirmActionDialog
        open={deletingAddress !== null}
        onOpenChange={(open) => {
          if (isDeleting) {
            return;
          }
          if (!open) {
            setDeletingAddress(null);
            setDeleteError(null);
          }
        }}
        title="Xác nhận xóa địa chỉ?"
        description={
          deletingAddress
            ? buildDeleteAddressConfirmDescription(
                deletingAddress,
                activeAddresses.length,
              )
            : ""
        }
        confirmLabel="Xóa địa chỉ"
        pendingLabel="Đang xóa..."
        isPending={isDeleting}
        errorMessage={deleteError}
        onConfirm={() => void handleConfirmDelete()}
      />
    </div>
  );
}

/**
 * Degraded-mode recovery view preserving 7-day session cookies when address book SSR fails transiently (`INV-SF-ADDR-4`).
 */
export function AccountAddressesDegradedView() {
  const router = useRouter();
  return (
    <AccountProfileDegradedCard
      title="Không thể tải sổ địa chỉ lúc này"
      description="Kết nối tới máy chủ GreenRoots Farm đang tạm gián đoạn. Phiên đăng nhập của bạn vẫn được giữ nguyên — vui lòng thử tải lại sau ít giây."
      onRetry={() => router.refresh()}
    />
  );
}

/**
 * Streaming skeleton placeholder rendered inside `<Suspense>` while `/account/addresses` resolves session & addresses.
 */
export function AccountAddressesSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-4">
      <Skeleton className="h-80 w-full rounded-xl" />
    </div>
  );
}
