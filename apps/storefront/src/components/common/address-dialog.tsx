"use client";

import { useState } from "react";
import { HCMC_DISTRICTS, estimateDeliveryQuote } from "@greenroots/shared";
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
} from "@greenroots/ui";
import { MapPin, Truck } from "lucide-react";
import { FARM_METADATA } from "@/constants/farm-metadata.constant";
import { formatVnd } from "@/lib/format";
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
  const setDeliveryDistrict = useCartStore(
    (state) => state.setDeliveryDistrict,
  );

  const [draftDistrictCode, setDraftDistrictCode] =
    useState(selectedDistrictCode);
  const [draftStreet, setDraftStreet] = useState(streetAddress);

  const district =
    HCMC_DISTRICTS.find((item) => item.code === draftDistrictCode) ??
    HCMC_DISTRICTS[0];
  const quote = estimateDeliveryQuote(district.latitude, district.longitude);

  function handleSave() {
    setDeliveryDistrict(district.code, draftStreet.trim());
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-bold text-brand-dark">
            <MapPin className="size-5 text-brand-forest" />
            Chọn khu vực giao hàng TP.HCM
          </DialogTitle>
          <DialogDescription className="text-gray-500">
            Hệ thống ước lượng khoảng cách thực tế theo hệ số khúc quanh 1.30 từ
            nông trại Củ Chi.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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
                if (value) setDraftDistrictCode(value);
              }}
            >
              <SelectTrigger id="district-select" className="h-11 w-full">
                <SelectValue placeholder="Chọn quận / huyện" />
              </SelectTrigger>
              <SelectContent>
                {HCMC_DISTRICTS.map((item) => (
                  <SelectItem key={item.code} value={item.code}>
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
              onChange={(event) => setDraftStreet(event.target.value)}
              placeholder="Ví dụ: 120 Lê Lợi, Phường Bến Thành"
              className="h-11"
            />
          </div>

          <div className="space-y-1.5 rounded-xl border border-border-subtle bg-surface-warm p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-gray-600">
                <Truck className="size-4 text-brand-forest" />
                Khoảng cách ước tính
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

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Đóng
            </Button>
            <Button
              type="button"
              className="bg-brand-forest font-bold text-white hover:bg-brand-dark"
              onClick={handleSave}
            >
              Xác nhận địa chỉ
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
