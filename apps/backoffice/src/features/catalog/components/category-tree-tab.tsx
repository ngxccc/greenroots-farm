import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@greenroots/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CornerDownRight,
  FolderPlus,
  Lock,
  Pencil,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { CATALOG_QUERY_KEYS, deleteCategory } from "../catalog-api";
import {
  buildCategoryTree,
  getCategoryDeleteLockState,
  type CategoryDto,
} from "../catalog-utils";

interface CategoryTreeTabProps {
  readonly categories: readonly CategoryDto[];
  readonly isLoading: boolean;
  readonly productCountByCategory: ReadonlyMap<string, number>;
  readonly onCreateChild: (parentId: string) => void;
  readonly onEdit: (category: CategoryDto) => void;
  readonly onDeleted: (message: string) => void;
}

/**
 * Two-level category tree management tab with delete-lock enforcement.
 */
export function CategoryTreeTab({
  categories,
  isLoading,
  productCountByCategory,
  onCreateChild,
  onEdit,
  onDeleted,
}: CategoryTreeTabProps) {
  const queryClient = useQueryClient();
  const [confirmTarget, setConfirmTarget] = useState<CategoryDto | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const tree = buildCategoryTree(categories);

  const deleteMutation = useMutation({
    mutationFn: (categoryId: string) => deleteCategory(categoryId),
    onSuccess: async () => {
      const deletedName = confirmTarget?.name ?? "";
      setConfirmTarget(null);
      setDeleteError(null);
      await queryClient.invalidateQueries({
        queryKey: CATALOG_QUERY_KEYS.categories,
      });
      onDeleted(`Đã xóa danh mục "${deletedName}".`);
    },
    onError: (err) => {
      setConfirmTarget(null);
      setDeleteError(
        err instanceof Error ? err.message : "Không thể xóa danh mục.",
      );
    },
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-44 w-full rounded-xl" />
        <Skeleton className="h-44 w-full rounded-xl" />
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <Card className="border-border-subtle bg-surface-card">
        <CardContent className="py-10 text-center text-sm text-gray-500">
          Chưa có danh mục nào. Nhấn &ldquo;Thêm danh mục&rdquo; để khởi tạo cây
          danh mục 2 cấp.
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {deleteError ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" aria-hidden="true" />
            <AlertDescription>{deleteError}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {tree.map(({ category: root, children }) => {
            const rootLock = getCategoryDeleteLockState(
              root.id,
              categories,
              productCountByCategory,
            );

            return (
              <Card
                key={root.id}
                className="border-border-subtle bg-surface-card shadow-sm"
              >
                <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-border-subtle pb-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="truncate text-base font-bold text-gray-900">
                        {root.name}
                      </CardTitle>
                      <Badge
                        variant={root.isActive ? "secondary" : "outline"}
                        className="text-[11px]"
                      >
                        {root.isActive ? "Hoạt động" : "Đang ẩn"}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-500">
                      /{root.slug} · Thứ tự{" "}
                      <span className="tabular-nums">{root.sortOrder}</span> ·{" "}
                      <span className="tabular-nums">{children.length}</span>{" "}
                      danh mục con ·{" "}
                      <span className="tabular-nums">
                        {rootLock.productCount}
                      </span>{" "}
                      sản phẩm
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Thêm danh mục con cho ${root.name}`}
                      onClick={() => onCreateChild(root.id)}
                    >
                      <FolderPlus className="size-4" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Sửa danh mục ${root.name}`}
                      onClick={() => onEdit(root)}
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                    </Button>
                    <DeleteCategoryButton
                      category={root}
                      lockReason={rootLock.reason}
                      onRequestDelete={() => setConfirmTarget(root)}
                    />
                  </div>
                </CardHeader>

                <CardContent className="pt-3">
                  {rootLock.locked ? (
                    <p className="mb-3 flex items-center gap-1.5 text-xs text-gray-500">
                      <Lock className="size-3.5 shrink-0" aria-hidden="true" />
                      <span>{rootLock.reason}</span>
                    </p>
                  ) : null}

                  {children.length === 0 ? (
                    <p className="text-xs text-gray-500">
                      Chưa có danh mục con cấp 2.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border-subtle">
                      {children.map((child) => {
                        const childLock = getCategoryDeleteLockState(
                          child.id,
                          categories,
                          productCountByCategory,
                        );
                        return (
                          <li
                            key={child.id}
                            className="flex items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <CornerDownRight
                                className="size-4 shrink-0 text-gray-400"
                                aria-hidden="true"
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="truncate text-sm font-medium text-gray-900">
                                    {child.name}
                                  </span>
                                  {!child.isActive ? (
                                    <Badge
                                      variant="outline"
                                      className="text-[11px]"
                                    >
                                      Đang ẩn
                                    </Badge>
                                  ) : null}
                                </div>
                                <p className="text-xs text-gray-500">
                                  /{child.slug} ·{" "}
                                  <span className="tabular-nums">
                                    {childLock.productCount}
                                  </span>{" "}
                                  sản phẩm
                                </p>
                              </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={`Sửa danh mục ${child.name}`}
                                onClick={() => onEdit(child)}
                              >
                                <Pencil className="size-4" aria-hidden="true" />
                              </Button>
                              <DeleteCategoryButton
                                category={child}
                                lockReason={childLock.reason}
                                onRequestDelete={() => setConfirmTarget(child)}
                              />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <Dialog
        open={Boolean(confirmTarget)}
        onOpenChange={(open) => !open && setConfirmTarget(null)}
      >
        <DialogContent className="bg-surface-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Xác nhận xóa danh mục</DialogTitle>
            <DialogDescription>
              Bạn có chắc chắn muốn xóa danh mục{" "}
              <strong>{confirmTarget?.name}</strong>? Hành động này sẽ giải
              phóng slug để tái sử dụng.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmTarget(null)}
              disabled={deleteMutation.isPending}
            >
              Hủy
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() =>
                confirmTarget && deleteMutation.mutate(confirmTarget.id)
              }
            >
              {deleteMutation.isPending ? "Đang xóa..." : "Xóa danh mục"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

function DeleteCategoryButton({
  category,
  lockReason,
  onRequestDelete,
}: {
  readonly category: CategoryDto;
  readonly lockReason: string | null;
  readonly onRequestDelete: () => void;
}) {
  if (lockReason) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="inline-flex">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled
                aria-label={`Không thể xóa ${category.name}: ${lockReason}`}
              >
                <Lock className="size-4 text-gray-400" aria-hidden="true" />
              </Button>
            </span>
          }
        />
        <TooltipContent>{lockReason}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={`Xóa danh mục ${category.name}`}
      onClick={onRequestDelete}
      className="text-destructive hover:text-destructive"
    >
      <Trash2 className="size-4" aria-hidden="true" />
    </Button>
  );
}
