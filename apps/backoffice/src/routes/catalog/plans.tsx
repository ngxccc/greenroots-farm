import {
  Alert,
  AlertDescription,
  Button,
  Input,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@greenroots/ui";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  AlertCircle,
  CheckCircle2,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
} from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import {
  getDefaultRouteForRole,
  useAuthStore,
} from "@/features/auth/stores/auth.store";
import { PlanFormDialog } from "@/features/catalog/plans/components/plan-form-dialog";
import { PlanStatusDialog } from "@/features/catalog/plans/components/plan-status-dialog";
import { PlansTable } from "@/features/catalog/plans/components/plans-table";
import {
  fetchAdminSubscriptionPlans,
  SUBSCRIPTION_PLANS_QUERY_KEYS,
} from "@/features/catalog/plans/plans-api";
import {
  evaluatePlanMutationGuard,
  filterSubscriptionPlans,
  type PlanStatusFilter,
  type SubscriptionPlanDto,
} from "@/features/catalog/plans/plans-utils";

const EMPTY_PLANS: SubscriptionPlanDto[] = [];

export const Route = createFileRoute("/catalog/plans")({
  beforeLoad: () => {
    const role = useAuthStore.getState().user?.role;
    if (role && role !== "admin" && role !== "super_admin") {
      // oxlint-disable-next-line typescript/only-throw-error
      throw redirect({ to: getDefaultRouteForRole(role) });
    }
  },
  component: SubscriptionPlansPage,
});

function SubscriptionPlansPage() {
  const currentRole = useAuthStore((state) => state.user?.role);
  const mutationGuard = evaluatePlanMutationGuard(currentRole);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PlanStatusFilter>("all");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlanDto | null>(
    null,
  );
  const [statusTargetPlan, setStatusTargetPlan] =
    useState<SubscriptionPlanDto | null>(null);

  const {
    data: plans = EMPTY_PLANS,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: SUBSCRIPTION_PLANS_QUERY_KEYS.adminList,
    queryFn: fetchAdminSubscriptionPlans,
  });

  const filteredPlans = useMemo(
    () => filterSubscriptionPlans(plans, searchQuery, statusFilter),
    [plans, searchQuery, statusFilter],
  );

  function handleOpenCreate() {
    setEditingPlan(null);
    setFormOpen(true);
  }

  function handleOpenEdit(plan: SubscriptionPlanDto) {
    setEditingPlan(plan);
    setFormOpen(true);
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader
        eyebrow="Sản phẩm & Tài chính"
        title="Gói rau định kỳ"
        description="Cấu hình gói rau theo mùa, giá VNĐ, số buổi giao, định mức trọng lượng và theo dõi số khách hàng đang đăng ký."
        actions={
          mutationGuard.allowed ? (
            <Button
              type="button"
              onClick={handleOpenCreate}
              className="bg-brand-forest text-white hover:bg-brand-dark"
            >
              <Plus className="mr-1.5 size-4" aria-hidden="true" />
              Thêm gói định kỳ
            </Button>
          ) : null
        }
      />

      {!mutationGuard.allowed && mutationGuard.reason ? (
        <Alert>
          <ShieldAlert className="size-4" aria-hidden="true" />
          <AlertDescription>{mutationGuard.reason}</AlertDescription>
        </Alert>
      ) : null}

      {statusMessage ? (
        <Alert variant="success">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          <AlertDescription>{statusMessage}</AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden="true" />
          <AlertDescription>
            {error instanceof Error
              ? error.message
              : "Không thể tải danh sách gói định kỳ."}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={statusFilter}
          onValueChange={(value: unknown) => {
            if (value === "all" || value === "active" || value === "inactive") {
              setStatusFilter(value);
            }
          }}
        >
          <TabsList variant="line" className="h-auto gap-4 p-0">
            <TabsTrigger value="all" className="px-2 py-1.5 text-sm">
              Tất cả ({plans.length})
            </TabsTrigger>
            <TabsTrigger value="active" className="px-2 py-1.5 text-sm">
              Đang mở ({plans.filter((p) => p.isActive).length})
            </TabsTrigger>
            <TabsTrigger value="inactive" className="px-2 py-1.5 text-sm">
              Ngừng bán ({plans.filter((p) => !p.isActive).length})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400"
              aria-hidden="true"
            />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Tìm tên gói hoặc slug..."
              className="pl-9"
              aria-label="Tìm kiếm gói định kỳ"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isFetching}
            aria-label="Làm mới danh sách"
          >
            <RefreshCw
              className={`size-4 ${isFetching ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
          </Button>
        </div>
      </div>

      <PlansTable
        plans={filteredPlans}
        isLoading={isLoading}
        canMutate={mutationGuard.allowed}
        onEdit={handleOpenEdit}
        onToggleStatus={setStatusTargetPlan}
      />

      <PlanFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editingPlan={editingPlan}
        onSaved={setStatusMessage}
      />

      <PlanStatusDialog
        plan={statusTargetPlan}
        onOpenChange={(open) => {
          if (!open) {
            setStatusTargetPlan(null);
          }
        }}
        onCompleted={setStatusMessage}
      />
    </div>
  );
}
