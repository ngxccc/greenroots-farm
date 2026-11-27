import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@greenroots/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ImageOff, Pencil, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  CATALOG_QUERY_KEYS,
  deleteProduct,
  fetchAdminProducts,
  updateProduct,
} from "../catalog-api";
import {
  buildCategoryTree,
  formatProductCategoryPath,
  formatVnd,
  type CategoryDto,
  type ProductDto,
} from "../catalog-utils";

interface ProductsTabProps {
  readonly categories: readonly CategoryDto[];
  readonly onEdit: (product: ProductDto) => void;
  readonly onFeedback: (message: string) => void;
}

const ALL_CATEGORIES_VALUE = "__all__";
const ALL_STATUS_VALUE = "__all__";

/**
 * Product catalog management tab with search, filters, inline status toggle, and soft delete.
 */
export function ProductsTab({
  categories,
  onEdit,
  onFeedback,
}: ProductsTabProps) {
  const queryClient = useQueryClient();

  const [searchText, setSearchText] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES_VALUE);
  const [statusFilter, setStatusFilter] = useState(ALL_STATUS_VALUE);
  const [page, setPage] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState<ProductDto | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const queryParams = {
    q: searchText.trim() || undefined,
    categoryId:
      categoryFilter === ALL_CATEGORIES_VALUE ? undefined : categoryFilter,
    isActive:
      statusFilter === ALL_STATUS_VALUE ? undefined : statusFilter === "active",
    page,
    limit: 20,
  };

  const { data, isLoading, error } = useQuery({
    queryKey: CATALOG_QUERY_KEYS.products(queryParams),
    queryFn: () => fetchAdminProducts(queryParams),
  });

  const categoriesById = new Map(categories.map((cat) => [cat.id, cat]));
  const categoryTree = buildCategoryTree(categories);

  const toggleActiveMutation = useMutation({
    mutationFn: (product: ProductDto) =>
      updateProduct(product.id, { isActive: !product.isActive }),
    onSuccess: async (updated) => {
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
      onFeedback(
        updated.isActive
          ? `Đã bật hiển thị "${updated.name}".`
          : `Đã ẩn sản phẩm "${updated.name}".`,
      );
    },
    onError: (err) => {
      setActionError(
        err instanceof Error
          ? err.message
          : "Không thể cập nhật trạng thái sản phẩm.",
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (productId: string) => deleteProduct(productId),
    onSuccess: async () => {
      const deletedName = confirmDelete?.name ?? "";
      setConfirmDelete(null);
      setActionError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "products"] }),
        queryClient.invalidateQueries({
          queryKey: CATALOG_QUERY_KEYS.allProductsForCounts,
        }),
      ]);
      onFeedback(`Đã xóa sản phẩm "${deletedName}".`);
    },
    onError: (err) => {
      setConfirmDelete(null);
      setActionError(
        err instanceof Error ? err.message : "Không thể xóa sản phẩm.",
      );
    },
  });

  const products = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <Card className="border-border-subtle bg-surface-card shadow-sm">
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row">
            <div className="relative flex-1 sm:max-w-xs">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={searchText}
                onChange={(e) => {
                  setSearchText(e.target.value);
                  setPage(1);
                }}
                placeholder="Tìm theo tên hoặc slug..."
                className="pl-9"
                aria-label="Tìm kiếm sản phẩm"
              />
            </div>

            <Select
              value={categoryFilter}
              onValueChange={(value) => {
                if (value) {
                  setCategoryFilter(value);
                  setPage(1);
                }
              }}
            >
              <SelectTrigger
                className="w-full sm:w-56"
                aria-label="Lọc theo danh mục"
              >
                <SelectValue placeholder="Tất cả danh mục">
                  {categoryFilter === ALL_CATEGORIES_VALUE
                    ? "Tất cả danh mục"
                    : (() => {
                        for (const { category, children } of categoryTree) {
                          if (category.id === categoryFilter) {
                            return category.name;
                          }
                          const child = children.find(
                            (c) => c.id === categoryFilter,
                          );
                          if (child) {
                            return `${category.name} > ${child.name}`;
                          }
                        }
                        return "Tất cả danh mục";
                      })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CATEGORIES_VALUE}>
                  Tất cả danh mục
                </SelectItem>
                {categoryTree.map(({ category, children }) => (
                  <div key={category.id}>
                    <SelectItem value={category.id}>{category.name}</SelectItem>
                    {children.map((child) => (
                      <SelectItem key={child.id} value={child.id}>
                        {category.name} &gt; {child.name}
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={statusFilter}
              onValueChange={(value) => {
                if (value) {
                  setStatusFilter(value);
                  setPage(1);
                }
              }}
            >
              <SelectTrigger
                className="w-full sm:w-44"
                aria-label="Lọc theo trạng thái"
              >
                <SelectValue placeholder="Tất cả trạng thái">
                  {statusFilter === ALL_STATUS_VALUE
                    ? "Tất cả trạng thái"
                    : statusFilter === "active"
                      ? "Đang bán"
                      : "Đang ẩn"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_STATUS_VALUE}>
                  Tất cả trạng thái
                </SelectItem>
                <SelectItem value="active">Đang bán</SelectItem>
                <SelectItem value="inactive">Đang ẩn</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-gray-500">
            Tổng:{" "}
            <strong className="font-semibold text-gray-900 tabular-nums">
              {total}
            </strong>{" "}
            sản phẩm
          </p>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" aria-hidden="true" />
            <AlertDescription>
              {error instanceof Error
                ? error.message
                : "Không thể tải danh sách sản phẩm."}
            </AlertDescription>
          </Alert>
        ) : null}

        {actionError ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" aria-hidden="true" />
            <AlertDescription>{actionError}</AlertDescription>
          </Alert>
        ) : null}

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : products.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">
            Không tìm thấy sản phẩm phù hợp với bộ lọc hiện tại.
          </div>
        ) : (
          <>
            <div className="hidden lg:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sản phẩm &amp; Slug</TableHead>
                    <TableHead>Danh mục</TableHead>
                    <TableHead>Đơn vị</TableHead>
                    <TableHead>Giá gốc / Sale</TableHead>
                    <TableHead>Chứng nhận</TableHead>
                    <TableHead>Hiển thị</TableHead>
                    <TableHead className="text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => {
                    const thumb = product.imageUrls[0];
                    const categoryPath = formatProductCategoryPath(
                      product,
                      categoriesById,
                    );
                    return (
                      <TableRow key={product.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            {thumb ? (
                              <img
                                src={thumb}
                                alt={product.name}
                                className="size-10 shrink-0 rounded-lg border border-border-subtle object-cover"
                              />
                            ) : (
                              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-surface-warm text-gray-400">
                                <ImageOff
                                  className="size-4"
                                  aria-hidden="true"
                                />
                              </span>
                            )}
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-gray-900">
                                {product.name}
                              </p>
                              <p className="truncate text-xs text-gray-500">
                                /{product.slug}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-gray-700">
                          {categoryPath}
                        </TableCell>
                        <TableCell className="text-sm text-gray-700 tabular-nums">
                          {product.unit}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {product.salePriceVnd !== null ? (
                            <div>
                              <p className="font-semibold text-brand-dark">
                                {formatVnd(product.salePriceVnd)}
                              </p>
                              <p className="text-xs text-gray-400 line-through">
                                {formatVnd(product.basePriceVnd)}
                              </p>
                            </div>
                          ) : (
                            <span className="font-semibold text-gray-900">
                              {formatVnd(product.basePriceVnd)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {product.isVietGap ? (
                              <Badge
                                variant="secondary"
                                className="text-[11px]"
                              >
                                VietGAP
                              </Badge>
                            ) : null}
                            {product.isUsda ? (
                              <Badge
                                variant="secondary"
                                className="text-[11px]"
                              >
                                USDA
                              </Badge>
                            ) : null}
                            {product.isSubscriptionEligible ? (
                              <Badge variant="outline" className="text-[11px]">
                                Gói tuần
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={toggleActiveMutation.isPending}
                            onClick={() => toggleActiveMutation.mutate(product)}
                          >
                            {product.isActive ? "Đang bán" : "Đang ẩn"}
                          </Button>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`Sửa ${product.name}`}
                              onClick={() => onEdit(product)}
                            >
                              <Pencil className="size-4" aria-hidden="true" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`Xóa ${product.name}`}
                              onClick={() => setConfirmDelete(product)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="size-4" aria-hidden="true" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="divide-y divide-border-subtle lg:hidden">
              {products.map((product) => {
                const categoryPath = formatProductCategoryPath(
                  product,
                  categoriesById,
                );
                return (
                  <div
                    key={product.id}
                    className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="font-semibold text-gray-900">
                        {product.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {categoryPath} · {product.unit}
                      </p>
                      <p className="text-sm font-semibold text-brand-dark tabular-nums">
                        {product.salePriceVnd !== null
                          ? `${formatVnd(product.salePriceVnd)} (gốc ${formatVnd(product.basePriceVnd)})`
                          : formatVnd(product.basePriceVnd)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => toggleActiveMutation.mutate(product)}
                      >
                        {product.isActive ? "Bật" : "Ẩn"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Sửa ${product.name}`}
                        onClick={() => onEdit(product)}
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Xóa ${product.name}`}
                        onClick={() => setConfirmDelete(product)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {totalPages > 1 ? (
              <div className="flex items-center justify-between border-t border-border-subtle pt-3">
                <span className="text-xs text-gray-500 tabular-nums">
                  Trang {page} / {totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Trước
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Sau
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </CardContent>

      <Dialog
        open={Boolean(confirmDelete)}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <DialogContent className="bg-surface-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Xác nhận xóa sản phẩm</DialogTitle>
            <DialogDescription>
              Bạn có chắc chắn muốn xóa sản phẩm{" "}
              <strong>{confirmDelete?.name}</strong>? Dữ liệu lịch sử đơn hàng
              và lô thu hoạch vẫn được giữ nguyên.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmDelete(null)}
              disabled={deleteMutation.isPending}
            >
              Hủy
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() =>
                confirmDelete && deleteMutation.mutate(confirmDelete.id)
              }
            >
              {deleteMutation.isPending ? "Đang xóa..." : "Xóa sản phẩm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
