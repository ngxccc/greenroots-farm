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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@greenroots/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ImagePlus, Loader2, X } from "lucide-react";
import { useRef, useState, type ChangeEvent, type SyntheticEvent } from "react";
import { uploadSignedMedia } from "@/lib/cloudinary-upload";
import {
  CATALOG_QUERY_KEYS,
  createProduct,
  updateProduct,
} from "../catalog-api";
import {
  buildCategoryTree,
  MAX_PRODUCT_IMAGES,
  SLUG_PATTERN,
  slugifyVietnamese,
  validateProductImages,
  validateProductPrices,
  type CategoryDto,
  type ProductDto,
} from "../catalog-utils";

interface ProductFormDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly editingProduct: ProductDto | null;
  readonly categories: readonly CategoryDto[];
  readonly onSaved: (message: string) => void;
}

/**
 * Modal dialog for creating or editing a catalog product with Cloudinary image upload.
 */
export function ProductFormDialog({
  open,
  onOpenChange,
  editingProduct,
  categories,
  onSaved,
}: ProductFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-surface-card sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editingProduct ? "Cập nhật sản phẩm" : "Thêm sản phẩm mới"}
          </DialogTitle>
          <DialogDescription>
            Điền đầy đủ thông tin sản phẩm, giá VNĐ, hướng dẫn bảo quản và tối
            đa {MAX_PRODUCT_IMAGES} hình ảnh.
          </DialogDescription>
        </DialogHeader>

        {open ? (
          <ProductFormBody
            key={editingProduct?.id ?? "new-product"}
            onClose={() => onOpenChange(false)}
            editingProduct={editingProduct}
            categories={categories}
            onSaved={onSaved}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ProductFormBody({
  onClose,
  editingProduct,
  categories,
  onSaved,
}: {
  readonly onClose: () => void;
  readonly editingProduct: ProductDto | null;
  readonly categories: readonly CategoryDto[];
  readonly onSaved: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const categoryTree = buildCategoryTree(categories);
  const defaultCategoryId =
    categoryTree[0]?.children[0]?.id ?? categoryTree[0]?.category.id ?? "";

  const [categoryId, setCategoryId] = useState(
    editingProduct?.categoryId ?? defaultCategoryId,
  );
  const [name, setName] = useState(editingProduct?.name ?? "");
  const [slug, setSlug] = useState(editingProduct?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(editingProduct));
  const [unit, setUnit] = useState(editingProduct?.unit ?? "500g");
  const [basePriceVnd, setBasePriceVnd] = useState(
    editingProduct ? String(editingProduct.basePriceVnd) : "",
  );
  const [salePriceVnd, setSalePriceVnd] = useState(
    editingProduct && editingProduct.salePriceVnd !== null
      ? String(editingProduct.salePriceVnd)
      : "",
  );
  const [description, setDescription] = useState(
    editingProduct?.description ?? "",
  );
  const [storageInstructions, setStorageInstructions] = useState(
    editingProduct?.storageInstructions ?? "",
  );
  const [imageUrls, setImageUrls] = useState<string[]>(
    editingProduct?.imageUrls ?? [],
  );
  const [isActive, setIsActive] = useState(editingProduct?.isActive ?? true);
  const [isVietGap, setIsVietGap] = useState(
    editingProduct?.isVietGap ?? false,
  );
  const [isUsda, setIsUsda] = useState(editingProduct?.isUsda ?? false);
  const [isSubscriptionEligible, setIsSubscriptionEligible] = useState(
    editingProduct?.isSubscriptionEligible ?? true,
  );
  const [isUploading, setIsUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const trimmedName = name.trim();
      const trimmedSlug = slug.trim();
      const trimmedUnit = unit.trim();

      if (!categoryId) {
        throw new Error("Vui lòng chọn danh mục cho sản phẩm.");
      }
      if (!trimmedName) {
        throw new Error("Vui lòng nhập tên sản phẩm.");
      }
      if (!SLUG_PATTERN.test(trimmedSlug)) {
        throw new Error(
          "Slug chỉ được chứa chữ thường không dấu, số và dấu gạch ngang.",
        );
      }

      const parsedBasePrice = Number(basePriceVnd);
      const trimmedSale = salePriceVnd.trim();
      const parsedSalePrice = trimmedSale === "" ? null : Number(trimmedSale);

      const priceError = validateProductPrices(
        parsedBasePrice,
        parsedSalePrice,
      );
      if (priceError) {
        throw new Error(priceError);
      }

      const imageError = validateProductImages(imageUrls);
      if (imageError) {
        throw new Error(imageError);
      }

      const trimmedDesc = description.trim();
      const trimmedStorage = storageInstructions.trim();

      const payload = {
        categoryId,
        name: trimmedName,
        slug: trimmedSlug,
        unit: trimmedUnit || undefined,
        basePriceVnd: parsedBasePrice,
        salePriceVnd: parsedSalePrice,
        description: trimmedDesc ? trimmedDesc : null,
        storageInstructions: trimmedStorage ? trimmedStorage : null,
        imageUrls,
        isActive,
        isVietGap,
        isUsda,
        isSubscriptionEligible,
      };

      if (editingProduct) {
        return updateProduct(editingProduct.id, payload);
      }
      return createProduct(payload);
    },
    onSuccess: async (saved) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "products"] }),
        queryClient.invalidateQueries({
          queryKey: CATALOG_QUERY_KEYS.allProductsForCounts,
        }),
      ]);
      onSaved(
        editingProduct
          ? `Đã cập nhật sản phẩm "${saved.name}".`
          : `Đã thêm sản phẩm "${saved.name}".`,
      );
      onClose();
    },
    onError: (err) => {
      setFormError(
        err instanceof Error ? err.message : "Không thể lưu sản phẩm.",
      );
    },
  });

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) {
      setSlug(slugifyVietnamese(value));
    }
  }

  async function handleImageFilesSelected(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    const remainingSlots = MAX_PRODUCT_IMAGES - imageUrls.length;
    if (remainingSlots <= 0) {
      setFormError(
        `Mỗi sản phẩm chỉ được tải lên tối đa ${MAX_PRODUCT_IMAGES} hình ảnh.`,
      );
      return;
    }

    const filesToUpload = files.slice(0, remainingSlots);
    if (files.length > remainingSlots) {
      setFormError(
        `Chỉ tải lên ${remainingSlots} ảnh đầu tiên (tối đa ${MAX_PRODUCT_IMAGES} ảnh/sản phẩm).`,
      );
    } else {
      setFormError(null);
    }

    setIsUploading(true);
    try {
      const uploadedUrls: string[] = [];
      for (const file of filesToUpload) {
        const result = await uploadSignedMedia(file, "products", "image");
        uploadedUrls.push(result.secureUrl);
      }
      setImageUrls((prev) =>
        [...prev, ...uploadedUrls].slice(0, MAX_PRODUCT_IMAGES),
      );
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Không thể tải ảnh lên.",
      );
    } finally {
      setIsUploading(false);
    }
  }

  function handleRemoveImage(index: number) {
    setImageUrls((prev) => prev.filter((_, idx) => idx !== index));
  }

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    mutation.mutate();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {formError ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden="true" />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="prod-name">Tên sản phẩm</Label>
          <Input
            id="prod-name"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Ví dụ: Cà chua bi hữu cơ"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="prod-slug">Slug URL</Label>
          <Input
            id="prod-slug"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
            placeholder="ca-chua-bi-huu-co"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="prod-category">Danh mục (2 cấp)</Label>
          <Select
            value={categoryId}
            onValueChange={(value) => value && setCategoryId(value)}
          >
            <SelectTrigger id="prod-category" className="w-full">
              <SelectValue placeholder="Chọn danh mục" />
            </SelectTrigger>
            <SelectContent>
              {categoryTree.map(({ category, children }) => (
                <SelectGroup key={category.id}>
                  <SelectLabel>{category.name}</SelectLabel>
                  <SelectItem value={category.id}>
                    {category.name} (Danh mục gốc)
                  </SelectItem>
                  {children.map((child) => (
                    <SelectItem key={child.id} value={child.id}>
                      {category.name} &gt; {child.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="prod-unit">Đơn vị đóng gói</Label>
          <Input
            id="prod-unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="500g, 250g, bó 300g..."
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="prod-base-price">Giá gốc (VNĐ)</Label>
          <Input
            id="prod-base-price"
            type="number"
            min={1}
            step={100}
            value={basePriceVnd}
            onChange={(e) => setBasePriceVnd(e.target.value)}
            placeholder="65000"
            className="tabular-nums"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="prod-sale-price">
            Giá khuyến mãi (VNĐ, tùy chọn)
          </Label>
          <Input
            id="prod-sale-price"
            type="number"
            min={1}
            step={100}
            value={salePriceVnd}
            onChange={(e) => setSalePriceVnd(e.target.value)}
            placeholder="Nhỏ hơn giá gốc"
            className="tabular-nums"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="prod-description">Mô tả sản phẩm</Label>
        <Textarea
          id="prod-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Đặc điểm canh tác, hương vị, nguồn gốc..."
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="prod-storage">Hướng dẫn bảo quản</Label>
        <Textarea
          id="prod-storage"
          value={storageInstructions}
          onChange={(e) => setStorageInstructions(e.target.value)}
          rows={2}
          placeholder="Ví dụ: Bảo quản ngăn mát tủ lạnh 4–6°C, dùng trong 3 ngày."
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>
            Hình ảnh sản phẩm ({imageUrls.length}/{MAX_PRODUCT_IMAGES})
          </Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isUploading || imageUrls.length >= MAX_PRODUCT_IMAGES}
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploading ? (
              <Loader2
                className="mr-1.5 size-4 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <ImagePlus className="mr-1.5 size-4" aria-hidden="true" />
            )}
            {isUploading ? "Đang tải lên..." : "Tải ảnh lên"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={handleImageFilesSelected}
            className="sr-only"
            aria-label="Chọn hình ảnh sản phẩm"
          />
        </div>

        {imageUrls.length > 0 ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {imageUrls.map((url, idx) => (
              <div
                key={`${url}-${idx}`}
                className="relative aspect-square overflow-hidden rounded-lg border border-border-subtle bg-surface-warm"
              >
                <img
                  src={url}
                  alt={`Ảnh sản phẩm ${idx + 1}`}
                  className="size-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveImage(idx)}
                  aria-label={`Xóa ảnh ${idx + 1}`}
                  className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-gray-900/75 text-white hover:bg-gray-900"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-500">
            Chưa có hình ảnh. Hỗ trợ JPEG, PNG, WebP tối đa 5MB/ảnh.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 border-t border-border-subtle pt-3 sm:grid-cols-2">
        <div className="flex items-center gap-2.5">
          <Checkbox
            id="prod-active"
            checked={isActive}
            onCheckedChange={(checked) => setIsActive(Boolean(checked))}
          />
          <Label htmlFor="prod-active" className="cursor-pointer font-medium">
            Đang bán (hiển thị trên cửa hàng)
          </Label>
        </div>

        <div className="flex items-center gap-2.5">
          <Checkbox
            id="prod-sub-eligible"
            checked={isSubscriptionEligible}
            onCheckedChange={(checked) =>
              setIsSubscriptionEligible(Boolean(checked))
            }
          />
          <Label
            htmlFor="prod-sub-eligible"
            className="cursor-pointer font-medium"
          >
            Áp dụng cho gói rau định kỳ
          </Label>
        </div>

        <div className="flex items-center gap-2.5">
          <Checkbox
            id="prod-vietgap"
            checked={isVietGap}
            onCheckedChange={(checked) => setIsVietGap(Boolean(checked))}
          />
          <Label htmlFor="prod-vietgap" className="cursor-pointer font-medium">
            Chứng nhận VietGAP
          </Label>
        </div>

        <div className="flex items-center gap-2.5">
          <Checkbox
            id="prod-usda"
            checked={isUsda}
            onCheckedChange={(checked) => setIsUsda(Boolean(checked))}
          />
          <Label htmlFor="prod-usda" className="cursor-pointer font-medium">
            Chứng nhận USDA Organic
          </Label>
        </div>
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={mutation.isPending || isUploading}
        >
          Hủy
        </Button>
        <Button
          type="submit"
          disabled={mutation.isPending || isUploading}
          className="bg-brand-forest text-white hover:bg-brand-dark"
        >
          {mutation.isPending
            ? "Đang lưu..."
            : editingProduct
              ? "Lưu thay đổi"
              : "Tạo sản phẩm"}
        </Button>
      </DialogFooter>
    </form>
  );
}
