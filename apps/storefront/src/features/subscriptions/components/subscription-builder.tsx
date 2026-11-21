"use client";

import { useState } from "react";
import {
  BUSINESS_RULES,
  DeliveryDay,
  DELIVERY_DAY_LABELS,
} from "@greenroots/shared";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@greenroots/ui";
import {
  ArrowRight,
  Ban,
  Check,
  Heart,
  Package,
  ShieldCheck,
  Sparkles,
  Truck,
} from "lucide-react";
import { formatVnd } from "@/lib/format";
import type { StorefrontSubscriptionPlan } from "@/types/storefront.types";

interface SubscriptionBuilderProps {
  readonly plans: readonly StorefrontSubscriptionPlan[];
}

const FAVORITE_OPTIONS: readonly string[] = [
  "Xà lách Romaine",
  "Cà chua bi Cherry",
  "Cải ngọt baby",
  "Cải bó xôi",
  "Dưa leo baby",
  "Nấm bào ngư",
];

const ALLERGY_OPTIONS: readonly string[] = [
  "Mướp đắng (Khổ qua)",
  "Rau diếp cá",
  "Hành lá",
  "Ớt chuông cay",
];

interface DeliverySession {
  readonly sessionNumber: number;
  readonly weekNumber: number;
  readonly dateLabel: string;
  readonly dayName: string;
}

const INITIAL_SESSIONS: readonly DeliverySession[] = [
  { sessionNumber: 1, weekNumber: 1, dayName: "Thứ 3", dateLabel: "18/11" },
  { sessionNumber: 2, weekNumber: 1, dayName: "Thứ 6", dateLabel: "21/11" },
  { sessionNumber: 3, weekNumber: 2, dayName: "Thứ 3", dateLabel: "25/11" },
  { sessionNumber: 4, weekNumber: 2, dayName: "Thứ 6", dateLabel: "28/11" },
  { sessionNumber: 5, weekNumber: 3, dayName: "Thứ 3", dateLabel: "02/12" },
  { sessionNumber: 6, weekNumber: 3, dayName: "Thứ 6", dateLabel: "05/12" },
  { sessionNumber: 7, weekNumber: 4, dayName: "Thứ 3", dateLabel: "09/12" },
  { sessionNumber: 8, weekNumber: 4, dayName: "Thứ 6", dateLabel: "12/12" },
];

export function SubscriptionBuilder({ plans }: SubscriptionBuilderProps) {
  const defaultPlan = plans[0];
  const [selectedPlanId, setSelectedPlanId] = useState<string>(defaultPlan.id);
  const [selectedDeliveryDay, setSelectedDeliveryDay] = useState<DeliveryDay>(
    DeliveryDay.BOTH,
  );
  const [favorites, setFavorites] = useState<readonly string[]>([
    "Xà lách Romaine",
    "Cà chua bi Cherry",
    "Cải ngọt baby",
  ]);
  const [allergies, setAllergies] = useState<readonly string[]>([
    "Mướp đắng (Khổ qua)",
  ]);
  const [pausedSessions, setPausedSessions] = useState<Record<number, boolean>>(
    {},
  );
  const [payosModalOpen, setPayosModalOpen] = useState(false);

  const activePlan = plans.find((p) => p.id === selectedPlanId) ?? defaultPlan;

  function toggleFavorite(item: string) {
    setFavorites((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item],
    );
  }

  function toggleAllergy(item: string) {
    setAllergies((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item],
    );
  }

  function togglePauseSession(sessionNumber: number) {
    setPausedSessions((prev) => ({
      ...prev,
      [sessionNumber]: !prev[sessionNumber],
    }));
  }

  const deliveryDayDisplay =
    selectedDeliveryDay === DeliveryDay.BOTH
      ? "Thứ 3 & Thứ 6"
      : DELIVERY_DAY_LABELS[selectedDeliveryDay];

  return (
    <div className="space-y-6">
      {/* HERO BANNER */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-800 to-green-950 p-6 text-white shadow-md lg:p-8">
        <div className="relative z-10 flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div className="max-w-2xl space-y-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-700/80 px-3 py-1 text-xs font-bold tracking-wider text-emerald-200 uppercase">
              <Sparkles className="size-3.5" />
              Mô hình CSA Hữu Cơ · Nông Trại Chăm Sóc Bếp Nhà Bạn
            </span>
            <h1 className="text-2xl font-black tracking-tight lg:text-3xl">
              Gói Rau Sạch Gia Đình Giao Định Kỳ Hàng Tuần
            </h1>
            <p className="text-xs leading-relaxed text-green-100 lg:text-sm">
              Rau tươi cắt lúc {BUSINESS_RULES.HARVEST_START_HOUR}h sáng tại Củ
              Chi, giao hỏa tốc đến tận cửa nhà bạn đều đặn mỗi tuần. Hệ thống
              tự động trừ kho theo FEFO và chốt đơn định kỳ!
            </p>
          </div>

          <div className="shrink-0 rounded-2xl border border-white/20 bg-white/10 p-4 text-center font-mono backdrop-blur-md">
            <span className="block text-xs text-green-200 uppercase">
              Miễn phí ship
            </span>
            <b className="text-2xl font-black text-amber-300">
              {activePlan.totalDeliveries} Chuyến / Tháng
            </b>
            <span className="mt-0.5 block text-[10px] text-green-100">
              Bán kính {BUSINESS_RULES.SHIPPING.SUBSCRIPTION_FREE_RADIUS_KM} km
            </span>
          </div>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-12">
        {/* LEFT 8 COLS: FORM STEPS */}
        <div className="space-y-6 lg:col-span-8">
          {/* STEP 1: CHỌN GÓI RAU */}
          <Card className="rounded-3xl border-border-subtle bg-white shadow-sm">
            <CardContent className="space-y-4 p-6">
              <div className="flex items-center justify-between border-b border-border-subtle pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-7 items-center justify-center rounded-full bg-brand-forest font-mono text-xs font-bold text-white">
                    1
                  </span>
                  <h2 className="text-base font-black text-brand-dark">
                    Chọn Quy Mô Giỏ Rau Cho Gia Đình
                  </h2>
                </div>
                <Badge className="border-0 bg-green-100 text-brand-dark">
                  {activePlan.totalDeliveries} Chuyến / Tháng
                </Badge>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {plans.map((plan) => {
                  const isSelected = plan.id === selectedPlanId;
                  return (
                    <div
                      key={plan.id}
                      onClick={() => setSelectedPlanId(plan.id)}
                      className={`relative cursor-pointer space-y-3 rounded-2xl p-4.5 transition ${
                        isSelected
                          ? "border-2 border-brand-forest bg-green-50/50 shadow-sm"
                          : "border border-border-subtle hover:border-brand-forest"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex size-11 items-center justify-center rounded-xl bg-green-100 text-brand-forest">
                          <Package className="size-6" />
                        </div>
                        <div>
                          <b className="block text-sm font-extrabold text-gray-900">
                            {plan.name}
                          </b>
                          <span className="font-mono text-xs font-bold text-brand-forest">
                            {plan.weightPerDeliveryKg} kg rau củ / chuyến
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-gray-600">
                        {plan.description}
                      </p>

                      <div className="flex items-baseline justify-between border-t border-border-subtle pt-2">
                        <div>
                          <span className="font-mono text-xl font-black text-brand-dark">
                            {formatVnd(plan.priceVnd)}
                          </span>
                          <span className="text-[11px] text-gray-400">
                            / tháng
                          </span>
                        </div>
                        <span className="text-[11px] text-gray-500">
                          ~
                          {formatVnd(
                            Math.round(plan.priceVnd / plan.totalDeliveries),
                          )}{" "}
                          / chuyến
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* STEP 2: CHỌN NGÀY GIAO TRONG TUẦN */}
          <Card className="rounded-3xl border-border-subtle bg-white shadow-sm">
            <CardContent className="space-y-4 p-6">
              <div className="flex items-center justify-between border-b border-border-subtle pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-7 items-center justify-center rounded-full bg-brand-forest font-mono text-xs font-bold text-white">
                    2
                  </span>
                  <h2 className="text-base font-black text-brand-dark">
                    Chọn Lịch Giao Hàng Cố Định Trong Tuần
                  </h2>
                </div>
                <span className="text-xs font-bold text-brand-forest">
                  Giao hỏa tốc 07:00 – 09:00 Sáng
                </span>
              </div>

              <div className="grid gap-3 text-xs sm:grid-cols-3">
                <div
                  onClick={() => setSelectedDeliveryDay(DeliveryDay.BOTH)}
                  className={`cursor-pointer space-y-1 rounded-2xl p-4 text-center transition ${
                    selectedDeliveryDay === DeliveryDay.BOTH
                      ? "border-2 border-brand-forest bg-green-50/50 shadow-sm"
                      : "border border-border-subtle hover:border-brand-forest"
                  }`}
                >
                  <b className="block text-sm font-extrabold text-brand-dark">
                    Thứ 3 &amp; Thứ 6
                  </b>
                  <span className="block text-[11px] text-gray-500">
                    2 chuyến / tuần (Khuyên dùng)
                  </span>
                  <span className="mt-1 inline-block rounded-full bg-brand-forest px-2 py-0.5 text-[10px] font-bold text-white">
                    Phổ biến nhất
                  </span>
                </div>

                <div
                  onClick={() => setSelectedDeliveryDay(DeliveryDay.TUESDAY)}
                  className={`cursor-pointer space-y-1 rounded-2xl p-4 text-center transition ${
                    selectedDeliveryDay === DeliveryDay.TUESDAY
                      ? "border-2 border-brand-forest bg-green-50/50 shadow-sm"
                      : "border border-border-subtle hover:border-brand-forest"
                  }`}
                >
                  <b className="block text-sm font-bold text-gray-800">
                    Chỉ Thứ 3
                  </b>
                  <span className="block text-[11px] text-gray-500">
                    Đầu tuần tươi mới
                  </span>
                </div>

                <div
                  onClick={() => setSelectedDeliveryDay(DeliveryDay.FRIDAY)}
                  className={`cursor-pointer space-y-1 rounded-2xl p-4 text-center transition ${
                    selectedDeliveryDay === DeliveryDay.FRIDAY
                      ? "border-2 border-brand-forest bg-green-50/50 shadow-sm"
                      : "border border-border-subtle hover:border-brand-forest"
                  }`}
                >
                  <b className="block text-sm font-bold text-gray-800">
                    Chỉ Thứ 6
                  </b>
                  <span className="block text-[11px] text-gray-500">
                    Nấu ăn nghỉ ngơi cuối tuần
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* STEP 3: KHẨU VỊ & DỊ ỨNG */}
          <Card className="rounded-3xl border-border-subtle bg-white shadow-sm">
            <CardContent className="space-y-4 p-6">
              <div className="border-b border-border-subtle pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-7 items-center justify-center rounded-full bg-brand-forest font-mono text-xs font-bold text-white">
                    3
                  </span>
                  <h2 className="text-base font-black text-brand-dark">
                    Khẩu Vị Gia Đình &amp; Loại Trừ (Hệ Thống Tự Động Né)
                  </h2>
                </div>
                <p className="mt-0.5 text-xs text-gray-500">
                  Thuật toán sinh đơn tự động phân bổ FEFO sẽ loại bỏ món dị ứng
                  và ưu tiên các loại rau gia đình yêu thích.
                </p>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <span className="mb-2 flex items-center gap-1.5 font-bold text-gray-700">
                    <Heart className="size-4 text-red-500" />
                    <span>Món YÊU THÍCH (Ưu tiên giao):</span>
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {FAVORITE_OPTIONS.map((item) => {
                      const active = favorites.includes(item);
                      return (
                        <button
                          key={item}
                          type="button"
                          onClick={() => toggleFavorite(item)}
                          className={`flex items-center gap-1 rounded-xl px-3 py-1.5 font-semibold transition ${
                            active
                              ? "border border-green-300 bg-green-100 text-brand-dark"
                              : "border border-gray-200 bg-surface-warm text-gray-700 hover:border-brand-forest"
                          }`}
                        >
                          {active ? (
                            <Check className="size-3.5 text-brand-forest" />
                          ) : (
                            "+"
                          )}
                          <span>{item}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <span className="mb-2 flex items-center gap-1.5 font-bold text-status-spoiled">
                    <Ban className="size-4 text-status-spoiled" />
                    <span>DỊ ỨNG / KHÔNG ĂN ĐƯỢC (Tuyệt đối né):</span>
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {ALLERGY_OPTIONS.map((item) => {
                      const active = allergies.includes(item);
                      return (
                        <button
                          key={item}
                          type="button"
                          onClick={() => toggleAllergy(item)}
                          className={`flex items-center gap-1 rounded-xl px-3 py-1.5 font-semibold transition ${
                            active
                              ? "border border-red-300 bg-red-100 text-status-spoiled"
                              : "border border-gray-200 bg-surface-warm text-gray-700 hover:border-red-300"
                          }`}
                        >
                          {active ? (
                            <Ban className="size-3.5 text-status-spoiled" />
                          ) : (
                            "+"
                          )}
                          <span>{item}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* STEP 4: INTERACTIVE 4-WEEK ROADMAP */}
          <Card className="rounded-3xl border-border-subtle bg-white shadow-sm">
            <CardContent className="space-y-4 p-6">
              <div className="flex flex-col justify-between gap-2 border-b border-border-subtle pb-3 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-7 items-center justify-center rounded-full bg-brand-forest font-mono text-xs font-bold text-white">
                    4
                  </span>
                  <h2 className="text-base font-black text-brand-dark">
                    Lịch Trình 8 Chuyến Giao (Cho Phép Tạm Dừng Khi Đi Vắng)
                  </h2>
                </div>
                <span className="font-mono text-xs text-gray-500">
                  Chu kỳ 30 ngày tới
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5 text-xs sm:grid-cols-4">
                {INITIAL_SESSIONS.map((session) => {
                  const isPaused = Boolean(
                    pausedSessions[session.sessionNumber],
                  );
                  return (
                    <div
                      key={session.sessionNumber}
                      className={`space-y-1 rounded-2xl p-3 text-center transition ${
                        isPaused
                          ? "border border-amber-300 bg-amber-50/50 opacity-60"
                          : "border border-green-200 bg-green-50/40"
                      }`}
                    >
                      <span className="block font-mono text-[10px] text-gray-400">
                        Chuyến {session.sessionNumber}
                      </span>
                      <b className="block text-xs font-bold text-gray-900">
                        {session.dayName} ({session.dateLabel})
                      </b>
                      {isPaused ? (
                        <button
                          type="button"
                          onClick={() =>
                            togglePauseSession(session.sessionNumber)
                          }
                          className="rounded border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900"
                        >
                          Đã hoãn (Khôi phục)
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            togglePauseSession(session.sessionNumber)
                          }
                          className="rounded border border-blue-200 bg-white px-2 py-0.5 text-[10px] font-bold text-blue-600 hover:text-blue-800"
                        >
                          Tạm dừng kỳ này
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT 4 COLS: ORDER SUMMARY CARD & CHECKOUT */}
        <div className="space-y-4 lg:sticky lg:top-24 lg:col-span-4">
          <Card className="rounded-3xl border-border-subtle bg-white shadow-sm">
            <CardContent className="space-y-4 p-6">
              <h3 className="border-b border-border-subtle pb-3 text-base font-extrabold text-brand-dark">
                Tóm Tắt Hợp Đồng Gói Tháng
              </h3>

              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Gói rau:</span>
                  <b className="font-bold text-gray-900">{activePlan.name}</b>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Định lượng mỗi kỳ:</span>
                  <b className="font-mono font-bold text-brand-forest">
                    {activePlan.weightPerDeliveryKg} kg rau củ
                  </b>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Lịch nhận cố định:</span>
                  <b className="font-bold text-gray-900">
                    {deliveryDayDisplay}
                  </b>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Tần suất giao hàng:</span>
                  <b className="font-mono font-bold">
                    {activePlan.totalDeliveries} chuyến / tháng
                  </b>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Giờ giao hỏa tốc:</span>
                  <b className="font-mono text-brand-dark">
                    07:00 – 09:00 Sáng
                  </b>
                </div>

                <div className="space-y-1 rounded-xl border border-green-200 bg-green-50 p-3">
                  <div className="flex justify-between font-bold text-status-fresh">
                    <span className="flex items-center gap-1">
                      <Truck className="size-3.5" />
                      Phí giao 8 chuyến:
                    </span>
                    <span className="text-[11px] uppercase">Miễn Phí 100%</span>
                  </div>
                  <span className="block text-[10px] leading-tight text-gray-500">
                    Áp dụng tuyến gom cố định trong bán kính{" "}
                    {BUSINESS_RULES.SHIPPING.SUBSCRIPTION_FREE_RADIUS_KM} km từ
                    Farm Củ Chi
                  </span>
                </div>
              </div>

              <div className="space-y-1 border-t border-border-subtle pt-3">
                <div className="flex items-end justify-between">
                  <span className="text-xs font-semibold text-gray-600">
                    Tổng thanh toán trả trước:
                  </span>
                  <span className="font-mono text-2xl font-black text-brand-dark">
                    {formatVnd(activePlan.priceVnd)}
                  </span>
                </div>
                <span className="block text-right text-[11px] font-bold text-status-fresh">
                  Tiết kiệm 20% so với mua lẻ từng ngày
                </span>
              </div>

              <Button
                type="button"
                onClick={() => setPayosModalOpen(true)}
                className="h-12 w-full gap-2 rounded-2xl bg-brand-forest text-sm font-extrabold text-white shadow-md hover:bg-brand-dark"
              >
                <span>Thanh Toán Trả Trước PayOS</span>
                <ArrowRight className="size-4" />
              </Button>

              <div className="space-y-1 rounded-2xl border border-border-subtle bg-surface-warm p-3.5 text-[11px] text-gray-500">
                <p className="flex items-center gap-1 font-bold text-gray-800">
                  <ShieldCheck className="size-3.5 text-brand-forest" />
                  Cam kết Nông trại GreenRoots:
                </p>
                <p>• Tự động sinh đơn lúc 04:00 sáng ngày giao.</p>
                <p>• 100% đổi trả hoặc hoàn tiền nếu rau bị dập.</p>
                <p>• Tạm dừng hoặc hủy gói bất kỳ lúc nào.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* PAYOS VIETQR MODAL PREVIEW */}
      <Dialog open={payosModalOpen} onOpenChange={setPayosModalOpen}>
        <DialogContent className="max-w-sm rounded-3xl p-6 text-center">
          <DialogHeader className="border-b border-gray-100 pb-2 text-center">
            <DialogTitle className="text-sm font-bold text-brand-dark">
              Cổng Thanh Toán PayOS (VietQR)
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              Quét mã QR để thanh toán kích hoạt hợp đồng gói tháng
            </DialogDescription>
          </DialogHeader>

          <div className="mx-auto inline-block rounded-2xl border border-gray-200 bg-surface-warm p-4">
            <div className="flex size-44 flex-wrap gap-1 rounded-xl bg-gray-900 p-2 shadow-inner">
              <div className="size-12 rounded-md border-4 border-gray-900 bg-white" />
              <div className="ml-auto size-12 rounded-md border-4 border-gray-900 bg-white" />
              <div className="h-8 w-full bg-white/20" />
              <div className="size-12 rounded-md border-4 border-gray-900 bg-white" />
              <div className="ml-auto size-12 rounded-md bg-emerald-400" />
            </div>
          </div>

          <div className="space-y-1 text-xs">
            <span className="block text-gray-500">Số tiền thanh toán:</span>
            <b className="font-mono text-xl font-black text-brand-dark">
              {formatVnd(activePlan.priceVnd)}
            </b>
            <p className="text-[11px] text-gray-400">
              Tự động kích hoạt gói Subscription ngay sau khi ngân hàng báo có.
            </p>
          </div>

          <Button
            type="button"
            onClick={() => {
              setPayosModalOpen(false);
              alert(
                "Thanh toán thành công! Gói Subscription của bạn đã được kích hoạt.",
              );
            }}
            className="w-full rounded-xl bg-brand-forest text-xs font-bold text-white hover:bg-brand-dark"
          >
            Xác Nhận Đã Chuyển Khoản
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
