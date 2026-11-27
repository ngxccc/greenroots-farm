import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@greenroots/ui";
import { AlertCircle } from "lucide-react";
import { useState, type SyntheticEvent } from "react";
import {
  BATCH_MAX_SHELF_LIFE_DAYS,
  validateBatchIntakeInput,
  type CreateBatchDto,
  type ProductDto,
  type SeasonDto,
} from "../batches.utils";

interface BatchIntakeDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly products: readonly ProductDto[];
  readonly seasons: readonly SeasonDto[];
  readonly isPending: boolean;
  readonly onSubmit: (
    payload: CreateBatchDto,
    idempotencyKey: string,
  ) => Promise<void>;
}

function getTodayDateString(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now);
}

/**
 * Modal dialog for recording a new harvested inventory batch.
 */
export function BatchIntakeDialog({
  open,
  onOpenChange,
  products,
  seasons,
  isPending,
  onSubmit,
}: BatchIntakeDialogProps) {
  const [productId, setProductId] = useState("");
  const [seasonId, setSeasonId] = useState("");
  const [harvestDate, setHarvestDate] = useState(getTodayDateString);
  const [harvestTime, setHarvestTime] = useState("04:00");
  const [shelfLifeDays, setShelfLifeDays] = useState("5");
  const [initialQuantity, setInitialQuantity] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );

  const selectedProduct = products.find((p) => p.id === productId);

  function resetForm(): void {
    setProductId("");
    setSeasonId("");
    setHarvestDate(getTodayDateString());
    setHarvestTime("04:00");
    setShelfLifeDays("5");
    setInitialQuantity("");
    setFormError(null);
    setIdempotencyKey(crypto.randomUUID());
  }

  function handleOpenChange(nextOpen: boolean): void {
    if (!nextOpen) {
      setFormError(null);
    } else {
      setIdempotencyKey(crypto.randomUUID());
    }
    onOpenChange(nextOpen);
  }

  async function handleSubmit(event: SyntheticEvent): Promise<void> {
    event.preventDefault();
    setFormError(null);

    const validation = validateBatchIntakeInput({
      productId,
      seasonId,
      harvestDate,
      harvestTime,
      shelfLifeDays: Number(shelfLifeDays),
      initialQuantity: Number(initialQuantity),
    });

    if (!validation.valid || !validation.payload) {
      setFormError(validation.error ?? "Dữ liệu lô thu hoạch không hợp lệ.");
      return;
    }

    try {
      await onSubmit(validation.payload, idempotencyKey);
      resetForm();
      onOpenChange(false);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Không thể tạo lô thu hoạch mới.",
      );
      setIdempotencyKey(crypto.randomUUID());
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tạo lô thu hoạch mới</DialogTitle>
          <DialogDescription>
            Ghi nhận sản lượng thực tế sau thu hoạch để sinh mã lô và đưa vào
            tồn kho FEFO.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {formError ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" aria-hidden="true" />
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="batch-product-select">Sản phẩm</Label>
            <Select
              value={productId}
              onValueChange={(value) => setProductId(value ?? "")}
            >
              <SelectTrigger id="batch-product-select" className="w-full">
                <SelectValue placeholder="Chọn sản phẩm thu hoạch" />
              </SelectTrigger>
              <SelectContent>
                {products.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name} ({product.unit})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="batch-season-select">Mùa vụ canh tác</Label>
            <Select
              value={seasonId}
              onValueChange={(value) => setSeasonId(value ?? "")}
            >
              <SelectTrigger id="batch-season-select" className="w-full">
                <SelectValue placeholder="Chọn mùa vụ đang canh tác / thu hoạch" />
              </SelectTrigger>
              <SelectContent>
                {seasons.map((season) => (
                  <SelectItem key={season.id} value={season.id}>
                    {season.seasonName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="batch-harvest-date">Ngày thu hoạch</Label>
              <Input
                id="batch-harvest-date"
                type="date"
                value={harvestDate}
                onChange={(event) => setHarvestDate(event.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="batch-harvest-time">Giờ thu hoạch (+07:00)</Label>
              <Input
                id="batch-harvest-time"
                type="time"
                value={harvestTime}
                onChange={(event) => setHarvestTime(event.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="batch-shelf-life">Số ngày bảo quản (HSD)</Label>
              <Input
                id="batch-shelf-life"
                type="number"
                min={1}
                max={BATCH_MAX_SHELF_LIFE_DAYS}
                step={1}
                value={shelfLifeDays}
                onChange={(event) => setShelfLifeDays(event.target.value)}
                className="tabular-nums"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="batch-initial-qty">
                Sản lượng nhập{" "}
                {selectedProduct ? `(${selectedProduct.unit})` : ""}
              </Label>
              <Input
                id="batch-initial-qty"
                type="number"
                min={1}
                step={1}
                placeholder="Ví dụ: 50"
                value={initialQuantity}
                onChange={(event) => setInitialQuantity(event.target.value)}
                className="tabular-nums"
                required
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Đang lưu..." : "Lưu lô & Sinh mã"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
