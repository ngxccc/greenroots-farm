"use client";

import Link from "next/link";
import { useEffect, useState, type SubmitEvent } from "react";
import {
  BUSINESS_RULES,
  HCMC_DISTRICTS,
  PaymentMethod,
  estimateDeliveryQuote,
} from "@greenroots/shared";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
  buttonVariants,
} from "@greenroots/ui";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Leaf,
  MapPin,
  Phone,
  QrCode,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Truck,
  User,
} from "lucide-react";
import { FARM_METADATA } from "@/constants/farm-metadata.constant";
import { formatVnd } from "@/lib/format";
import { useCartStore } from "@/stores/cart.store";
import type { StorefrontProduct } from "@/types/storefront.types";

const MOCK_SAMPLE_PRODUCTS: readonly StorefrontProduct[] = [
  {
    id: "0195a8f0-0001-7000-8000-000000000001",
    slug: "xa-lach-romaine",
    name: "Xà lách Romaine",
    unit: "túi",
    unitLabel: "300g",
    basePriceVnd: 36000,
    salePriceVnd: 18000,
    availableQuantity: 12,
    categoryKey: "leaf",
    badgeText: "VietGAP",
    isRescueDeal: true,
    isSubscriptionEligible: true,
  },
  {
    id: "0195a8f0-0002-7000-8000-000000000002",
    slug: "ca-chua-bi-huu-co",
    name: "Cà chua bi",
    unit: "hộp",
    unitLabel: "500g",
    basePriceVnd: 56000,
    salePriceVnd: 28000,
    availableQuantity: 18,
    categoryKey: "fruit",
    badgeText: "Cắt 4h sáng",
    isRescueDeal: true,
    isSubscriptionEligible: true,
  },
  {
    id: "0195a8f0-0007-7000-8000-000000000007",
    slug: "ca-rot-huu-co",
    name: "Cà rốt hữu cơ",
    unit: "kg",
    unitLabel: "1 kg",
    basePriceVnd: 38000,
    availableQuantity: 30,
    categoryKey: "fruit",
    badgeText: "VietGAP",
    isRescueDeal: false,
    isSubscriptionEligible: true,
  },
];

const AVAILABLE_MOCK_POINTS = 25000;
const INITIAL_TIMER_SECONDS = BUSINESS_RULES.ORDER_PAYMENT_TIMEOUT_MINUTES * 60;

export function CheckoutView() {
  const items = useCartStore((state) => state.items);
  const addItem = useCartStore((state) => state.addItem);
  const clearCart = useCartStore((state) => state.clearCart);
  const selectedDistrictCode = useCartStore(
    (state) => state.selectedDistrictCode,
  );
  const streetAddress = useCartStore((state) => state.streetAddress);
  const setDeliveryDistrict = useCartStore(
    (state) => state.setDeliveryDistrict,
  );

  const [customerName, setCustomerName] = useState("Nguyễn Văn An");
  const [phoneNumber, setPhoneNumber] = useState("0908123456");
  const [draftStreet, setDraftStreet] = useState(
    streetAddress || "120 Lê Lợi, Phường Bến Thành",
  );
  const [deliveryNote, setDeliveryNote] = useState(
    "Giao giờ hành chính, gọi trước khi giao",
  );
  const [useLoyaltyPoints, setUseLoyaltyPoints] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    PaymentMethod.PAYOS,
  );

  const [payOsDialogOpen, setPayOsDialogOpen] = useState(false);
  const [timeLeft, setTimeLeft] = useState(INITIAL_TIMER_SECONDS);
  const [copiedAccount, setCopiedAccount] = useState(false);

  const [orderSuccess, setOrderSuccess] = useState<{
    readonly orderId: string;
    readonly paymentMethod: PaymentMethod;
    readonly totalVnd: number;
    readonly isPaid: boolean;
  } | null>(null);

  const activeDistrict =
    HCMC_DISTRICTS.find((d) => d.code === selectedDistrictCode) ??
    HCMC_DISTRICTS[0];
  const quote = estimateDeliveryQuote(
    activeDistrict.latitude,
    activeDistrict.longitude,
  );

  const subtotalVnd = items.reduce(
    (sum, item) => sum + item.unitPriceVnd * item.quantity,
    0,
  );
  const shippingFeeVnd = quote.feeVnd;
  const loyaltyDiscountVnd = useLoyaltyPoints
    ? Math.min(AVAILABLE_MOCK_POINTS, subtotalVnd)
    : 0;
  const finalTotalVnd = Math.max(
    0,
    subtotalVnd + shippingFeeVnd - loyaltyDiscountVnd,
  );
  const pointsToEarn = Math.round(
    (subtotalVnd * BUSINESS_RULES.LOYALTY_POINT_CONVERSION_PERCENT) / 100,
  );

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (payOsDialogOpen && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [payOsDialogOpen, timeLeft]);

  function handleDistrictChange(code: string | null) {
    if (!code) return;
    setDeliveryDistrict(code, draftStreet);
  }

  function handleAddSampleItems() {
    for (const prod of MOCK_SAMPLE_PRODUCTS) {
      addItem(prod, 1);
    }
  }

  function handleFormSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (items.length === 0) return;

    if (paymentMethod === PaymentMethod.PAYOS) {
      setTimeLeft(INITIAL_TIMER_SECONDS);
      setPayOsDialogOpen(true);
    } else {
      finalizeOrder(PaymentMethod.COD, false);
    }
  }

  function finalizeOrder(method: PaymentMethod, isPaid: boolean) {
    const generatedOrderId = `GR-20261116-${Math.floor(1000 + Math.random() * 9000)}`;
    setOrderSuccess({
      orderId: generatedOrderId,
      paymentMethod: method,
      totalVnd: finalTotalVnd,
      isPaid,
    });
    setPayOsDialogOpen(false);
    clearCart();
  }

  function handleCopyAccount() {
    void navigator.clipboard.writeText("0399888999");
    setCopiedAccount(true);
    setTimeout(() => setCopiedAccount(false), 2000);
  }

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  if (orderSuccess) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 px-3 pt-[148px] pb-16 lg:px-4 lg:pt-[124px]">
        <Card className="border-2 border-brand-forest bg-white shadow-md">
          <CardHeader className="pb-2 text-center">
            <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-brand-forest">
              <CheckCircle2 className="size-8" />
            </div>
            <Badge className="mx-auto border-0 bg-green-100 font-bold text-brand-dark">
              {orderSuccess.isPaid
                ? "ĐÃ THANH TOÁN (VIETQR PAYOS)"
                : "CHỜ XÁC NHẬN (COD)"}
            </Badge>
            <CardTitle className="mt-2 text-2xl font-extrabold text-gray-900">
              Đặt hàng nông sản thành công!
            </CardTitle>
            <p className="text-xs text-gray-600">
              Cảm ơn bạn đã lựa chọn nông sản tươi sạch từ Nông trại GreenRoots
              Củ Chi.
            </p>
          </CardHeader>

          <CardContent className="space-y-4 p-6 pt-2">
            <div className="space-y-2 rounded-xl border border-border-subtle bg-surface-warm p-4 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Mã đơn hàng:</span>
                <strong className="font-extrabold tracking-wide text-brand-dark">
                  {orderSuccess.orderId}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Người nhận:</span>
                <span className="font-semibold text-gray-900">
                  {customerName} ({phoneNumber})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Địa chỉ giao:</span>
                <span className="max-w-[260px] text-right font-semibold text-gray-900">
                  {draftStreet}, {activeDistrict.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Phương thức:</span>
                <span className="font-semibold text-gray-900">
                  {orderSuccess.paymentMethod === PaymentMethod.PAYOS
                    ? "Quét mã VietQR PayOS"
                    : "Tiền mặt khi nhận hàng (COD)"}
                </span>
              </div>
              <div className="flex justify-between border-t border-border-subtle pt-2 text-sm">
                <span className="font-bold text-gray-900">
                  Tổng thanh toán:
                </span>
                <strong className="text-base font-extrabold text-brand-forest">
                  {formatVnd(orderSuccess.totalVnd)}
                </strong>
              </div>
            </div>

            <div className="space-y-1 rounded-xl border border-green-200 bg-green-50/70 p-3 text-xs text-gray-700">
              <p className="flex items-center gap-1.5 font-bold text-brand-dark">
                <ShieldCheck className="size-4 text-brand-forest" />
                Cam kết độ tươi &amp; Bảo đảm 24h:
              </p>
              <p className="text-[11px] leading-relaxed text-gray-600">
                Đơn hàng được cắt tại vườn lúc 4h sáng và giao hỏa tốc trong 2h.
                Nếu nông sản bị dập nát do vận chuyển, bạn có quyền gửi khiếu
                nại trong vòng 24 giờ kể từ khi nhận hàng.
              </p>
            </div>

            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <Link
                href={`/orders/${orderSuccess.orderId}/complaint`}
                className={buttonVariants({
                  variant: "outline",
                  className:
                    "w-full sm:flex-1 font-bold border-red-300 text-red-700 hover:bg-red-50",
                })}
              >
                Khiếu nại thử đơn này (SF-05)
              </Link>
              <Link
                href="/"
                className={buttonVariants({
                  className:
                    "w-full sm:flex-1 bg-brand-forest hover:bg-brand-dark text-white font-bold",
                })}
              >
                Tiếp tục mua sắm
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-3 pt-[148px] pb-16 lg:px-4 lg:pt-[124px]">
      <div className="flex items-center justify-between border-b border-border-subtle pb-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-forest hover:underline"
        >
          <ArrowLeft className="size-4" />
          Tiếp tục mua nông sản
        </Link>
        <span className="text-xs font-semibold text-gray-500">
          Bước thanh toán &amp; xác thực đơn hàng (SF-05)
        </span>
      </div>

      <form onSubmit={handleFormSubmit} className="grid gap-6 lg:grid-cols-12">
        {/* Left Column: Customer & Delivery Info + Payment Method */}
        <div className="space-y-6 lg:col-span-7">
          {/* Section: Delivery Address */}
          <Card className="border-border-subtle bg-white shadow-sm">
            <CardHeader className="border-b border-border-subtle pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-extrabold text-gray-900">
                <MapPin className="size-5 text-brand-forest" />
                Địa chỉ nhận hàng nông sản
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-4 text-xs">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label
                    htmlFor="customer-name"
                    className="flex items-center gap-1 font-semibold text-gray-700"
                  >
                    <User className="size-3.5 text-gray-400" />
                    Họ và tên người nhận <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id="customer-name"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Nguyễn Văn A"
                    className="h-10 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="customer-phone"
                    className="flex items-center gap-1 font-semibold text-gray-700"
                  >
                    <Phone className="size-3.5 text-gray-400" />
                    Số điện thoại nhận hàng{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id="customer-phone"
                    required
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="0901234567"
                    className="h-10 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="district-select-checkout"
                  className="font-semibold text-gray-700"
                >
                  Quận / Huyện TP.HCM <span className="text-red-500">*</span>
                </label>
                <Select
                  value={selectedDistrictCode}
                  onValueChange={handleDistrictChange}
                >
                  <SelectTrigger
                    id="district-select-checkout"
                    className="h-10 w-full bg-white text-xs"
                  >
                    <SelectValue placeholder="Chọn quận / huyện" />
                  </SelectTrigger>
                  <SelectContent>
                    {HCMC_DISTRICTS.map((district) => (
                      <SelectItem key={district.code} value={district.code}>
                        {district.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="street-address-checkout"
                  className="font-semibold text-gray-700"
                >
                  Số nhà, tên đường, phường/xã{" "}
                  <span className="text-red-500">*</span>
                </label>
                <Input
                  id="street-address-checkout"
                  required
                  value={draftStreet}
                  onChange={(e) => {
                    setDraftStreet(e.target.value);
                    setDeliveryDistrict(selectedDistrictCode, e.target.value);
                  }}
                  placeholder="Ví dụ: 120 Lê Lợi, Phường Bến Thành"
                  className="h-10 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="delivery-note"
                  className="font-semibold text-gray-700"
                >
                  Ghi chú cho shipper (tùy chọn)
                </label>
                <Input
                  id="delivery-note"
                  value={deliveryNote}
                  onChange={(e) => setDeliveryNote(e.target.value)}
                  placeholder="Ví dụ: Để trước cửa, gọi điện trước khi đến 10 phút"
                  className="h-10 text-xs"
                />
              </div>

              {/* Haversine Quote Card */}
              <div className="space-y-2 rounded-xl border border-border-subtle bg-surface-warm p-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-gray-600">
                    <Truck className="size-4 text-brand-forest" />
                    Khoảng cách nội suy Haversine:
                  </span>
                  <span className="font-extrabold text-gray-900">
                    ~{quote.roadDistanceKm} km
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Phí vận chuyển dự kiến:</span>
                  {quote.isDeliverable ? (
                    <Badge className="border-0 bg-green-100 font-extrabold text-brand-dark">
                      {formatVnd(quote.feeVnd)}
                    </Badge>
                  ) : (
                    <Badge variant="destructive">
                      Ngoài bán kính giao tươi (
                      {FARM_METADATA.maxDeliveryRadiusKm} km)
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] leading-normal text-gray-500">
                  Đoạn đường tính từ Nông trại Củ Chi theo hệ số khúc quanh
                  1.30. Giao hỏa tốc bằng thùng giữ nhiệt đảm bảo độ tươi.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Section: Loyalty Points Deduction (1%) */}
          <Card className="border-border-subtle bg-white shadow-sm">
            <CardHeader className="border-b border-border-subtle pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-extrabold text-gray-900">
                <Sparkles className="size-5 text-amber-500" />
                Điểm thưởng thành viên GreenRoots
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4 text-xs">
              <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                <div className="space-y-0.5">
                  <p className="font-bold text-amber-900">
                    Bạn hiện có {AVAILABLE_MOCK_POINTS.toLocaleString("vi-VN")}{" "}
                    điểm
                  </p>
                  <p className="text-[11px] text-amber-700">
                    Tỷ lệ quy đổi: 1 điểm = 1đ giảm trực tiếp vào đơn hàng.
                  </p>
                </div>
                <label className="flex cursor-pointer items-center gap-2 font-bold text-brand-dark">
                  <input
                    type="checkbox"
                    checked={useLoyaltyPoints}
                    onChange={(e) => setUseLoyaltyPoints(e.target.checked)}
                    className="size-4 rounded accent-brand-forest"
                  />
                  <span>Dùng điểm</span>
                </label>
              </div>

              {useLoyaltyPoints ? (
                <div className="flex items-center justify-between text-xs font-semibold text-status-fresh">
                  <span>Khấu trừ từ điểm thưởng:</span>
                  <span>- {formatVnd(loyaltyDiscountVnd)}</span>
                </div>
              ) : null}

              <p className="text-[11px] text-gray-500">
                ★ Sau khi đơn hàng hoàn tất, bạn sẽ được tích lũy thêm 1% giá
                trị đơn hàng (~{formatVnd(pointsToEarn)}) cho lần mua kế tiếp.
              </p>
            </CardContent>
          </Card>

          {/* Section: Payment Method */}
          <Card className="border-border-subtle bg-white shadow-sm">
            <CardHeader className="border-b border-border-subtle pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-extrabold text-gray-900">
                <CreditCard className="size-5 text-brand-forest" />
                Phương thức thanh toán
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4 text-xs">
              <div className="grid gap-3 sm:grid-cols-2">
                <label
                  className={`flex cursor-pointer flex-col justify-between rounded-xl border p-3.5 transition ${
                    paymentMethod === PaymentMethod.PAYOS
                      ? "border-2 border-brand-forest bg-green-50/50 shadow-sm"
                      : "border-border-subtle bg-white hover:bg-gray-50"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 font-extrabold text-brand-dark">
                      <QrCode className="size-4 text-brand-forest" />
                      VietQR (PayOS)
                    </span>
                    <input
                      type="radio"
                      name="paymentMethod"
                      value={PaymentMethod.PAYOS}
                      checked={paymentMethod === PaymentMethod.PAYOS}
                      onChange={() => setPaymentMethod(PaymentMethod.PAYOS)}
                      className="accent-brand-forest"
                    />
                  </div>
                  <p className="text-[11px] text-gray-600">
                    Quét mã QR qua app ngân hàng, xử lý tức thì với đồng hồ đếm
                    ngược 15 phút.
                  </p>
                  <Badge className="mt-2 self-start border-0 bg-green-100 text-[10px] text-brand-dark">
                    Khuyên dùng
                  </Badge>
                </label>

                <label
                  className={`flex cursor-pointer flex-col justify-between rounded-xl border p-3.5 transition ${
                    paymentMethod === PaymentMethod.COD
                      ? "border-2 border-brand-forest bg-green-50/50 shadow-sm"
                      : "border-border-subtle bg-white hover:bg-gray-50"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 font-extrabold text-gray-900">
                      <Truck className="size-4 text-gray-600" />
                      Tiền mặt khi nhận (COD)
                    </span>
                    <input
                      type="radio"
                      name="paymentMethod"
                      value={PaymentMethod.COD}
                      checked={paymentMethod === PaymentMethod.COD}
                      onChange={() => setPaymentMethod(PaymentMethod.COD)}
                      className="accent-brand-forest"
                    />
                  </div>
                  <p className="text-[11px] text-gray-600">
                    Kiểm tra độ tươi của rau củ tại chỗ trước khi thanh toán cho
                    shipper.
                  </p>
                </label>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Cart Summary & Place Order */}
        <div className="space-y-6 lg:col-span-5">
          <Card className="sticky top-[130px] border-border-subtle bg-white shadow-sm">
            <CardHeader className="border-b border-border-subtle pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base font-extrabold text-gray-900">
                  <ShoppingBag className="size-5 text-brand-forest" />
                  Đơn hàng của bạn ({items.length})
                </CardTitle>
                {items.length === 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={handleAddSampleItems}
                    className="border-brand-forest text-[11px] text-brand-forest"
                  >
                    + Nạp hàng mẫu test
                  </Button>
                ) : null}
              </div>
            </CardHeader>

            <CardContent className="space-y-4 p-4 text-xs">
              {items.length === 0 ? (
                <div className="space-y-2 py-8 text-center">
                  <ShoppingBag className="mx-auto size-10 text-gray-300" />
                  <p className="font-semibold text-gray-600">
                    Giỏ hàng của bạn đang trống
                  </p>
                  <p className="text-[11px] text-gray-400">
                    Hãy bấm &ldquo;+ Nạp hàng mẫu test&rdquo; ở góc trên để thử
                    nghiệm quy trình thanh toán.
                  </p>
                </div>
              ) : (
                <div className="max-h-[260px] space-y-2.5 overflow-y-auto pr-1">
                  {items.map((item) => (
                    <div
                      key={item.productId}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface-warm p-2.5"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-100 text-brand-forest">
                          <Leaf className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-bold text-gray-900">
                            {item.name}
                          </p>
                          <p className="text-[11px] text-gray-500">
                            {formatVnd(item.unitPriceVnd)} × {item.quantity}{" "}
                            {item.unitLabel}
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 font-extrabold text-gray-900">
                        {formatVnd(item.unitPriceVnd * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Price Calculation Breakdown */}
              <div className="space-y-2 border-t border-border-subtle pt-3 text-xs">
                <div className="flex justify-between text-gray-600">
                  <span>Tạm tính tiền hàng:</span>
                  <span className="font-semibold text-gray-900">
                    {formatVnd(subtotalVnd)}
                  </span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Phí giao hỏa tốc ({quote.roadDistanceKm} km):</span>
                  <span className="font-semibold text-gray-900">
                    {formatVnd(shippingFeeVnd)}
                  </span>
                </div>
                {loyaltyDiscountVnd > 0 ? (
                  <div className="flex justify-between font-semibold text-status-fresh">
                    <span>Cấn trừ điểm thưởng:</span>
                    <span>- {formatVnd(loyaltyDiscountVnd)}</span>
                  </div>
                ) : null}
                <div className="flex items-baseline justify-between border-t border-border-subtle pt-2 text-sm font-extrabold">
                  <span className="text-gray-900">Tổng thanh toán:</span>
                  <span className="text-xl text-brand-forest">
                    {formatVnd(finalTotalVnd)}
                  </span>
                </div>
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={items.length === 0 || !quote.isDeliverable}
                  className="h-12 w-full cursor-pointer rounded-xl bg-brand-forest text-sm font-extrabold text-white shadow-md hover:bg-brand-dark"
                >
                  {paymentMethod === PaymentMethod.PAYOS
                    ? "QUÉT MÃ VIETQR PAYOS NGAY"
                    : "XÁC NHẬN ĐẶT HÀNG (COD)"}
                </Button>
              </div>

              {!quote.isDeliverable ? (
                <p className="text-center text-[11px] font-semibold text-red-600">
                  Địa chỉ hiện nằm ngoài bán kính giao tươi 25km. Vui lòng chọn
                  quận/huyện gần hơn.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </form>

      {/* PayOS VietQR Payment Modal with 15-minute countdown */}
      <Dialog open={payOsDialogOpen} onOpenChange={setPayOsDialogOpen}>
        <DialogContent className="bg-white sm:max-w-md">
          <DialogHeader className="text-center">
            <DialogTitle className="flex items-center justify-center gap-2 text-lg font-extrabold text-brand-dark">
              <QrCode className="size-5 text-brand-forest" />
              Thanh toán VietQR PayOS
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-600">
              Quét mã QR bằng ứng dụng ngân hàng bất kỳ để xác nhận thanh toán
              tức thì.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-xs">
            {/* 15-Minute Countdown Timer */}
            <div className="flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-red-700">
              <Clock className="size-4 animate-pulse text-red-600" />
              <span className="font-bold">Đồng hồ đếm ngược giao dịch:</span>
              <strong className="font-mono text-base font-extrabold tracking-wider">
                {formatTimer(timeLeft)}
              </strong>
            </div>

            {/* QR Mockup Box */}
            <div className="mx-auto flex max-w-[280px] flex-col items-center justify-center rounded-2xl border-2 border-brand-forest bg-surface-warm p-4 shadow-inner">
              <div className="relative flex size-48 items-center justify-center rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
                {/* Visual Styled QR Pattern */}
                <div className="grid size-full grid-cols-6 grid-rows-6 gap-1.5 opacity-85">
                  {Array.from({ length: 36 }).map((_, idx) => (
                    <div
                      key={idx}
                      className={`rounded-sm ${
                        [
                          0, 1, 4, 5, 6, 11, 24, 29, 30, 31, 34, 35, 14, 15, 20,
                          21,
                        ].includes(idx)
                          ? "bg-brand-dark"
                          : idx % 3 === 0
                            ? "bg-brand-forest"
                            : "bg-gray-200"
                      }`}
                    />
                  ))}
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex items-center gap-1 rounded-lg border border-gray-100 bg-white p-1.5 shadow-md">
                    <Leaf className="size-4 text-brand-forest" />
                    <span className="text-[10px] font-extrabold text-brand-forest">
                      PayOS
                    </span>
                  </div>
                </div>
              </div>

              <span className="mt-2 text-[11px] font-extrabold text-gray-800">
                Chuyển đúng số tiền:{" "}
                <span className="text-brand-forest">
                  {formatVnd(finalTotalVnd)}
                </span>
              </span>
            </div>

            {/* Bank Transfer Details */}
            <div className="space-y-1.5 rounded-xl border border-border-subtle bg-gray-50 p-3 text-gray-700">
              <div className="flex justify-between">
                <span className="text-gray-500">Ngân hàng:</span>
                <span className="font-bold text-gray-900">
                  MB Bank (Quân Đội)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Số tài khoản:</span>
                <button
                  type="button"
                  onClick={handleCopyAccount}
                  className="flex items-center gap-1 font-mono font-bold text-brand-dark hover:underline"
                >
                  0399888999
                  {copiedAccount ? (
                    <Check className="size-3 text-status-fresh" />
                  ) : (
                    <Copy className="size-3 text-gray-400" />
                  )}
                </button>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Chủ tài khoản:</span>
                <span className="font-bold text-gray-900">
                  CONG TY GREENROOTS FARM
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Nội dung CK:</span>
                <span className="font-mono font-bold text-brand-forest">
                  GRPAY {phoneNumber}
                </span>
              </div>
            </div>

            {/* Simulated Action for Demo Testing */}
            <div className="space-y-2 pt-1">
              <Button
                type="button"
                onClick={() => finalizeOrder(PaymentMethod.PAYOS, true)}
                className="h-11 w-full cursor-pointer rounded-xl bg-brand-forest font-bold text-white hover:bg-brand-dark"
              >
                <CheckCircle2 className="mr-1.5 size-4" />
                Mô phỏng thanh toán VietQR thành công
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPayOsDialogOpen(false)}
                className="h-9 w-full text-xs font-semibold"
              >
                Hủy &amp; quay lại chọn phương thức khác
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
