import { Tabs, TabsContent, TabsList, TabsTrigger } from "@greenroots/ui";
import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { useAuthStore } from "@/features/auth/stores/auth.store";
import { canViewSuperAdminCashflow } from "../finance.utils";
import { PaymentsLedgerTab } from "./payments-ledger-tab";
import { SuperAdminCashflowTab } from "./superadmin-cashflow-tab";

type FinanceTabValue = "ledger" | "cashflow";

/**
 * Root view for `/finance/payments`, rendering the staff payment ledger for
 * `sales`, `admin`, and `super_admin`, and exposing the cashflow analytics tab
 * exclusively to `super_admin`.
 */
export function PaymentsCashflowView() {
  const userRole = useAuthStore((state) => state.user?.role);
  const showSuperAdminCashflow = canViewSuperAdminCashflow(userRole);
  const [activeTab, setActiveTab] = useState<FinanceTabValue>("ledger");

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader
        eyebrow="Sản phẩm & Tài chính"
        title="Đối soát thanh toán"
        description="Sổ cái thanh toán tổng hợp đối soát mã giao dịch PayOS, xác nhận thu hộ COD và theo dõi dòng tiền."
      />

      {showSuperAdminCashflow ? (
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as FinanceTabValue)}
          className="flex flex-col gap-4"
        >
          <TabsList variant="line">
            <TabsTrigger value="ledger">Sổ cái &amp; Đối soát COD</TabsTrigger>
            <TabsTrigger value="cashflow">Dòng tiền (SuperAdmin)</TabsTrigger>
          </TabsList>

          <TabsContent value="ledger" className="mt-0">
            <PaymentsLedgerTab />
          </TabsContent>

          <TabsContent value="cashflow" className="mt-0">
            <SuperAdminCashflowTab />
          </TabsContent>
        </Tabs>
      ) : (
        <PaymentsLedgerTab />
      )}
    </div>
  );
}
