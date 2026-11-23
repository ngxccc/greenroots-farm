"use client";

import { useRouter } from "next/navigation";
import { useState, type ChangeEvent, type SubmitEvent } from "react";
import { API_ERROR_CODES } from "@greenroots/shared";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  toast,
} from "@greenroots/ui";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { updateProfileAction } from "@/lib/auth/auth-actions";
import {
  PROFILE_FULL_NAME_MAX_LENGTH,
  buildUpdateProfileDiff,
} from "@/lib/auth/auth-validation";
import { formatViDate } from "@/lib/format";
import { broadcastAuthEvent, useAuthStore } from "@/stores/auth.store";
import type { StorefrontSessionUser } from "@/types/auth.types";

interface ProfileDetailsFormProps {
  readonly user: StorefrontSessionUser;
  readonly onProfileUpdated?: (user: StorefrontSessionUser) => void;
}

interface ProfileDetailsFormViewProps {
  readonly email: string;
  readonly emailVerified: boolean;
  readonly createdAt: string;
  readonly fullName: string;
  readonly phone: string;
  readonly hasPendingChanges: boolean;
  readonly isPending: boolean;
  readonly errorMessage: string | null;
  readonly onFullNameChange: (value: string) => void;
  readonly onPhoneChange: (value: string) => void;
  readonly onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
}

/**
 * Pure presentational customer profile form view preserving sibling `<Label htmlFor>`
 * bindings and optional clearable `phone` semantics (`INV-SF-PROFILE-2`, `UI-2`).
 *
 * @param props Controlled field values, submission state, and change handlers.
 * @returns Personal profile card with editable name/phone and read-only email metadata.
 */
export function ProfileDetailsFormView({
  email,
  emailVerified,
  createdAt,
  fullName,
  phone,
  hasPendingChanges,
  isPending,
  errorMessage,
  onFullNameChange,
  onPhoneChange,
  onSubmit,
}: ProfileDetailsFormViewProps) {
  function handleFullNameInput(event: ChangeEvent<HTMLInputElement>) {
    onFullNameChange(event.target.value);
  }

  function handlePhoneInput(event: ChangeEvent<HTMLInputElement>) {
    onPhoneChange(event.target.value);
  }

  return (
    <Card
      aria-label="Thông tin cá nhân"
      className="border-border-subtle bg-surface-card py-0 shadow-sm"
    >
      <CardHeader className="border-b border-border-subtle px-4 py-3.5 sm:px-6 sm:py-4">
        <CardTitle className="text-base font-bold text-gray-900 sm:text-lg">
          Thông tin cá nhân
        </CardTitle>
        <CardDescription className="text-xs text-gray-500">
          Cập nhật họ tên và số điện thoại liên hệ khi giao hàng xe lạnh.
        </CardDescription>
      </CardHeader>

      <CardContent className="p-4 sm:p-6">
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {errorMessage ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" aria-hidden="true" />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="profile-full-name"
                className="text-xs font-semibold text-gray-900"
              >
                Họ và tên
              </Label>
              <Input
                id="profile-full-name"
                name="fullName"
                type="text"
                autoComplete="name"
                maxLength={PROFILE_FULL_NAME_MAX_LENGTH}
                required
                disabled={isPending}
                value={fullName}
                onChange={handleFullNameInput}
                className="h-10 rounded-lg border-border-subtle bg-surface-card px-3 text-sm text-gray-900"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="profile-phone"
                className="text-xs font-semibold text-gray-900"
              >
                Số điện thoại
              </Label>
              <Input
                id="profile-phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                inputMode="numeric"
                disabled={isPending}
                placeholder="Ví dụ: 0908412679"
                value={phone}
                onChange={handlePhoneInput}
                className="h-10 rounded-lg border-border-subtle bg-surface-card px-3 text-sm text-gray-900 tabular-nums"
              />
              <p className="text-[11px] text-gray-500">
                10 chữ số (03, 05, 07, 08, 09). Để trống nếu muốn xóa SĐT.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-gray-900">
              Email đăng nhập
            </span>
            <div className="flex items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface-warm px-3 py-2.5">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-medium text-gray-800">
                  {email}
                </span>
                <span className="text-[11px] text-gray-500 tabular-nums">
                  Thành viên từ {formatViDate(createdAt)}
                </span>
              </div>
              {emailVerified ? (
                <Badge className="h-auto shrink-0 border-0 bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-brand-dark">
                  <CheckCircle2 aria-hidden="true" />
                  <span>Đã xác thực</span>
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="shrink-0 text-xs text-gray-600"
                >
                  <AlertCircle aria-hidden="true" />
                  <span>Chưa xác thực</span>
                </Badge>
              )}
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <Button
              type="submit"
              disabled={!hasPendingChanges || isPending}
              className="h-10 w-full cursor-pointer rounded-lg bg-brand-forest px-5 text-sm font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto"
            >
              {isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  <span>Đang lưu...</span>
                </>
              ) : (
                <span>Lưu thay đổi</span>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * Editable customer profile card wired to `PATCH /api/v1/users/me` with dirty-diffing
 * and explicit `phone: null` clearing semantics (`INV-SF-PROFILE-2`, `INV-SF-PROFILE-3`).
 *
 * @param props Current authenticated profile and optional post-save sync callback.
 * @returns Stateful profile form synchronized with `useAuthStore` and cross-tab events.
 */
export function ProfileDetailsForm({
  user,
  onProfileUpdated,
}: ProfileDetailsFormProps) {
  const router = useRouter();
  const setUser = useAuthStore((state) => state.setUser);
  const clearSession = useAuthStore((state) => state.clearSession);

  const baselineKey = `${user.fullName}\u0000${user.phone ?? ""}`;
  const [draft, setDraft] = useState<{
    readonly baseKey: string;
    readonly fullName: string;
    readonly phone: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const activeDraft = draft?.baseKey === baselineKey ? draft : null;
  const fullName = activeDraft ? activeDraft.fullName : user.fullName;
  const phone = activeDraft ? activeDraft.phone : (user.phone ?? "");

  const baseline = { fullName: user.fullName, phone: user.phone };
  const diffPreview = buildUpdateProfileDiff(baseline, { fullName, phone });
  const hasPendingChanges = !diffPreview.ok || diffPreview.patch !== null;

  function handleFullNameChange(nextFullName: string) {
    setDraft({ baseKey: baselineKey, fullName: nextFullName, phone });
    if (errorMessage) {
      setErrorMessage(null);
    }
  }

  function handlePhoneChange(nextPhone: string) {
    setDraft({ baseKey: baselineKey, fullName, phone: nextPhone });
    if (errorMessage) {
      setErrorMessage(null);
    }
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) {
      return;
    }

    setErrorMessage(null);
    const diff = buildUpdateProfileDiff(baseline, { fullName, phone });
    if (!diff.ok) {
      setErrorMessage(diff.message);
      return;
    }
    if (!diff.patch) {
      return;
    }

    setIsPending(true);
    try {
      const result = await updateProfileAction(diff.patch);
      if (result.ok) {
        setDraft(null);
        setUser(result.user);
        onProfileUpdated?.(result.user);
        broadcastAuthEvent("SESSION_CHANGED");
        toast.success("Đã cập nhật thông tin hồ sơ cá nhân.");
        router.refresh();
        return;
      }

      if (result.code === API_ERROR_CODES.AUTH_TOKEN_INVALID_OR_EXPIRED) {
        clearSession();
        broadcastAuthEvent("LOGOUT");
        router.replace("/login?redirect=%2Faccount%2Fprofile");
        router.refresh();
        return;
      }

      setErrorMessage(result.message);
    } catch {
      setErrorMessage("Không thể kết nối tới máy chủ GreenRoots Farm.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <ProfileDetailsFormView
      email={user.email}
      emailVerified={user.emailVerified}
      createdAt={user.createdAt}
      fullName={fullName}
      phone={phone}
      hasPendingChanges={hasPendingChanges}
      isPending={isPending}
      errorMessage={errorMessage}
      onFullNameChange={handleFullNameChange}
      onPhoneChange={handlePhoneChange}
      onSubmit={(event) => void handleSubmit(event)}
    />
  );
}
