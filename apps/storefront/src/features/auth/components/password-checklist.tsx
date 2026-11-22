"use client";

import { CheckCircle2, Circle } from "lucide-react";
import { evaluatePasswordRules } from "@/lib/auth/auth-validation";

interface PasswordChecklistProps {
  readonly password: string;
}

/**
 * Renders the 4 OWASP password policy rules shared across customer registration
 * and password reset screens, keeping feedback aligned with backend `zPassword()`.
 */
export function PasswordChecklist({ password }: PasswordChecklistProps) {
  const rules = evaluatePasswordRules(password);
  const items = [
    {
      label: "Từ 8 đến 128 ký tự",
      met: rules.minLength && rules.maxLength,
    },
    {
      label: "Ít nhất 1 chữ cái viết hoa (A–Z)",
      met: rules.hasUppercase,
    },
    { label: "Ít nhất 1 chữ số (0–9)", met: rules.hasNumber },
    { label: "Ít nhất 1 ký tự đặc biệt", met: rules.hasSpecial },
  ] as const;

  return (
    <ul
      aria-label="Yêu cầu mật khẩu"
      className="grid grid-cols-1 gap-1 rounded-lg border border-border-subtle bg-surface-warm px-3 py-2 sm:grid-cols-2"
    >
      {items.map((rule) => (
        <li
          key={rule.label}
          className={`flex items-center gap-1.5 text-[11px] leading-4 ${
            rule.met ? "font-medium text-status-fresh" : "text-gray-500"
          }`}
        >
          {rule.met ? (
            <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <Circle className="size-3.5 shrink-0" aria-hidden="true" />
          )}
          <span>{rule.label}</span>
        </li>
      ))}
    </ul>
  );
}
