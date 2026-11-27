import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@greenroots/ui";
import { AlertCircle, Eye, EyeOff, Leaf } from "lucide-react";
import { useState, type InputHTMLAttributes, type ReactNode } from "react";

interface AuthCardShellProps {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
}

/**
 * Centered Backoffice authentication card shell adapted from the GreenRoots auth layout.
 */
export function AuthCardShell({
  title,
  description,
  children,
}: AuthCardShellProps) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-surface-warm p-4">
      <main className="flex w-full max-w-md flex-col gap-6">
        <div className="flex flex-col items-center gap-1 text-center">
          <div className="inline-flex items-center gap-2 text-brand-forest">
            <Leaf className="size-6" aria-hidden="true" />
            <span className="text-xl font-extrabold tracking-tight text-gray-900">
              GreenRoots
            </span>
            <span className="text-xs font-semibold text-brand-dark">
              Backoffice
            </span>
          </div>
          <p className="text-xs text-gray-500">
            Cổng vận hành nội bộ — GreenRoots Farm
          </p>
        </div>

        <Card className="border-border-subtle bg-surface-card shadow-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl font-bold text-gray-900">
              {title}
            </CardTitle>
            <CardDescription className="text-xs text-gray-500">
              {description}
            </CardDescription>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </main>
    </div>
  );
}

/**
 * Shared inline destructive alert banner for Backoffice authentication forms.
 */
export function AuthErrorAlert({
  message,
}: {
  readonly message: string | null;
}) {
  if (!message) {
    return null;
  }

  return (
    <Alert
      role="alert"
      variant="destructive"
      className="border-destructive/40 bg-surface-card"
    >
      <AlertCircle className="size-4" aria-hidden="true" />
      <AlertDescription className="text-xs">{message}</AlertDescription>
    </Alert>
  );
}

interface PasswordFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> {
  readonly id: string;
  readonly label: string;
}

/**
 * Accessible password input with an inline visibility toggle button.
 */
export function PasswordField({
  id,
  label,
  className,
  ...props
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs font-semibold text-gray-700">
        {label}
      </Label>
      <div className="relative flex items-center">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          className={
            className ??
            "h-11 bg-surface-warm pr-11 text-sm focus-visible:border-brand-forest"
          }
          {...props}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setVisible((prev) => !prev)}
          aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
          className="absolute right-1.5 size-8 text-gray-500 hover:text-gray-900"
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
        </Button>
      </div>
    </div>
  );
}
