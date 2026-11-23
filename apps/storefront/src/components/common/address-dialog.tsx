"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SubmitEvent,
} from "react";
import { HCMC_DISTRICTS } from "@greenroots/shared";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Label,
  Skeleton,
  buttonVariants,
} from "@greenroots/ui";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
} from "lucide-react";
import { FARM_METADATA } from "@/constants/farm-metadata.constant";
import {
  AddressFormFields,
  DeliveryQuotePreview,
  HcmcDistrictSelect,
} from "@/features/account/components/address-form-fields";
import {
  createAddressAction,
  listAddressesAction,
} from "@/lib/address/address-actions";
import {
  MAX_USER_ADDRESSES,
  createAddressFormSchema,
} from "@/lib/address/address-validation";
import { invalidateStorefrontClientSession } from "@/lib/auth/client-logout";
import { useAuthStore } from "@/stores/auth.store";
import { useCartStore } from "@/stores/cart.store";
import {
  findActiveDeliveryAddress,
  useDeliveryAddressStore,
} from "@/stores/delivery-address.store";
import type { CustomerAddress } from "@/types/address.types";
import type { StorefrontSessionUser } from "@/types/auth.types";

interface AddressDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly listAddressesFn?: typeof listAddressesAction;
  readonly createAddressFn?: typeof createAddressAction;
}

interface AddressDialogPanelProps extends AddressDialogProps {
  readonly onNavigateLogin?: () => void;
  readonly onRefresh?: () => void;
}

const DEFAULT_DISTRICT_CODE = HCMC_DISTRICTS[0].code;
const RPC_CONNECTION_ERROR = "Không thể kết nối tới máy chủ GreenRoots Farm.";

function AddressDialogGuestContent({
  onClose,
}: {
  readonly onClose: () => void;
}) {
  const setDeliveryDistrict = useCartStore(
    (state) => state.setDeliveryDistrict,
  );
  const [draftDistrictCode, setDraftDistrictCode] = useState(
    () => useCartStore.getState().selectedDistrictCode,
  );

  function handleSaveDistrict() {
    setDeliveryDistrict(draftDistrictCode, "");
    onClose();
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label
          htmlFor="guest-district-select"
          className="text-xs font-semibold text-gray-800"
        >
          Quận / Huyện / TP. Thủ Đức
        </Label>
        <HcmcDistrictSelect
          id="guest-district-select"
          value={draftDistrictCode}
          onValueChange={setDraftDistrictCode}
        />
      </div>

      <DeliveryQuotePreview districtCode={draftDistrictCode} />

      <div className="flex items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface-warm px-3 py-2 text-xs text-gray-600">
        <span>Đăng nhập để chọn nhanh từ sổ địa chỉ đã lưu.</span>
        <Link
          href="/login"
          onClick={onClose}
          className="shrink-0 font-semibold text-brand-forest hover:underline"
        >
          Đăng nhập
        </Link>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          className="cursor-pointer"
        >
          Đóng
        </Button>
        <Button
          type="button"
          onClick={handleSaveDistrict}
          className="cursor-pointer border-brand-forest bg-brand-forest font-bold text-white hover:border-brand-dark hover:bg-brand-dark"
        >
          Xác nhận khu vực
        </Button>
      </div>
    </div>
  );
}

function AddressDialogAuthenticatedContent({
  user,
  mode,
  isSubmitting,
  listAddressesFn,
  createAddressFn,
  onNavigateLogin,
  onRefresh,
  onModeChange,
  onSubmittingChange,
  onCloseProgrammatically,
}: {
  readonly user: StorefrontSessionUser;
  readonly mode: "select" | "create";
  readonly isSubmitting: boolean;
  readonly listAddressesFn: typeof listAddressesAction;
  readonly createAddressFn: typeof createAddressAction;
  readonly onNavigateLogin?: () => void;
  readonly onRefresh?: () => void;
  readonly onModeChange: (mode: "select" | "create") => void;
  readonly onSubmittingChange: (pending: boolean) => void;
  readonly onCloseProgrammatically: () => void;
}) {
  const savedAddresses = useDeliveryAddressStore((state) => state.addresses);
  const setAddresses = useDeliveryAddressStore((state) => state.setAddresses);
  const selectSavedAddress = useDeliveryAddressStore(
    (state) => state.selectSavedAddress,
  );
  const reconcileAfterCreate = useDeliveryAddressStore(
    (state) => state.reconcileAfterCreate,
  );

  const [isLoadingAddresses, setIsLoadingAddresses] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draftAddressId, setDraftAddressId] = useState<string | null>(() => {
    const snapshot = useDeliveryAddressStore.getState();
    return (
      findActiveDeliveryAddress(snapshot.addresses, snapshot.selectedAddressId)
        ?.id ?? null
    );
  });

  const [newReceiverName, setNewReceiverName] = useState(user.fullName);
  const [newPhoneNumber, setNewPhoneNumber] = useState(user.phone ?? "");
  const [newDistrictCode, setNewDistrictCode] = useState(DEFAULT_DISTRICT_CODE);
  const [newStreetAddress, setNewStreetAddress] = useState("");
  const [newIsDefault, setNewIsDefault] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const hasFetchedRef = useRef(false);

  const handleSessionInvalidated = useCallback(() => {
    invalidateStorefrontClientSession();
    onCloseProgrammatically();
    onNavigateLogin?.();
  }, [onCloseProgrammatically, onNavigateLogin]);

  const applyAddressLoadOutcome = useCallback(
    (result: Awaited<ReturnType<typeof listAddressesAction>>) => {
      if (!result.ok) {
        if (result.sessionInvalidated) {
          handleSessionInvalidated();
          return;
        }
        setLoadError(result.message);
        return;
      }

      setAddresses(result.addresses);
      const preferred = findActiveDeliveryAddress(
        result.addresses,
        useDeliveryAddressStore.getState().selectedAddressId,
      );
      setDraftAddressId(preferred?.id ?? null);
    },
    [handleSessionInvalidated, setAddresses],
  );

  useEffect(() => {
    // Load once per dialog open so parent re-renders never re-trigger background fetches.
    if (hasFetchedRef.current) {
      return;
    }
    hasFetchedRef.current = true;

    let active = true;
    void listAddressesFn()
      .then((result) => {
        if (!active) {
          return;
        }
        applyAddressLoadOutcome(result);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setLoadError(RPC_CONNECTION_ERROR);
      })
      .finally(() => {
        if (active) {
          setIsLoadingAddresses(false);
        }
      });

    return () => {
      active = false;
    };
  }, [applyAddressLoadOutcome, listAddressesFn]);

  async function handleRetryLoad() {
    setLoadError(null);
    setIsLoadingAddresses(true);
    try {
      const result = await listAddressesFn();
      applyAddressLoadOutcome(result);
    } catch {
      setLoadError(RPC_CONNECTION_ERROR);
    } finally {
      setIsLoadingAddresses(false);
    }
  }

  function enterCreateMode() {
    setSubmitError(null);
    setNewReceiverName(user.fullName);
    setNewPhoneNumber(user.phone ?? "");
    setNewDistrictCode(DEFAULT_DISTRICT_CODE);
    setNewStreetAddress("");
    setNewIsDefault(savedAddresses.length === 0);
    onModeChange("create");
  }

  function handleConfirmSelection() {
    if (!draftAddressId) {
      return;
    }
    selectSavedAddress(draftAddressId);
    onCloseProgrammatically();
  }

  async function handleCreateNewAddress(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    const lockDefault = savedAddresses.length === 0;
    const parsed = createAddressFormSchema.safeParse({
      receiverName: newReceiverName,
      phoneNumber: newPhoneNumber,
      districtCode: newDistrictCode,
      streetAddress: newStreetAddress,
      isDefault: lockDefault ? true : newIsDefault,
    });
    if (!parsed.success) {
      setSubmitError(
        parsed.error.issues.at(0)?.message ??
          "Vui lòng kiểm tra lại thông tin địa chỉ.",
      );
      return;
    }

    setSubmitError(null);
    onSubmittingChange(true);
    try {
      const result = await createAddressFn(parsed.data);
      if (!result.ok) {
        if (result.sessionInvalidated) {
          handleSessionInvalidated();
          return;
        }
        setSubmitError(result.message);
        return;
      }

      reconcileAfterCreate(result.address);
      onCloseProgrammatically();
      onRefresh?.();
    } catch {
      setSubmitError(RPC_CONNECTION_ERROR);
    } finally {
      onSubmittingChange(false);
    }
  }

  const reachedCap = savedAddresses.length >= MAX_USER_ADDRESSES;
  const selectedSavedAddress: CustomerAddress | null =
    findActiveDeliveryAddress(savedAddresses, draftAddressId);
  const previewDistrictCode =
    mode === "create"
      ? newDistrictCode
      : (selectedSavedAddress?.districtCode ?? DEFAULT_DISTRICT_CODE);

  if (mode === "create") {
    return (
      <form
        noValidate
        onSubmit={(event) => void handleCreateNewAddress(event)}
        className="space-y-4"
      >
        <AddressFormFields
          idPrefix="header-dialog-address"
          receiverName={newReceiverName}
          phoneNumber={newPhoneNumber}
          districtCode={newDistrictCode}
          streetAddress={newStreetAddress}
          showDefaultCheckbox={true}
          isDefault={newIsDefault}
          lockDefaultChecked={savedAddresses.length === 0}
          disabled={isSubmitting}
          errorMessage={submitError}
          onReceiverNameChange={setNewReceiverName}
          onPhoneNumberChange={setNewPhoneNumber}
          onDistrictCodeChange={setNewDistrictCode}
          onStreetAddressChange={setNewStreetAddress}
          onIsDefaultChange={setNewIsDefault}
        />

        <div className="flex items-center justify-between gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={() => onModeChange("select")}
            className="cursor-pointer"
          >
            Quay lại
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="cursor-pointer gap-2 border-brand-forest bg-brand-forest font-bold text-white hover:border-brand-dark hover:bg-brand-dark"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                <span>Đang lưu...</span>
              </>
            ) : (
              <span>Lưu địa chỉ</span>
            )}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      {loadError ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden="true" />
          <AlertDescription className="flex flex-col gap-2">
            <span>{loadError}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleRetryLoad()}
              className="w-fit cursor-pointer gap-1.5"
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              <span>Thử tải lại</span>
            </Button>
          </AlertDescription>
        </Alert>
      ) : isLoadingAddresses && savedAddresses.length === 0 ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      ) : savedAddresses.length === 0 ? (
        <div className="space-y-3 rounded-xl border border-dashed border-border-subtle bg-surface-warm p-5 text-center">
          <p className="text-sm font-semibold text-gray-900">
            Bạn chưa có địa chỉ giao hàng nào trong sổ
          </p>
          <p className="text-xs text-gray-500">
            Thêm địa chỉ đầu tiên để đặt hàng nhanh hơn.
          </p>
          <Button
            type="button"
            onClick={enterCreateMode}
            className="cursor-pointer gap-1.5 bg-brand-forest text-xs font-semibold text-white hover:bg-brand-dark"
          >
            <Plus className="size-4" aria-hidden="true" />
            <span>Thêm địa chỉ đầu tiên</span>
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-gray-700 tabular-nums">
              Sổ địa chỉ của bạn ({savedAddresses.length}/{MAX_USER_ADDRESSES})
            </span>
            <div className="flex items-center gap-2">
              <Link
                href="/account/addresses"
                prefetch={false}
                onClick={onCloseProgrammatically}
                className="text-xs font-semibold text-gray-600 hover:text-brand-forest hover:underline"
              >
                Quản lý sổ
              </Link>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={reachedCap}
                onClick={enterCreateMode}
                className="h-7 cursor-pointer px-2 text-xs font-semibold text-brand-forest hover:bg-green-50"
              >
                <Plus className="mr-1 size-3.5" aria-hidden="true" />
                <span>Thêm mới</span>
              </Button>
            </div>
          </div>

          <div className="max-h-56 space-y-2 overflow-y-auto py-0.5 pr-1">
            {savedAddresses.map((addr) => {
              const isSelected = draftAddressId === addr.id;
              return (
                <Button
                  key={addr.id}
                  type="button"
                  variant="ghost"
                  onClick={() => setDraftAddressId(addr.id)}
                  className={
                    isSelected
                      ? "h-auto w-full cursor-pointer justify-between rounded-xl border border-brand-forest bg-green-50/60 p-3 text-left whitespace-normal hover:bg-green-50 active:not-aria-[haspopup]:translate-y-0"
                      : "h-auto w-full cursor-pointer justify-between rounded-xl border border-border-subtle bg-white p-3 text-left whitespace-normal hover:border-gray-300 hover:bg-gray-50/70 active:not-aria-[haspopup]:translate-y-0"
                  }
                >
                  <div className="flex w-full items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-bold text-gray-900">
                          {addr.receiverName}
                        </span>
                        <span className="text-xs text-gray-500 tabular-nums">
                          ({addr.phoneNumber})
                        </span>
                        {addr.isDefault ? (
                          <Badge className="border-0 bg-green-100 px-1.5 py-0 text-[10px] font-semibold text-brand-dark">
                            Mặc định
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-gray-600">
                        {addr.streetAddress}, {addr.district}, {addr.city}
                      </p>
                    </div>
                    {isSelected ? (
                      <CheckCircle2
                        className="size-4 shrink-0 text-brand-forest"
                        aria-hidden="true"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="size-4 shrink-0 rounded-full border border-gray-300"
                      />
                    )}
                  </div>
                </Button>
              );
            })}
          </div>

          <DeliveryQuotePreview districtCode={previewDistrictCode} />
        </>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          onClick={onCloseProgrammatically}
          className="cursor-pointer"
        >
          Đóng
        </Button>
        {savedAddresses.length > 0 && !loadError ? (
          <Button
            type="button"
            disabled={!draftAddressId}
            onClick={handleConfirmSelection}
            className="cursor-pointer border-brand-forest bg-brand-forest font-bold text-white hover:border-brand-dark hover:bg-brand-dark"
          >
            Xác nhận địa chỉ
          </Button>
        ) : (
          <Link
            href="/account/addresses"
            prefetch={false}
            onClick={onCloseProgrammatically}
            className={buttonVariants({
              variant: "secondary",
              className: "text-xs font-semibold",
            })}
          >
            Mở sổ địa chỉ
          </Link>
        )}
      </div>
    </div>
  );
}

/**
 * Router-free presentation and BFF action coordinator for `AddressDialog`.
 * Exported directly for isolated unit/DOM verification without mocking `next/navigation`.
 */
export function AddressDialogPanel({
  open,
  onOpenChange,
  listAddressesFn = listAddressesAction,
  createAddressFn = createAddressAction,
  onNavigateLogin,
  onRefresh,
}: AddressDialogPanelProps) {
  const activeUser = useAuthStore((state) => state.user);
  const [mode, setMode] = useState<"select" | "create">("select");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Programmatic close bypasses user-dismiss guard so create success and session invalidation always dismiss cleanly.
  const closeProgrammatically = useCallback(() => {
    setIsSubmitting(false);
    setMode("select");
    onOpenChange(false);
  }, [onOpenChange]);

  function handleUserOpenChange(nextOpen: boolean) {
    if (isSubmitting) {
      return;
    }
    if (!nextOpen) {
      setMode("select");
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleUserOpenChange}>
      <DialogContent
        showCloseButton={!isSubmitting}
        className="max-h-[90vh] overflow-y-auto bg-white sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-bold text-brand-dark">
            <MapPin
              className="size-5 shrink-0 text-brand-forest"
              aria-hidden="true"
            />
            <span>
              {mode === "create"
                ? "Thêm địa chỉ nhận hàng mới"
                : activeUser
                  ? "Chọn địa chỉ giao hàng"
                  : "Chọn khu vực giao hàng TP.HCM"}
            </span>
          </DialogTitle>
          <DialogDescription className="text-gray-500">
            Hệ thống giao nông sản tươi hỏa tốc từ nông trại Củ Chi theo bán
            kính cam kết {FARM_METADATA.maxDeliveryRadiusKm} km.
          </DialogDescription>
        </DialogHeader>

        {!open ? null : activeUser ? (
          <AddressDialogAuthenticatedContent
            key={activeUser.id}
            user={activeUser}
            mode={mode}
            isSubmitting={isSubmitting}
            listAddressesFn={listAddressesFn}
            createAddressFn={createAddressFn}
            onNavigateLogin={onNavigateLogin}
            onRefresh={onRefresh}
            onModeChange={setMode}
            onSubmittingChange={setIsSubmitting}
            onCloseProgrammatically={closeProgrammatically}
          />
        ) : (
          <AddressDialogGuestContent onClose={closeProgrammatically} />
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Interactive header/storefront delivery location dialog supporting both:
 * - Authenticated customers picking from or quick-adding to their saved HCMC address book (BFF-backed).
 * - Guest visitors selecting a canonical HCMC district code (`INV-SF-ADDR-1` zero PII in `localStorage`).
 */
export function AddressDialog(props: AddressDialogProps) {
  const router = useRouter();

  return (
    <AddressDialogPanel
      {...props}
      onNavigateLogin={() => router.replace("/login")}
      onRefresh={() => router.refresh()}
    />
  );
}
