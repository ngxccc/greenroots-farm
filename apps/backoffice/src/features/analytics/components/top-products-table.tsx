import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@greenroots/ui";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  formatInteger,
  formatVnd,
  type OperationsAnalyticsDto,
} from "../analytics-utils";

type TopProductRow = OperationsAnalyticsDto["topProducts"][number];

const columnHelper = createColumnHelper<TopProductRow>();

const TOP_PRODUCT_COLUMNS = [
  columnHelper.display({
    id: "rank",
    header: () => <div className="w-12 text-center">Hạng</div>,
    cell: (info) => (
      <div className="text-center font-semibold text-gray-500 tabular-nums">
        #{info.row.index + 1}
      </div>
    ),
  }),
  columnHelper.accessor("productName", {
    header: "Sản phẩm",
    cell: (info) => (
      <span className="font-semibold text-gray-900">{info.getValue()}</span>
    ),
  }),
  columnHelper.accessor("unit", {
    header: "Đơn vị",
    cell: (info) => <span className="text-gray-600">{info.getValue()}</span>,
  }),
  columnHelper.accessor("totalQuantity", {
    header: () => <div className="text-right">Sản lượng bán</div>,
    cell: (info) => (
      <div className="text-right font-medium text-gray-900 tabular-nums">
        {formatInteger(info.getValue())}
      </div>
    ),
  }),
  columnHelper.accessor("grossItemRevenueVnd", {
    header: () => <div className="text-right">Doanh thu gộp</div>,
    cell: (info) => (
      <div className="text-right font-semibold text-brand-dark tabular-nums">
        {formatVnd(info.getValue())}
      </div>
    ),
  }),
];

interface TopProductsTableProps {
  readonly products: OperationsAnalyticsDto["topProducts"];
  readonly isLoading: boolean;
}

/**
 * Renders the top-selling products ranking table using `@tanstack/react-table`
 * and `@greenroots/ui` `Table` primitives.
 */
export function TopProductsTable({
  products,
  isLoading,
}: TopProductsTableProps) {
  // oxlint-disable-next-line react/incompatible-library
  const table = useReactTable({
    data: products,
    columns: TOP_PRODUCT_COLUMNS,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <Card className="border-border-subtle bg-surface-card shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-bold text-gray-900">
          Sản phẩm bán chạy
        </CardTitle>
        <CardDescription>
          Xếp hạng theo doanh thu gộp từ các đơn hàng đã giao thành công.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : products.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">
            Chưa có sản phẩm nào phát sinh doanh thu trong kỳ đã chọn.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
