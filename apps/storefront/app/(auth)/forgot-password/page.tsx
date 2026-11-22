import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";

export const metadata: Metadata = {
  title: "Quên mật khẩu",
  description:
    "Yêu cầu liên kết đặt lại mật khẩu cho tài khoản khách hàng GreenRoots Farm.",
};

/**
 * Customer forgot-password route rendering inside the `(auth)` split-panel shell.
 */
export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
