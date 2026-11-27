import {
  Alert,
  AlertDescription,
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@greenroots/ui";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2, Plus } from "lucide-react";
import { useState } from "react";
import {
  getDefaultRouteForRole,
  useAuthStore,
} from "@/features/auth/stores/auth.store";
import {
  CATALOG_QUERY_KEYS,
  fetchAdminCategories,
  fetchAdminProducts,
} from "@/features/catalog/catalog-api";
import {
  countProductsByCategory,
  type CategoryDto,
  type ProductDto,
} from "@/features/catalog/catalog-utils";
import { CategoryFormDialog } from "@/features/catalog/components/category-form-dialog";
import { CategoryTreeTab } from "@/features/catalog/components/category-tree-tab";
import { ProductFormDialog } from "@/features/catalog/components/product-form-dialog";
import { ProductsTab } from "@/features/catalog/components/products-tab";

export const Route = createFileRoute("/catalog/products")({
  beforeLoad: () => {
    const role = useAuthStore.getState().user?.role;
    if (role && role !== "admin" && role !== "super_admin") {
      // oxlint-disable-next-line typescript/only-throw-error
      throw redirect({ to: getDefaultRouteForRole(role) });
    }
  },
  component: CatalogProductsPage,
});

function CatalogProductsPage() {
  const [activeTab, setActiveTab] = useState<"products" | "categories">(
    "products",
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductDto | null>(null);

  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryDto | null>(
    null,
  );
  const [defaultParentId, setDefaultParentId] = useState<string | null>(null);

  const {
    data: categories = [],
    isLoading: categoriesLoading,
    error: categoriesError,
  } = useQuery({
    queryKey: CATALOG_QUERY_KEYS.categories,
    queryFn: fetchAdminCategories,
  });

  // Fetch product counts per category so delete-lock hints reflect real product dependencies.
  const { data: allProductsSummary } = useQuery({
    queryKey: CATALOG_QUERY_KEYS.allProductsForCounts,
    queryFn: () => fetchAdminProducts({ page: 1, limit: 100 }),
  });

  const productCountByCategory = countProductsByCategory(
    allProductsSummary?.items ?? [],
  );

  function handleOpenNewProduct() {
    setEditingProduct(null);
    setProductDialogOpen(true);
  }

  function handleEditProduct(product: ProductDto) {
    setEditingProduct(product);
    setProductDialogOpen(true);
  }

  function handleOpenNewRootCategory() {
    setEditingCategory(null);
    setDefaultParentId(null);
    setCategoryDialogOpen(true);
  }

  function handleOpenNewChildCategory(parentId: string) {
    setEditingCategory(null);
    setDefaultParentId(parentId);
    setCategoryDialogOpen(true);
  }

  function handleEditCategory(category: CategoryDto) {
    setEditingCategory(category);
    setDefaultParentId(category.parentId);
    setCategoryDialogOpen(true);
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-semibold text-gray-500">
            Danh mục cửa hàng
          </p>
          <h1 className="text-2xl font-bold text-gray-900">
            Quản lý Danh mục &amp; Sản phẩm
          </h1>
          <p className="text-sm text-gray-600">
            Quản trị cây danh mục 2 cấp và danh sách sản phẩm nông trại (giá
            VNĐ, hướng dẫn bảo quản, hình ảnh, trạng thái hiển thị).
          </p>
        </div>

        <Button
          type="button"
          onClick={
            activeTab === "products"
              ? handleOpenNewProduct
              : handleOpenNewRootCategory
          }
          className="shrink-0 bg-brand-forest text-white hover:bg-brand-dark"
        >
          <Plus className="mr-1.5 size-4" aria-hidden="true" />
          {activeTab === "products" ? "Thêm sản phẩm" : "Thêm danh mục"}
        </Button>
      </div>

      {statusMessage ? (
        <Alert variant="success">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          <AlertDescription>{statusMessage}</AlertDescription>
        </Alert>
      ) : null}

      {categoriesError ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden="true" />
          <AlertDescription>
            {categoriesError instanceof Error
              ? categoriesError.message
              : "Không thể tải cây danh mục."}
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs
        value={activeTab}
        onValueChange={(value: unknown) => {
          if (value === "products" || value === "categories") {
            setActiveTab(value);
          }
        }}
      >
        <TabsList className="h-auto w-full self-start border border-border-subtle bg-surface-card p-1 sm:w-fit">
          <TabsTrigger
            value="products"
            className="px-4 py-1.5 data-active:bg-brand-forest data-active:text-white"
          >
            Sản phẩm
          </TabsTrigger>
          <TabsTrigger
            value="categories"
            className="px-4 py-1.5 data-active:bg-brand-forest data-active:text-white"
          >
            Cây danh mục 2 cấp
          </TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="mt-4">
          <ProductsTab
            categories={categories}
            onEdit={handleEditProduct}
            onFeedback={setStatusMessage}
          />
        </TabsContent>

        <TabsContent value="categories" className="mt-4">
          <CategoryTreeTab
            categories={categories}
            isLoading={categoriesLoading}
            productCountByCategory={productCountByCategory}
            onCreateChild={handleOpenNewChildCategory}
            onEdit={handleEditCategory}
            onDeleted={setStatusMessage}
          />
        </TabsContent>
      </Tabs>

      <ProductFormDialog
        open={productDialogOpen}
        onOpenChange={setProductDialogOpen}
        editingProduct={editingProduct}
        categories={categories}
        onSaved={setStatusMessage}
      />

      <CategoryFormDialog
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
        editingCategory={editingCategory}
        defaultParentId={defaultParentId}
        categories={categories}
        onSaved={setStatusMessage}
      />
    </div>
  );
}
