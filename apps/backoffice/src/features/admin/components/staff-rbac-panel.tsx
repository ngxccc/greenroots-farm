import type { StaffRole, UserStatus } from "@greenroots/shared";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@greenroots/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Pencil,
  Search,
  UserPlus,
} from "lucide-react";
import { useState, type SubmitEvent } from "react";
import {
  countActiveSuperAdmins,
  evaluateResetCredentialsGuard,
  evaluateStaffRoleChangeGuard,
  evaluateStaffStatusChangeGuard,
  SELECTABLE_STAFF_ROLES,
  STAFF_ROLE_LABELS,
  USER_STATUS_LABELS,
} from "@/features/admin/rbac-guards";
import { api, extractApiErrorMessage } from "@/lib/api-client";
import type { components } from "@/types/api-schema";

type StaffMemberDto = components["schemas"]["StaffMemberDto"];

interface StaffRbacPanelProps {
  readonly currentUserId: string;
}

const ROLE_BADGE_CLASS: Record<StaffRole, string> = {
  super_admin: "bg-brand-forest text-white border-transparent",
  admin: "bg-gray-900 text-white border-transparent",
  sales: "bg-gray-100 text-gray-800 border-border-subtle",
  farm_staff: "bg-green-50 text-brand-dark border-brand-forest/30",
};

const STATUS_BADGE_CLASS: Record<UserStatus, string> = {
  active: "bg-green-50 text-brand-dark border-brand-forest/30",
  suspended: "bg-surface-card text-destructive border-destructive/40",
  inactive: "bg-gray-100 text-gray-600 border-border-subtle",
};

const STAFF_LIST_QUERY_KEY = ["admin", "users"] as const;
const ACTIVE_SUPER_ADMIN_COUNT_KEY = [
  "admin",
  "users",
  "active-super-admin-count",
] as const;

/**
 * Staff directory, role/status management, account creation, and credential reset panel (BO-10 #121).
 */
export function StaffRbacPanel({ currentUserId }: StaffRbacPanelProps) {
  const queryClient = useQueryClient();

  const [searchText, setSearchText] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | StaffRole>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | UserStatus>("all");

  const [feedback, setFeedback] = useState<{
    readonly variant: "success" | "destructive";
    readonly title: string;
    readonly description: string;
  } | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createFullName, setCreateFullName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createRole, setCreateRole] = useState<StaffRole>("farm_staff");
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingMember, setEditingMember] = useState<StaffMemberDto | null>(
    null,
  );
  const [editFullName, setEditFullName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState<StaffRole>("farm_staff");
  const [editStatus, setEditStatus] = useState<UserStatus>("active");
  const [editError, setEditError] = useState<string | null>(null);

  const [resetTarget, setResetTarget] = useState<StaffMemberDto | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  const staffQuery = useQuery({
    queryKey: [
      ...STAFF_LIST_QUERY_KEY,
      { q: searchText.trim(), role: roleFilter, status: statusFilter },
    ],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/admin/users", {
        params: {
          query: {
            q: searchText.trim() || undefined,
            role: roleFilter === "all" ? undefined : roleFilter,
            status: statusFilter === "all" ? undefined : statusFilter,
            limit: 50,
            sort: "createdAt:desc",
          },
        },
      });
      if (error) {
        throw new Error(
          extractApiErrorMessage(error, "Không thể tải danh sách nhân sự."),
        );
      }
      return data;
    },
  });

  const activeSuperAdminQuery = useQuery({
    queryKey: ACTIVE_SUPER_ADMIN_COUNT_KEY,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/admin/users", {
        params: {
          query: {
            role: "super_admin",
            status: "active",
            limit: 1,
          },
        },
      });
      if (error) {
        throw new Error(
          extractApiErrorMessage(
            error,
            "Không thể kiểm tra số lượng Super Admin.",
          ),
        );
      }
      return data.meta.total;
    },
  });

  const staffList = staffQuery.data?.data ?? [];
  const activeSuperAdminCount =
    activeSuperAdminQuery.data ?? countActiveSuperAdmins(staffList);

  async function invalidateStaffQueries() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: STAFF_LIST_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: ACTIVE_SUPER_ADMIN_COUNT_KEY }),
    ]);
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/v1/admin/users", {
        body: {
          fullName: createFullName.trim(),
          email: createEmail.trim(),
          phone: createPhone.trim() || null,
          role: createRole,
        },
      });
      if (error) {
        throw new Error(
          extractApiErrorMessage(error, "Không thể tạo tài khoản nhân sự."),
        );
      }
      return data.data;
    },
    onSuccess: async (created) => {
      await invalidateStaffQueries();
      setCreateOpen(false);
      setCreateFullName("");
      setCreateEmail("");
      setCreatePhone("");
      setCreateRole("farm_staff");
      setCreateError(null);
      setFeedback({
        variant: "success",
        title: "Đã tạo tài khoản nhân sự",
        description: `Tài khoản ${created.fullName} (${created.email}) đã được tạo. Liên kết đặt mật khẩu có hiệu lực 24 giờ đã được gửi qua email.`,
      });
    },
    onError: (err) => {
      setCreateError(
        err instanceof Error ? err.message : "Không thể tạo tài khoản nhân sự.",
      );
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (member: StaffMemberDto) => {
      const { data, error } = await api.PATCH("/api/v1/admin/users/{id}", {
        params: { path: { id: member.id } },
        body: {
          fullName: editFullName.trim(),
          phone: editPhone.trim() || null,
          role: editRole,
          status: editStatus,
        },
      });
      if (error) {
        throw new Error(
          extractApiErrorMessage(
            error,
            "Không thể cập nhật thông tin nhân sự.",
          ),
        );
      }
      return data.data;
    },
    onSuccess: async (updated) => {
      await invalidateStaffQueries();
      setEditingMember(null);
      setEditError(null);
      setFeedback({
        variant: "success",
        title: "Đã cập nhật nhân sự",
        description: `Thông tin và phân quyền của ${updated.fullName} đã được lưu. Nếu vai trò hoặc trạng thái thay đổi, các phiên đăng nhập cũ đã được thu hồi.`,
      });
    },
    onError: (err) => {
      setEditError(
        err instanceof Error
          ? err.message
          : "Không thể cập nhật thông tin nhân sự.",
      );
    },
  });

  const resetCredentialsMutation = useMutation({
    mutationFn: async (member: StaffMemberDto) => {
      const { error } = await api.POST(
        "/api/v1/admin/users/{id}/reset-credentials",
        {
          params: { path: { id: member.id } },
        },
      );
      if (error) {
        throw new Error(
          extractApiErrorMessage(
            error,
            "Không thể đặt lại thông tin đăng nhập.",
          ),
        );
      }
      return member;
    },
    onSuccess: async (member) => {
      await invalidateStaffQueries();
      setResetTarget(null);
      setResetError(null);
      setFeedback({
        variant: "success",
        title: "Đã thu hồi phiên và gửi email đặt lại mật khẩu",
        description: `Toàn bộ phiên đăng nhập hiện tại của ${member.fullName} (${member.email}) đã bị thu hồi ngay lập tức và liên kết đặt lại mật khẩu 24 giờ đã được gửi.`,
      });
    },
    onError: (err) => {
      setResetError(
        err instanceof Error
          ? err.message
          : "Không thể đặt lại thông tin đăng nhập.",
      );
    },
  });

  function openEditDialog(member: StaffMemberDto) {
    setEditingMember(member);
    setEditFullName(member.fullName);
    setEditPhone(member.phone ?? "");
    setEditRole(member.role);
    setEditStatus(member.status);
    setEditError(null);
  }

  function handleCreateSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);
    if (!createFullName.trim() || !createEmail.trim()) {
      setCreateError("Vui lòng nhập đầy đủ họ tên và email nội bộ.");
      return;
    }
    createMutation.mutate();
  }

  function handleEditSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingMember) return;
    setEditError(null);

    const roleGuard = evaluateStaffRoleChangeGuard({
      actorId: currentUserId,
      target: editingMember,
      nextRole: editRole,
      activeSuperAdminCount,
    });
    if (!roleGuard.allowed) {
      setEditError(roleGuard.reason);
      return;
    }

    const statusGuard = evaluateStaffStatusChangeGuard({
      actorId: currentUserId,
      target: editingMember,
      nextStatus: editStatus,
      activeSuperAdminCount,
    });
    if (!statusGuard.allowed) {
      setEditError(statusGuard.reason);
      return;
    }

    if (!editFullName.trim()) {
      setEditError("Họ tên nhân sự không được để trống.");
      return;
    }

    updateMutation.mutate(editingMember);
  }

  const editRoleLockGuard = editingMember
    ? evaluateStaffRoleChangeGuard({
        actorId: currentUserId,
        target: editingMember,
        nextRole:
          editingMember.role === "super_admin" ? "admin" : "super_admin",
        activeSuperAdminCount,
      })
    : { allowed: true, reason: null };

  const editStatusLockGuard = editingMember
    ? evaluateStaffStatusChangeGuard({
        actorId: currentUserId,
        target: editingMember,
        nextStatus: editingMember.status === "active" ? "suspended" : "active",
        activeSuperAdminCount,
      })
    : { allowed: true, reason: null };

  return (
    <div className="flex flex-col gap-5">
      {feedback && (
        <Alert variant={feedback.variant}>
          {feedback.variant === "success" ? (
            <CheckCircle2 aria-hidden="true" />
          ) : (
            <AlertCircle aria-hidden="true" />
          )}
          <AlertTitle>{feedback.title}</AlertTitle>
          <AlertDescription>{feedback.description}</AlertDescription>
        </Alert>
      )}

      <Card className="border-border-subtle bg-surface-card">
        <CardHeader className="flex flex-col gap-4 border-b border-border-subtle pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg font-bold text-gray-900">
              Danh sách tài khoản nhân sự
            </CardTitle>
            <CardDescription className="text-sm text-gray-600">
              Quản lý vai trò, trạng thái hoạt động và thu hồi phiên đăng nhập
              tức thời theo ADR-0019.
            </CardDescription>
          </div>
          <Button
            type="button"
            onClick={() => {
              setCreateError(null);
              setCreateOpen(true);
            }}
            className="shrink-0 bg-brand-forest text-white hover:bg-brand-dark"
          >
            <UserPlus className="size-4" aria-hidden="true" />
            <span>Tạo tài khoản staff</span>
          </Button>
        </CardHeader>

        <CardContent className="flex flex-col gap-4 pt-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Tìm theo họ tên hoặc email..."
                aria-label="Tìm kiếm nhân sự"
                className="bg-surface-warm pl-9"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={roleFilter}
                onValueChange={(value) => setRoleFilter(value ?? "all")}
              >
                <SelectTrigger
                  aria-label="Lọc theo vai trò"
                  className="w-44 bg-surface-warm"
                >
                  <SelectValue placeholder="Tất cả vai trò" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả vai trò</SelectItem>
                  {SELECTABLE_STAFF_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {STAFF_ROLE_LABELS[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value ?? "all")}
              >
                <SelectTrigger
                  aria-label="Lọc theo trạng thái"
                  className="w-44 bg-surface-warm"
                >
                  <SelectValue placeholder="Tất cả trạng thái" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả trạng thái</SelectItem>
                  <SelectItem value="active">Đang hoạt động</SelectItem>
                  <SelectItem value="suspended">Đã khóa</SelectItem>
                  <SelectItem value="inactive">Ngừng kích hoạt</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {staffQuery.isError && (
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertTitle>Không thể tải danh sách nhân sự</AlertTitle>
              <AlertDescription>
                {staffQuery.error instanceof Error
                  ? staffQuery.error.message
                  : "Đã có lỗi xảy ra khi tải dữ liệu."}
              </AlertDescription>
            </Alert>
          )}

          {staffQuery.isPending ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : staffList.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">
              Không tìm thấy tài khoản nhân sự nào phù hợp bộ lọc.
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nhân sự &amp; Email</TableHead>
                      <TableHead>Vai trò</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Xác thực email</TableHead>
                      <TableHead className="text-right">Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staffList.map((member) => {
                      const isSelf = member.id === currentUserId;
                      const resetGuard = evaluateResetCredentialsGuard({
                        actorId: currentUserId,
                        target: member,
                      });

                      return (
                        <TableRow key={member.id}>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-semibold text-gray-900">
                                {member.fullName}
                                {isSelf && (
                                  <span className="ml-2 text-xs font-medium text-brand-forest">
                                    (Bạn)
                                  </span>
                                )}
                              </span>
                              <span className="text-xs text-gray-500">
                                {member.email}
                              </span>
                              {member.phone && (
                                <span className="text-xs text-gray-500 tabular-nums">
                                  {member.phone}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={ROLE_BADGE_CLASS[member.role]}>
                              {STAFF_ROLE_LABELS[member.role]}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={STATUS_BADGE_CLASS[member.status]}
                            >
                              {USER_STATUS_LABELS[member.status]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-gray-600">
                            {member.emailVerified
                              ? "Đã xác thực"
                              : "Chờ kích hoạt"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex items-center justify-end gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => openEditDialog(member)}
                              >
                                <Pencil
                                  className="size-3.5"
                                  aria-hidden="true"
                                />
                                <span>Chỉnh sửa</span>
                              </Button>
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                disabled={!resetGuard.allowed}
                                title={resetGuard.reason ?? undefined}
                                onClick={() => {
                                  setResetError(null);
                                  setResetTarget(member);
                                }}
                              >
                                <KeyRound
                                  className="size-3.5"
                                  aria-hidden="true"
                                />
                                <span>Đặt lại mật khẩu</span>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-col divide-y divide-border-subtle lg:hidden">
                {staffList.map((member) => {
                  const isSelf = member.id === currentUserId;
                  const resetGuard = evaluateResetCredentialsGuard({
                    actorId: currentUserId,
                    target: member,
                  });

                  return (
                    <div
                      key={member.id}
                      className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-gray-900">
                            {member.fullName}
                            {isSelf && (
                              <span className="ml-1.5 text-xs font-medium text-brand-forest">
                                (Bạn)
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-gray-500">
                            {member.email}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={STATUS_BADGE_CLASS[member.status]}
                        >
                          {USER_STATUS_LABELS[member.status]}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={ROLE_BADGE_CLASS[member.role]}>
                          {STAFF_ROLE_LABELS[member.role]}
                        </Badge>
                        <span className="text-xs text-gray-500">
                          {member.emailVerified
                            ? "Đã xác thực"
                            : "Chờ kích hoạt"}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(member)}
                        >
                          <Pencil className="size-3.5" aria-hidden="true" />
                          <span>Chỉnh sửa</span>
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={!resetGuard.allowed}
                          title={resetGuard.reason ?? undefined}
                          onClick={() => {
                            setResetError(null);
                            setResetTarget(member);
                          }}
                        >
                          <KeyRound className="size-3.5" aria-hidden="true" />
                          <span>Đặt lại mật khẩu</span>
                        </Button>
                      </div>
                      {!resetGuard.allowed && resetGuard.reason && (
                        <p className="text-xs text-gray-500">
                          {resetGuard.reason}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tạo tài khoản nhân sự mới</DialogTitle>
            <DialogDescription>
              Hệ thống sẽ gửi email kèm liên kết đặt mật khẩu Backoffice có hiệu
              lực trong 24 giờ.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} className="flex flex-col gap-4">
            {createError && (
              <Alert variant="destructive">
                <AlertCircle aria-hidden="true" />
                <AlertTitle>Không thể tạo tài khoản</AlertTitle>
                <AlertDescription>{createError}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="create-staff-name">Họ và tên</Label>
              <Input
                id="create-staff-name"
                required
                value={createFullName}
                onChange={(e) => setCreateFullName(e.target.value)}
                placeholder="Nguyễn Văn An"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="create-staff-email">Email nội bộ</Label>
              <Input
                id="create-staff-email"
                type="email"
                required
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
                placeholder="an.nguyen@greenroots.vn"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="create-staff-phone">
                Số điện thoại (tùy chọn)
              </Label>
              <Input
                id="create-staff-phone"
                type="tel"
                value={createPhone}
                onChange={(e) => setCreatePhone(e.target.value)}
                placeholder="0901234567"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="create-staff-role">Vai trò</Label>
              <Select
                value={createRole}
                onValueChange={(value) => {
                  if (value) setCreateRole(value);
                }}
              >
                <SelectTrigger id="create-staff-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SELECTABLE_STAFF_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {STAFF_ROLE_LABELS[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                Hủy
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="bg-brand-forest text-white hover:bg-brand-dark"
              >
                {createMutation.isPending ? "Đang tạo..." : "Tạo & gửi lời mời"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editingMember)}
        onOpenChange={(open) => {
          if (!open) setEditingMember(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Chỉnh sửa phân quyền nhân sự</DialogTitle>
            <DialogDescription>
              {editingMember?.email} — Thay đổi vai trò hoặc khóa tài khoản sẽ
              thu hồi toàn bộ phiên đăng nhập hiện tại.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEditSubmit} className="flex flex-col gap-4">
            {editError && (
              <Alert variant="destructive">
                <AlertCircle aria-hidden="true" />
                <AlertTitle>Không thể cập nhật</AlertTitle>
                <AlertDescription>{editError}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-staff-name">Họ và tên</Label>
              <Input
                id="edit-staff-name"
                required
                value={editFullName}
                onChange={(e) => setEditFullName(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-staff-phone">Số điện thoại</Label>
              <Input
                id="edit-staff-phone"
                type="tel"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-staff-role">Vai trò</Label>
              <Select
                value={editRole}
                disabled={!editRoleLockGuard.allowed}
                onValueChange={(value) => {
                  if (value) setEditRole(value);
                }}
              >
                <SelectTrigger id="edit-staff-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SELECTABLE_STAFF_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {STAFF_ROLE_LABELS[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!editRoleLockGuard.allowed && editRoleLockGuard.reason && (
                <p className="text-xs text-destructive">
                  {editRoleLockGuard.reason}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-staff-status">Trạng thái tài khoản</Label>
              <Select
                value={editStatus}
                disabled={!editStatusLockGuard.allowed}
                onValueChange={(value) => {
                  if (value) setEditStatus(value);
                }}
              >
                <SelectTrigger id="edit-staff-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Đang hoạt động</SelectItem>
                  <SelectItem value="suspended">Đã khóa</SelectItem>
                  <SelectItem value="inactive">Ngừng kích hoạt</SelectItem>
                </SelectContent>
              </Select>
              {!editStatusLockGuard.allowed && editStatusLockGuard.reason && (
                <p className="text-xs text-destructive">
                  {editStatusLockGuard.reason}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingMember(null)}
              >
                Hủy
              </Button>
              <Button
                type="submit"
                disabled={updateMutation.isPending}
                className="bg-brand-forest text-white hover:bg-brand-dark"
              >
                {updateMutation.isPending ? "Đang lưu..." : "Lưu thay đổi"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(resetTarget)}
        onOpenChange={(open) => {
          if (!open) setResetTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận đặt lại thông tin đăng nhập</DialogTitle>
            <DialogDescription>
              Hành động này sẽ thu hồi toàn bộ phiên đăng nhập đang hoạt động
              của{" "}
              <strong className="font-semibold text-gray-900">
                {resetTarget?.fullName}
              </strong>{" "}
              ({resetTarget?.email}) và gửi email đặt lại mật khẩu có hiệu lực
              24 giờ.
            </DialogDescription>
          </DialogHeader>

          {resetError && (
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertTitle>Không thể đặt lại mật khẩu</AlertTitle>
              <AlertDescription>{resetError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setResetTarget(null)}
            >
              Hủy
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={resetCredentialsMutation.isPending || !resetTarget}
              onClick={() => {
                if (resetTarget) {
                  resetCredentialsMutation.mutate(resetTarget);
                }
              }}
            >
              {resetCredentialsMutation.isPending
                ? "Đang thu hồi phiên..."
                : "Xác nhận thu hồi & gửi email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
