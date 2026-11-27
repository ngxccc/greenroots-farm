import {
  Alert,
  AlertDescription,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from "@greenroots/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2 } from "lucide-react";
import { useState, type SyntheticEvent } from "react";
import { useAuthStore } from "@/features/auth/stores/auth.store";
import { slugifyVietnamese } from "@/features/catalog/catalog-utils";
import {
  createSubscriptionPlan,
  SUBSCRIPTION_PLANS_QUERY_KEYS,
  updateSubscriptionPlan,
} from "../plans-api";
import {
  buildCreatePlanPayload,
  buildUpdatePlanPayload,
  evaluatePlanMutationGuard,
  MAX_PLAN_WEIGHT_KG,
  MIN_PLAN_WEIGHT_KG,
  type PlanFormValues,
  type SubscriptionPlanDto,
  validatePlanForm,
} from "../plans-utils";

interface PlanFormDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly editingPlan: SubscriptionPlanDto | null;
  readonly onSaved: (message: string) => void;
}

/**
 * Modal dialog for creating or editing a seasonal subscription plan.
 */
export function PlanFormDialog({
  open,
  onOpenChange,
  editingPlan,
  onSaved,
}: PlanFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-surface-card sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editingPlan ? "Chỉnh sửa gói định kỳ" : "Thêm gói định kỳ mới"}
          </DialogTitle>
          <DialogDescription>
            Cấu hình thông tin gói rau, giá VNĐ nguyên, số buổi giao và định mức
            trọng lượng mỗi buổi.
          </DialogDescription>
        </DialogHeader>

        {open ? (
          <PlanFormBody
            key={editingPlan?.id ?? "new-plan"}
            editingPlan={editingPlan}
            onClose={() => onOpenChange(false)}
            onSaved={onSaved}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PlanFormBody({
  editingPlan,
  onClose,
  onSaved,
}: {
  readonly editingPlan: SubscriptionPlanDto | null;
  readonly onClose: () => void;
  readonly onSaved: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const currentRole = useAuthStore((state) => state.user?.role);
  const mutationGuard = evaluatePlanMutationGuard(currentRole);

  const [name, setName] = useState(editingPlan?.name ?? "");
  const [slug, setSlug] = useState(editingPlan?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(editingPlan));
  const [priceVnd, setPriceVnd] = useState(
    editingPlan ? String(editingPlan.priceVnd) : "",
  );
  const [totalDeliveries, setTotalDeliveries] = useState(
    editingPlan ? String(editingPlan.totalDeliveries) : "",
  );
  const [weightPerDeliveryKg, setWeightPerDeliveryKg] = useState(
    editingPlan ? String(editingPlan.weightPerDeliveryKg) : "",
  );
  const [basketDescription, setBasketDescription] = useState(
    editingPlan?.basketDescription ?? "",
  );
  const [description, setDescription] = useState(
    editingPlan?.description ?? "",
  );
  const [isActive, setIsActive] = useState(editingPlan?.isActive ?? true);
  const [formError, setFormError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (values: PlanFormValues) => {
      if (editingPlan) {
        const patch = buildUpdatePlanPayload(values, editingPlan);
        if (!patch) {
          return editingPlan;
        }
        return updateSubscriptionPlan(editingPlan.id, patch);
      }
      return createSubscriptionPlan(buildCreatePlanPayload(values));
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({
        queryKey: SUBSCRIPTION_PLANS_QUERY_KEYS.adminList,
      });
      onSaved(
        editingPlan
          ? `Đã cập nhật gói "${saved.name}".`
          : `Đã tạo gói định kỳ "${saved.name}".`,
      );
      onClose();
    },
    onError: (err) => {
      setFormError(
        err instanceof Error
          ? err.message
          : "Không thể lưu thông tin gói định kỳ.",
      );
    },
  });

  function handleNameChange(nextName: string) {
    setName(nextName);
    if (!editingPlan && !slugTouched) {
      setSlug(slugifyVietnamese(nextName));
    }
  }

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!mutationGuard.allowed) {
      setFormError(mutationGuard.reason);
      return;
    }

    const values: PlanFormValues = {
      name,
      slug,
      description,
      priceVnd,
      totalDeliveries,
      weightPerDeliveryKg,
      basketDescription,
      isActive,
    };

    const validationError = validatePlanForm(values);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    if (editingPlan && !buildUpdatePlanPayload(values, editingPlan)) {
      onClose();
      return;
    }

    saveMutation.mutate(values);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {formError ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden="true" />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="plan-name">
            Tên gói định kỳ <span className="text-destructive">*</span>
          </Label>
          <Input
            id="plan-name"
            value={name}
            onChange={(event) => handleNameChange(event.target.value)}
            placeholder="VD: Gói Gia Đình 4 Tuần"
            disabled={saveMutation.isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="plan-slug">
            Slug đường dẫn{" "}
            <span className="text-xs font-normal text-gray-500">
              (tự tạo nếu để trống)
            </span>
          </Label>
          <Input
            id="plan-slug"
            value={slug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(event.target.value);
            }}
            placeholder="goi-gia-dinh-4-tuan"
            disabled={saveMutation.isPending}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="plan-price-vnd">
            Giá gói (VNĐ) <span className="text-destructive">*</span>
          </Label>
          <Input
            id="plan-price-vnd"
            type="number"
            step={1}
            min={1}
            value={priceVnd}
            onChange={(event) => setPriceVnd(event.target.value)}
            placeholder="890000"
            className="tabular-nums"
            disabled={saveMutation.isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="plan-total-deliveries">
            Số buổi giao <span className="text-destructive">*</span>
          </Label>
          <Input
            id="plan-total-deliveries"
            type="number"
            step={1}
            min={1}
            value={totalDeliveries}
            onChange={(event) => setTotalDeliveries(event.target.value)}
            placeholder="8"
            className="tabular-nums"
            disabled={saveMutation.isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="plan-weight-kg">
            Định mức / buổi (kg) <span className="text-destructive">*</span>
          </Label>
          <Input
            id="plan-weight-kg"
            type="number"
            step={0.01}
            min={MIN_PLAN_WEIGHT_KG}
            max={MAX_PLAN_WEIGHT_KG}
            value={weightPerDeliveryKg}
            onChange={(event) => setWeightPerDeliveryKg(event.target.value)}
            placeholder="3.5"
            className="tabular-nums"
            disabled={saveMutation.isPending}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="plan-basket-description">
          Thành phần rổ rau mỗi buổi <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="plan-basket-description"
          rows={3}
          value={basketDescription}
          onChange={(event) => setBasketDescription(event.target.value)}
          placeholder="VD: 3 loại rau ăn lá theo mùa, 2 loại củ quả, 1 bó rau gia vị tươi..."
          disabled={saveMutation.isPending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="plan-description">
          Mô tả chi tiết gói <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="plan-description"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Mô tả lịch giao cố định thứ 3 / thứ 6, đối tượng phù hợp và cam kết thu hoạch..."
          disabled={saveMutation.isPending}
        />
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Checkbox
          id="plan-is-active"
          checked={isActive}
          onCheckedChange={(checked) => setIsActive(Boolean(checked))}
          disabled={saveMutation.isPending}
        />
        <Label htmlFor="plan-is-active" className="cursor-pointer font-normal">
          Đang mở bán công khai trên trang khách hàng
        </Label>
      </div>

      <DialogFooter className="pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={saveMutation.isPending}
        >
          Hủy
        </Button>
        <Button
          type="submit"
          disabled={saveMutation.isPending}
          className="bg-brand-forest text-white hover:bg-brand-dark"
        >
          {saveMutation.isPending ? (
            <>
              <Loader2
                className="mr-2 size-4 animate-spin"
                aria-hidden="true"
              />
              Đang lưu...
            </>
          ) : editingPlan ? (
            "Lưu thay đổi"
          ) : (
            "Tạo gói định kỳ"
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}
