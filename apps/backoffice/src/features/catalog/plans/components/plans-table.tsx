import {
  Badge,
  Button,
  Card,
  CardContent,
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
import { Pencil, Power } from "lucide-react";
import { useMemo } from "react";
import { formatVnd } from "@/features/catalog/catalog-utils";
import { formatWeightKg, type SubscriptionPlanDto } from "../plans-utils";

const columnHelper = createColumnHelper<SubscriptionPlanDto>();

interface PlansTableProps {
  readonly plans: readonly SubscriptionPlanDto[];
  readonly isLoading: boolean;
  readonly canMutate: boolean;
  readonly onEdit: (plan: SubscriptionPlanDto) => void;
  readonly onToggleStatus: (plan: SubscriptionPlanDto) => void;
}

function createPlanColumns(options: {
  readonly canMutate: boolean;
  readonly onEdit: (plan: SubscriptionPlanDto) => void;
  readonly onToggleStatus: (plan: SubscriptionPlanDto) => void;
}) {
  return [
    columnHelper.accessor("name", {
      header: "Gói định kỳ",
      cell: (info) => {
        const plan = info.row.original;
        return (
          <div className="max-w-sm space-y-0.5">
            <div className="font-semibold text-gray-900">{plan.name}</div>
            <div className="text-xs text-gray-500 tabular-nums">
              {plan.slug}
            </div>
            <p className="line-clamp-1 text-xs text-gray-600">
              {plan.basketDescription}
            </p>
          </div>
        );
      },
    }),
    columnHelper.accessor("priceVnd", {
      header: () => <div className="text-right">Giá gói</div>,
      cell: (info) => (
        <div className="text-right font-semibold text-gray-900 tabular-nums">
          {formatVnd(info.getValue())}
        </div>
      ),
    }),
    columnHelper.accessor("totalDeliveries", {
      header: () => <div className="text-right">Số buổi</div>,
      cell: (info) => (
        <div className="text-right text-gray-700 tabular-nums">
          {info.getValue()} buổi
        </div>
      ),
    }),
    columnHelper.accessor("weightPerDeliveryKg", {
      header: () => <div className="text-right">Định mức/buổi</div>,
      cell: (info) => (
        <div className="text-right text-gray-700 tabular-nums">
          {formatWeightKg(info.getValue())} kg
        </div>
      ),
    }),
    columnHelper.accessor((row) => row.activeSubscriberCount ?? 0, {
      id: "activeSubscriberCount",
      header: () => <div className="text-right">Đang đăng ký</div>,
      cell: (info) => (
        <div className="text-right font-medium text-gray-900 tabular-nums">
          {info.getValue()} khách
        </div>
      ),
    }),
    columnHelper.accessor("isActive", {
      header: "Trạng thái",
      cell: (info) =>
        info.getValue() ? (
          <Badge
            variant="outline"
            className="border-emerald-200 bg-emerald-50 text-emerald-700"
          >
            Đang mở
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="border-gray-200 bg-gray-100 text-gray-600"
          >
            Ngừng bán
          </Badge>
        ),
    }),
    columnHelper.display({
      id: "actions",
      header: () => <div className="text-right">Thao tác</div>,
      cell: (info) => {
        const plan = info.row.original;
        if (!options.canMutate) {
          return (
            <div className="text-right text-xs text-gray-400">Chỉ xem</div>
          );
        }

        return (
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => options.onEdit(plan)}
            >
              <Pencil className="mr-1.5 size-3.5" aria-hidden="true" />
              Sửa
            </Button>
            <Button
              type="button"
              variant={plan.isActive ? "destructive" : "outline"}
              size="sm"
              onClick={() => options.onToggleStatus(plan)}
            >
              <Power className="mr-1.5 size-3.5" aria-hidden="true" />
              {plan.isActive ? "Ngừng bán" : "Mở bán"}
            </Button>
          </div>
        );
      },
    }),
  ];
}

/**
 * TanStack Table view for seasonal subscription plans with subscriber counts and lifecycle actions.
 */
export function PlansTable({
  plans,
  isLoading,
  canMutate,
  onEdit,
  onToggleStatus,
}: PlansTableProps) {
  const columns = useMemo(
    () => createPlanColumns({ canMutate, onEdit, onToggleStatus }),
    [canMutate, onEdit, onToggleStatus],
  );

  const data = useMemo(() => [...plans], [plans]);

  // oxlint-disable-next-line react/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (isLoading) {
    return (
      <Card className="border-border-subtle bg-surface-card">
        <CardContent className="space-y-3 py-6">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border-subtle bg-surface-card">
      <CardContent className="p-0">
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
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="py-10 text-center text-sm text-gray-500"
                >
                  Chưa có gói rau định kỳ nào phù hợp với bộ lọc hiện tại.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
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
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
