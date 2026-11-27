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
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@greenroots/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { useState, type SyntheticEvent } from "react";
import {
  CATALOG_QUERY_KEYS,
  createCategory,
  updateCategory,
} from "../catalog-api";
import {
  SLUG_PATTERN,
  slugifyVietnamese,
  type CategoryDto,
} from "../catalog-utils";

interface CategoryFormDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly editingCategory: CategoryDto | null;
  readonly defaultParentId: string | null;
  readonly categories: readonly CategoryDto[];
  readonly onSaved: (message: string) => void;
}

const ROOT_PARENT_VALUE = "__root__";

/**
 * Modal dialog for creating or editing a two-level catalog category.
 */
export function CategoryFormDialog({
  open,
  onOpenChange,
  editingCategory,
  defaultParentId,
  categories,
  onSaved,
}: CategoryFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-surface-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editingCategory ? "Cập nhật danh mục" : "Thêm danh mục mới"}
          </DialogTitle>
          <DialogDescription>
            Hỗ trợ tối đa 2 cấp danh mục (danh mục gốc và danh mục con).
          </DialogDescription>
        </DialogHeader>

        {open ? (
          <CategoryFormBody
            key={editingCategory?.id ?? defaultParentId ?? "new-root"}
            onClose={() => onOpenChange(false)}
            editingCategory={editingCategory}
            defaultParentId={defaultParentId}
            categories={categories}
            onSaved={onSaved}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CategoryFormBody({
  onClose,
  editingCategory,
  defaultParentId,
  categories,
  onSaved,
}: {
  readonly onClose: () => void;
  readonly editingCategory: CategoryDto | null;
  readonly defaultParentId: string | null;
  readonly categories: readonly CategoryDto[];
  readonly onSaved: (message: string) => void;
}) {
  const queryClient = useQueryClient();

  const [name, setName] = useState(editingCategory?.name ?? "");
  const [slug, setSlug] = useState(editingCategory?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(editingCategory));
  const [parentId, setParentId] = useState<string>(
    editingCategory?.parentId ?? defaultParentId ?? ROOT_PARENT_VALUE,
  );
  const [sortOrder, setSortOrder] = useState(
    String(editingCategory?.sortOrder ?? 0),
  );
  const [description, setDescription] = useState(
    editingCategory?.description ?? "",
  );
  const [isActive, setIsActive] = useState(editingCategory?.isActive ?? true);
  const [formError, setFormError] = useState<string | null>(null);

  const hasChildren = Boolean(
    editingCategory &&
    categories.some((cat) => cat.parentId === editingCategory.id),
  );

  // Only root categories can be selected as parents to enforce the 2-level tree limit.
  const availableParents = categories.filter(
    (cat) => !cat.parentId && cat.id !== editingCategory?.id,
  );

  const mutation = useMutation({
    mutationFn: async () => {
      const trimmedName = name.trim();
      const trimmedSlug = slug.trim();
      const parsedSort = Number.parseInt(sortOrder, 10);

      if (!trimmedName) {
        throw new Error("Vui lòng nhập tên danh mục.");
      }
      if (!SLUG_PATTERN.test(trimmedSlug)) {
        throw new Error(
          "Slug chỉ được chứa chữ thường không dấu, số và dấu gạch ngang (ví dụ: rau-an-la).",
        );
      }
      if (!Number.isInteger(parsedSort) || parsedSort < 0) {
        throw new Error("Thứ tự hiển thị phải là số nguyên không âm.");
      }

      const resolvedParentId = parentId === ROOT_PARENT_VALUE ? null : parentId;
      const trimmedDesc = description.trim();

      if (editingCategory) {
        return updateCategory(editingCategory.id, {
          name: trimmedName,
          slug: trimmedSlug,
          description: trimmedDesc ? trimmedDesc : null,
          parentId: resolvedParentId,
          sortOrder: parsedSort,
          isActive,
        });
      }

      return createCategory({
        name: trimmedName,
        slug: trimmedSlug,
        description: trimmedDesc ? trimmedDesc : null,
        parentId: resolvedParentId,
        sortOrder: parsedSort,
        isActive,
      });
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({
        queryKey: CATALOG_QUERY_KEYS.categories,
      });
      onSaved(
        editingCategory
          ? `Đã cập nhật danh mục "${saved.name}".`
          : `Đã tạo danh mục "${saved.name}".`,
      );
      onClose();
    },
    onError: (err) => {
      setFormError(
        err instanceof Error ? err.message : "Không thể lưu danh mục.",
      );
    },
  });

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) {
      setSlug(slugifyVietnamese(value));
    }
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

      <div className="space-y-1.5">
        <Label htmlFor="cat-name">Tên danh mục</Label>
        <Input
          id="cat-name"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="Ví dụ: Rau ăn lá"
          required
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cat-slug">Slug URL</Label>
          <Input
            id="cat-slug"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
            placeholder="rau-an-la"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cat-sort-order">Thứ tự sắp xếp</Label>
          <Input
            id="cat-sort-order"
            type="number"
            min={0}
            step={1}
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="tabular-nums"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cat-parent">Danh mục cha</Label>
        <Select
          value={parentId}
          onValueChange={(value) => value && setParentId(value)}
          disabled={hasChildren}
        >
          <SelectTrigger id="cat-parent" className="w-full">
            <SelectValue placeholder="Chọn danh mục cha">
              {parentId === ROOT_PARENT_VALUE
                ? "Không có (Danh mục gốc — Cấp 1)"
                : availableParents.find((r) => r.id === parentId)?.name}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ROOT_PARENT_VALUE}>
              Không có (Danh mục gốc — Cấp 1)
            </SelectItem>
            {availableParents.map((root) => (
              <SelectItem key={root.id} value={root.id}>
                {root.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasChildren ? (
          <p className="text-xs text-gray-500">
            Danh mục này đang có danh mục con nên không thể chuyển xuống cấp 2.
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cat-description">Mô tả ngắn</Label>
        <Textarea
          id="cat-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Mô tả nhóm sản phẩm..."
        />
      </div>

      <div className="flex items-center gap-2.5">
        <Checkbox
          id="cat-active"
          checked={isActive}
          onCheckedChange={(checked) => setIsActive(Boolean(checked))}
        />
        <Label htmlFor="cat-active" className="cursor-pointer font-medium">
          Đang hoạt động (hiển thị trên cửa hàng)
        </Label>
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={mutation.isPending}
        >
          Hủy
        </Button>
        <Button
          type="submit"
          disabled={mutation.isPending}
          className="bg-brand-forest text-white hover:bg-brand-dark"
        >
          {mutation.isPending
            ? "Đang lưu..."
            : editingCategory
              ? "Lưu thay đổi"
              : "Tạo danh mục"}
        </Button>
      </DialogFooter>
    </form>
  );
}
