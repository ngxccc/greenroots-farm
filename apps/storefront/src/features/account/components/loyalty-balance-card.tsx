import { Card, CardContent } from "@greenroots/ui";
import { Coins } from "lucide-react";
import { formatVnd } from "@/lib/format";

interface LoyaltyBalanceCardProps {
  readonly rewardPoints: number;
}

/**
 * Displays the customer's live GreenRoots loyalty points balance with exact `1 điểm = 1đ`
 * VND equivalence (`ADR-0031`, `INV-SF-PROFILE-4`).
 *
 * @param props Customer `rewardPoints` integer balance.
 * @returns Branded loyalty summary card rendered inside `/account/profile`.
 */
export function LoyaltyBalanceCard({ rewardPoints }: LoyaltyBalanceCardProps) {
  const safePoints = Math.max(0, Math.trunc(rewardPoints));

  return (
    <Card
      aria-label="Số dư điểm tích lũy"
      className="border-0 bg-brand-forest py-0 text-white shadow-sm ring-0"
    >
      <CardContent className="flex flex-col justify-between gap-3.5 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-6">
        <div className="flex items-center gap-3 sm:gap-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-dark text-white sm:size-12">
            <Coins className="size-5 sm:size-6" aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-0.5 sm:gap-1">
            <span className="text-xs font-semibold text-white/90">
              Điểm tích lũy GreenRoots
            </span>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-xl font-extrabold tracking-tight tabular-nums sm:text-2xl md:text-3xl">
                {safePoints.toLocaleString("vi-VN")} điểm
              </span>
              <span className="text-xs font-medium text-white/90 tabular-nums sm:text-sm">
                (Tương đương {formatVnd(safePoints)} — 1 điểm = 1đ)
              </span>
            </div>
          </div>
        </div>

        <p className="max-w-xs text-xs leading-relaxed text-white/85 sm:text-right">
          Tích lũy 1% trên mỗi đơn hàng giao thành công và dùng trừ trực tiếp
          vào tiền hàng khi thanh toán.
        </p>
      </CardContent>
    </Card>
  );
}
