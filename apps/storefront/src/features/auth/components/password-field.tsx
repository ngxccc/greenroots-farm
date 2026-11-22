"use client";

import { useState, type ChangeEvent } from "react";
import { Button, Input, Label } from "@greenroots/ui";
import { Eye, EyeOff } from "lucide-react";
import { AUTH_INPUT_CLASS, AUTH_LABEL_CLASS } from "./auth-styles";

interface PasswordFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder: string;
  readonly autoComplete: "current-password" | "new-password";
  readonly disabled?: boolean;
  readonly invalid?: boolean;
  readonly showLabel?: string;
  readonly hideLabel?: string;
  readonly errorMessage?: string;
}

/**
 * Reusable password input paired with an accessible `@greenroots/ui` visibility toggle button.
 */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  disabled = false,
  invalid = false,
  showLabel = "Hiện mật khẩu",
  hideLabel = "Ẩn mật khẩu",
  errorMessage,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange(event.target.value);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className={AUTH_LABEL_CLASS}>
        {label}
      </Label>
      <div className="relative flex items-center">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          disabled={disabled}
          aria-invalid={invalid || Boolean(errorMessage)}
          aria-describedby={errorMessage ? `${id}-error` : undefined}
          className={`${AUTH_INPUT_CLASS} pr-11`}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setVisible((prev) => !prev)}
          disabled={disabled}
          aria-label={visible ? hideLabel : showLabel}
          className="absolute right-2 size-8 cursor-pointer text-gray-500 hover:bg-transparent hover:text-gray-900"
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
        </Button>
      </div>
      {errorMessage ? (
        <p id={`${id}-error`} className="text-xs text-status-spoiled">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
