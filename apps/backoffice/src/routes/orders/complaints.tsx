import { ComplaintStatus } from "@greenroots/shared";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@greenroots/ui";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Image as ImageIcon,
  Search,
  Video,
} from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { useAuthStore } from "@/features/auth/stores/auth.store";
import {
  COMPLAINTS_QUERY_KEYS,
  fetchStaffComplaints,
} from "@/features/complaints/complaints.api";
import {
  canResolveComplaints,
  canViewAndTriageComplaints,
  COMPLAINT_CATEGORY_LABELS,
  COMPLAINT_RESOLUTION_LABELS,
  COMPLAINT_STATUS_META,
  COMPLAINT_STATUS_TABS,
  type ComplaintStatusFilter,
  filterSafeMediaUrls,
  formatViDateTime,
  formatVnd,
  isSafeMediaUrl,
  type StaffComplaintDto,
} from "@/features/complaints/complaints.utils";
import { ComplaintDetailDialog } from "@/features/complaints/components/complaint-detail-dialog";

export const Route = createFileRoute("/orders/complaints")({
  component: ComplaintsPage,
});

const columnHelper = createColumnHelper<StaffComplaintDto>();

function createComplaintColumns(options: {
  readonly onInspect: (complaint: StaffComplaintDto) => void;
}) {
  return [
    columnHelper.accessor("orderCode", {
      header: "Mã đơn & Thời gian",
      cell: (info) => {
        const row = info.row.original;
        return (
          <div className="flex flex-col gap-0.5">
            <span className="font-bold text-gray-900 tabular-nums">
              {info.getValue()}
            </span>
            <span className="text-xs text-gray-500 tabular-nums">
              {formatViDateTime(row.createdAt)}
            </span>
            <span className="text-xs font-medium text-gray-700 tabular-nums">
              {formatVnd(row.orderTotalVnd)}
            </span>
          </div>
        );
      },
    }),
    columnHelper.accessor("customerName", {
      header: "Khách hàng",
      cell: (info) => {
        const row = info.row.original;
        return (
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-gray-900">{info.getValue()}</span>
            <span className="text-xs text-gray-600 tabular-nums">
              {row.customerPhone ?? "—"}
            </span>
          </div>
        );
      },
    }),
    columnHelper.accessor("category", {
      header: "Nội dung & Bằng chứng",
      cell: (info) => {
        const row = info.row.original;
        const safeImageCount = filterSafeMediaUrls(row.proofImageUrls).length;
        const hasSafeVideo = isSafeMediaUrl(row.proofVideoUrl);
        return (
          <div className="flex max-w-xs flex-col gap-1">
            <span className="text-xs font-semibold text-gray-900">
              {COMPLAINT_CATEGORY_LABELS[info.getValue()]}
            </span>
            <p className="line-clamp-2 text-xs text-gray-600">{row.reason}</p>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1 tabular-nums">
                <ImageIcon className="size-3.5" aria-hidden="true" />
                {safeImageCount} ảnh
              </span>
              {hasSafeVideo ? (
                <span className="inline-flex items-center gap-1">
                  <Video className="size-3.5" aria-hidden="true" />
                  Video
                </span>
              ) : null}
            </div>
          </div>
        );
      },
    }),
    columnHelper.accessor("status", {
      header: "Trạng thái",
      cell: (info) => {
        const row = info.row.original;
        const meta = COMPLAINT_STATUS_META[info.getValue()];
        return (
          <div className="flex flex-col items-start gap-1">
            <Badge variant="outline" className={meta.badgeClassName}>
              {meta.label}
            </Badge>
            {row.resolution ? (
              <span className="text-xs text-gray-600">
                {COMPLAINT_RESOLUTION_LABELS[row.resolution]}
              </span>
            ) : null}
          </div>
        );
      },
    }),
    columnHelper.display({
      id: "actions",
      header: () => <span className="sr-only">Thao tác</span>,
      cell: (info) => {
        const row = info.row.original;
        return (
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => options.onInspect(row)}
            >
              <Eye className="size-4" aria-hidden="true" />
              {row.status === ComplaintStatus.PENDING
                ? "Kiểm tra & Phân loại"
                : "Xem chi tiết"}
            </Button>
          </div>
        );
      },
    }),
  ];
}

function ComplaintsPage() {
  const userRole = useAuthStore((state) => state.user?.role);
  const canTriage = canViewAndTriageComplaints(userRole);
  const canResolve = canResolveComplaints(userRole);

  const [statusFilter, setStatusFilter] = useState<ComplaintStatusFilter>(
    ComplaintStatus.PENDING,
  );
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [selectedComplaint, setSelectedComplaint] =
    useState<StaffComplaintDto | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const queryParams = useMemo(
    () => ({
      status: statusFilter,
      search: searchInput,
      page,
      limit: 20,
    }),
    [statusFilter, searchInput, page],
  );

  const complaintsQuery = useQuery({
    queryKey: COMPLAINTS_QUERY_KEYS.list(queryParams),
    queryFn: () => fetchStaffComplaints(queryParams),
    enabled: canTriage,
  });

  const columns = useMemo(
    () =>
      createComplaintColumns({
        onInspect: (complaint) => {
          setActionNotice(null);
          setSelectedComplaint(complaint);
        },
      }),
    [],
  );

  const complaints = complaintsQuery.data?.items ?? [];

  // oxlint-disable-next-line react/incompatible-library
  const table = useReactTable({
    data: complaints,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader
        eyebrow="Bán hàng & Kho"
        title="Khiếu nại"
        description="Kiểm tra ảnh dập nát, video đối chiếu tem QR trong 24h và xử lý bồi hoàn."
      />

      {!canTriage ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertTitle>Không có quyền truy cập</AlertTitle>
          <AlertDescription>
            Chỉ nhân viên Kinh doanh (Sales) hoặc Quản trị viên mới có quyền xem
            và phân loại khiếu nại khách hàng.
          </AlertDescription>
        </Alert>
      ) : null}

      {canTriage && !canResolve ? (
        <Alert>
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertDescription>
            Tài khoản Kinh doanh (Sales) có quyền xem bằng chứng và phân loại
            khiếu nại. Quyền hoàn tiền hoặc tạo đơn bù 0đ chỉ dành cho Quản trị
            viên (Admin).
          </AlertDescription>
        </Alert>
      ) : null}

      {actionNotice ? (
        <Alert variant="success">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          <AlertDescription>{actionNotice}</AlertDescription>
        </Alert>
      ) : null}

      {complaintsQuery.isError ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertTitle>Không thể tải danh sách khiếu nại</AlertTitle>
          <AlertDescription>
            {complaintsQuery.error instanceof Error
              ? complaintsQuery.error.message
              : "Vui lòng kiểm tra kết nối và thử lại."}
          </AlertDescription>
        </Alert>
      ) : null}

      {canTriage ? (
        <>
          <Tabs
            value={statusFilter}
            onValueChange={(value) => {
              setStatusFilter(value as ComplaintStatusFilter);
              setPage(1);
            }}
          >
            <TabsList variant="line" className="flex-wrap">
              {COMPLAINT_STATUS_TABS.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={searchInput}
                onChange={(event) => {
                  setSearchInput(event.target.value);
                  setPage(1);
                }}
                placeholder="Tìm mã đơn, tên hoặc SĐT khách..."
                aria-label="Tìm kiếm khiếu nại"
                className="pl-9"
              />
            </div>
          </div>

          <Card className="border-border-subtle bg-surface-card shadow-sm">
            <CardContent className="p-0">
              {complaintsQuery.isLoading ? (
                <div className="space-y-3 p-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
              ) : complaints.length === 0 ? (
                <div className="py-12 text-center text-sm text-gray-500">
                  Không có khiếu nại nào phù hợp với bộ lọc hiện tại.
                </div>
              ) : (
                <Table>
                  <TableHeader className="bg-gray-50 text-xs font-bold text-gray-600 uppercase">
                    {table.getHeaderGroups().map((headerGroup) => (
                      <TableRow
                        key={headerGroup.id}
                        className="hover:bg-transparent"
                      >
                        {headerGroup.headers.map((header) => (
                          <TableHead
                            key={header.id}
                            className="h-auto px-4 py-3 font-bold text-gray-600"
                          >
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
                      <TableRow key={row.id} className="hover:bg-gray-50/70">
                        {row.getVisibleCells().map((cell) => (
                          <TableCell
                            key={cell.id}
                            className="px-4 py-3 align-top"
                          >
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
              )}
            </CardContent>
          </Card>

          {complaintsQuery.data && complaintsQuery.data.totalPages > 1 ? (
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span className="tabular-nums">
                Trang {complaintsQuery.data.page} /{" "}
                {complaintsQuery.data.totalPages} ({complaintsQuery.data.total}{" "}
                khiếu nại)
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                >
                  Trước
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={page >= complaintsQuery.data.totalPages}
                  onClick={() => setPage((prev) => prev + 1)}
                >
                  Sau
                </Button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      <ComplaintDetailDialog
        key={selectedComplaint?.id ?? "complaint-none"}
        complaint={selectedComplaint}
        open={selectedComplaint !== null}
        userRole={userRole}
        onOpenChange={(open) => {
          if (!open) setSelectedComplaint(null);
        }}
        onUpdated={(message) => {
          setActionNotice(message);
        }}
      />
    </div>
  );
}
