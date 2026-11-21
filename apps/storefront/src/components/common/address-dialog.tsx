"use client";

import { useEffect, useState } from "react";
import { HCMC_DISTRICTS } from "@greenroots/shared";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from "@greenroots/ui";
import { CheckCircle2, MapPin, Plus, Truck } from "lucide-react";
import { FARM_METADATA } from "@/constants/farm-metadata.constant";
import { formatVnd } from "@/lib/format";
import { estimateDistrictPreviewQuote } from "@/lib/shipping";
import {
  createAddress,
  fetchAddresses,
  type Address,
} from "@/services/user.service";
import { useCartStore } from "@/stores/cart.store";

interface AddressDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export function AddressDialog({ open, onOpenChange }: AddressDialogProps) {
  const selectedDistrictCode = useCartStore(
    (state) => state.selectedDistrictCode,
  );
  const streetAddress = useCartStore((state) => state.streetAddress);
  const selectedAddressId = useCartStore((state) => state.selectedAddressId);
  const setDeliveryDistrict = useCartStore(
    (state) => state.setDeliveryDistrict,
  );
  const setDeliveryAddress = useCartStore((state) => state.setDeliveryAddress);

  const [savedAddresses, setSavedAddresses] = useState<Address[]>([]);
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(false);
  const [mode, setMode] = useState<"select" | "create">("select");

  // Selection state
  const [draftAddressId, setDraftAddressId] = useState<string | null>(
    selectedAddressId ?? null,
  );
  const [draftDistrictCode, setDraftDistrictCode] =
    useState(selectedDistrictCode);
  const [draftStreet, setDraftStreet] = useState(streetAddress);

  // New address form state
  const [newReceiverName, setNewReceiverName] = useState("");
  const [newPhoneNumber, setNewPhoneNumber] = useState("");
  const [newDistrictCode, setNewDistrictCode] = useState(selectedDistrictCode);
  const [newStreetAddress, setNewStreetAddress] = useState("");
  const [newIsDefault, setNewIsDefault] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load customer address book whenever dialog opens
  useEffect(() => {
    if (!open) return;

    let isMounted = true;

    async function loadSavedAddresses() {
      setIsLoadingAddresses(true);
      try {
        const addresses = await fetchAddresses();
        if (!isMounted) return;
        setSavedAddresses(addresses);
        if (addresses.length > 0 && !selectedAddressId) {
          const matched =
            addresses.find((item) => item.isDefault) ?? addresses[0];
          setDraftAddressId(matched.id);
          setDraftDistrictCode(matched.districtCode);
          setDraftStreet(matched.streetAddress);
        }
      } finally {
        if (isMounted) {
          setIsLoadingAddresses(false);
        }
      }
    }

    void loadSavedAddresses();

    return () => {
      isMounted = false;
    };
  }, [open, selectedAddressId]);

  const activeDistrictCode =
    mode === "create" ? newDistrictCode : draftDistrictCode;
  const district =
    HCMC_DISTRICTS.find((item) => item.code === activeDistrictCode) ??
    HCMC_DISTRICTS[0];
  const quote = estimateDistrictPreviewQuote(district);

  function handleSelectSaved(addr: Address) {
    setDraftAddressId(addr.id);
    setDraftDistrictCode(addr.districtCode);
    setDraftStreet(addr.streetAddress);
  }

  function handleSaveSelection() {
    if (draftAddressId) {
      const selected = savedAddresses.find(
        (item) => item.id === draftAddressId,
      );
      if (selected) {
        setDeliveryAddress({
          addressId: selected.id,
          districtCode: selected.districtCode,
          streetAddress: selected.streetAddress,
          receiverName: selected.receiverName,
          phoneNumber: selected.phoneNumber,
        });
        toast.success(
          `Đã chọn địa chỉ: ${selected.streetAddress}, ${selected.district}`,
        );
        onOpenChange(false);
        return;
      }
    }

    setDeliveryDistrict(district.code, draftStreet.trim());
    toast.success(`Đã chọn khu vực: ${district.name}`);
    onOpenChange(false);
  }

  async function handleCreateNewAddress() {
    if (!newReceiverName.trim()) {
      toast.error("Vui lòng nhập họ tên người nhận");
      return;
    }
    if (!newPhoneNumber.trim()) {
      toast.error("Vui lòng nhập số điện thoại");
      return;
    }
    if (!newStreetAddress.trim()) {
      toast.error("Vui lòng nhập số nhà, tên đường");
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await createAddress({
        receiverName: newReceiverName.trim(),
        phoneNumber: newPhoneNumber.trim(),
        districtCode: newDistrictCode,
        streetAddress: newStreetAddress.trim(),
        isDefault: newIsDefault,
      });

      setSavedAddresses((prev) => [created, ...prev]);
      setDeliveryAddress({
        addressId: created.id,
        districtCode: created.districtCode,
        streetAddress: created.streetAddress,
        receiverName: created.receiverName,
        phoneNumber: created.phoneNumber,
      });

      toast.success("Đã thêm và kích hoạt địa chỉ giao hàng mới");
      setMode("select");
      onOpenChange(false);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Không thể lưu địa chỉ, vui lòng thử lại.";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-bold text-brand-dark">
            <MapPin className="size-5 text-brand-forest" />
            {mode === "create"
              ? "Thêm địa chỉ nhận hàng mới"
              : "Chọn khu vực & địa chỉ giao hàng"}
          </DialogTitle>
          <DialogDescription className="text-gray-500">
            Hệ thống giao nông sản tươi hỏa tốc từ nông trại Củ Chi theo bán
            kính cam kết {FARM_METADATA.maxDeliveryRadiusKm} km.
          </DialogDescription>
        </DialogHeader>

        {mode === "select" && savedAddresses.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-700">
                Sổ địa chỉ của bạn ({savedAddresses.length})
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setMode("create")}
                className="h-7 text-xs font-semibold text-brand-forest hover:bg-green-50"
              >
                <Plus className="mr-1 size-3.5" />
                Thêm địa chỉ mới
              </Button>
            </div>

            <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
              {savedAddresses.map((addr) => {
                const isSelected = draftAddressId === addr.id;
                return (
                  <button
                    key={addr.id}
                    type="button"
                    onClick={() => handleSelectSaved(addr)}
                    className={`w-full cursor-pointer rounded-xl border p-3 text-left transition ${
                      isSelected
                        ? "border-brand-forest bg-green-50/60 ring-2 ring-brand-forest/20"
                        : "border-border-subtle bg-white hover:border-gray-300 hover:bg-gray-50/50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-gray-900">
                            {addr.receiverName}
                          </span>
                          <span className="text-xs text-gray-500">
                            ({addr.phoneNumber})
                          </span>
                          {addr.isDefault && (
                            <Badge className="border-0 bg-green-100 px-1.5 py-0 text-[10px] font-semibold text-brand-dark">
                              Mặc định
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-gray-600">
                          {addr.streetAddress}, {addr.district}, {addr.city}
                        </p>
                      </div>
                      {isSelected ? (
                        <CheckCircle2 className="size-4 shrink-0 text-brand-forest" />
                      ) : (
                        <div className="size-4 shrink-0 rounded-full border border-gray-300" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {mode === "create" ? (
          <div className="space-y-3.5 rounded-xl border border-border-subtle bg-surface-warm/40 p-3.5">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="space-y-1">
                <label
                  htmlFor="new-receiver-name"
                  className="text-xs font-semibold text-gray-700"
                >
                  Họ tên người nhận
                </label>
                <Input
                  id="new-receiver-name"
                  value={newReceiverName}
                  onChange={(e) => setNewReceiverName(e.target.value)}
                  placeholder="Ví dụ: Nguyễn Văn A"
                  className="h-10 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="new-phone-number"
                  className="text-xs font-semibold text-gray-700"
                >
                  Số điện thoại
                </label>
                <Input
                  id="new-phone-number"
                  value={newPhoneNumber}
                  onChange={(e) => setNewPhoneNumber(e.target.value)}
                  placeholder="Ví dụ: 0912345678"
                  className="h-10 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="new-district-select"
                className="text-xs font-semibold text-gray-700"
              >
                Quận / Huyện / TP. Thủ Đức
              </label>
              <Select
                value={newDistrictCode}
                onValueChange={(value) => {
                  if (value) setNewDistrictCode(value);
                }}
              >
                <SelectTrigger
                  id="new-district-select"
                  className="h-10 w-full text-xs"
                >
                  <SelectValue placeholder="Chọn quận / huyện" />
                </SelectTrigger>
                <SelectContent>
                  {HCMC_DISTRICTS.map((item) => (
                    <SelectItem
                      key={item.code}
                      value={item.code}
                      className="text-xs"
                    >
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="new-street-address"
                className="text-xs font-semibold text-gray-700"
              >
                Số nhà, tên đường
              </label>
              <Input
                id="new-street-address"
                value={newStreetAddress}
                onChange={(e) => setNewStreetAddress(e.target.value)}
                placeholder="Ví dụ: 120 Lê Lợi, Phường Bến Thành"
                className="h-10 text-xs"
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2 pt-0.5 text-xs text-gray-700">
              <input
                type="checkbox"
                checked={newIsDefault}
                onChange={(e) => setNewIsDefault(e.target.checked)}
                className="size-4 rounded border-gray-300 text-brand-forest focus:ring-brand-forest"
              />
              <span>Đặt làm địa chỉ nhận hàng mặc định</span>
            </label>
          </div>
        ) : (
          savedAddresses.length === 0 &&
          !isLoadingAddresses && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="district-select"
                  className="text-xs font-semibold text-gray-700"
                >
                  Quận / Huyện / TP. Thủ Đức
                </label>
                <Select
                  value={draftDistrictCode}
                  onValueChange={(value) => {
                    if (value) {
                      setDraftDistrictCode(value);
                      setDraftAddressId(null);
                    }
                  }}
                >
                  <SelectTrigger
                    id="district-select"
                    className="h-11 w-full text-xs"
                  >
                    <SelectValue placeholder="Chọn quận / huyện" />
                  </SelectTrigger>
                  <SelectContent>
                    {HCMC_DISTRICTS.map((item) => (
                      <SelectItem
                        key={item.code}
                        value={item.code}
                        className="text-xs"
                      >
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="street-address-input"
                  className="text-xs font-semibold text-gray-700"
                >
                  Số nhà, tên đường (tùy chọn)
                </label>
                <Input
                  id="street-address-input"
                  value={draftStreet}
                  onChange={(event) => {
                    setDraftStreet(event.target.value);
                    setDraftAddressId(null);
                  }}
                  placeholder="Ví dụ: 120 Lê Lợi, Phường Bến Thành"
                  className="h-11 text-xs"
                />
              </div>
            </div>
          )
        )}

        <div className="space-y-1.5 rounded-xl border border-border-subtle bg-surface-warm p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-gray-600">
              <Truck className="size-4 text-brand-forest" />
              Khoảng cách ước tính ({district.name})
            </span>
            <span className="font-bold text-gray-900">
              ~{quote.roadDistanceKm} km
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Phí giao hỏa tốc dự kiến</span>
            {quote.isDeliverable ? (
              <Badge className="border-0 bg-green-100 text-brand-dark">
                {formatVnd(quote.feeVnd)}
              </Badge>
            ) : (
              <Badge variant="destructive">
                Ngoài phạm vi giao tươi {FARM_METADATA.maxDeliveryRadiusKm} km
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
          {mode === "create" ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={() => setMode("select")}
                className="text-xs"
              >
                Quay lại
              </Button>
              <Button
                type="button"
                disabled={isSubmitting}
                className="bg-brand-forest text-xs font-bold text-white hover:bg-brand-dark"
                onClick={handleCreateNewAddress}
              >
                {isSubmitting ? "Đang lưu..." : "Lưu địa chỉ"}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="text-xs"
              >
                Đóng
              </Button>
              <Button
                type="button"
                className="bg-brand-forest text-xs font-bold text-white hover:bg-brand-dark"
                onClick={handleSaveSelection}
              >
                Xác nhận địa chỉ
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
