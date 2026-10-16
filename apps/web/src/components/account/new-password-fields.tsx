import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@coverband/shared";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * New password typed twice (onboarding, reset and change forms), read from the form data as
 * `newPassword` and `confirmPassword` with readNewPassword. The form checks they match and passes
 * `mismatch`.
 */
export function NewPasswordFields({
  mismatch,
  onChange,
  defaultValue,
  labels,
  autoFocus = false,
}: {
  mismatch: boolean;
  onChange: () => void;
  /** Pre-filled in both fields (the onboarding wizard keeps it when going back). */
  defaultValue?: string;
  /** Defaults to "New password" / "Confirm the new password". */
  labels?: { password: string; confirm: string };
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`${id}-new`}>{labels?.password ?? t("password.new")}</Label>
        <Input
          id={`${id}-new`}
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          maxLength={PASSWORD_MAX_LENGTH}
          defaultValue={defaultValue}
          onChange={onChange}
          autoFocus={autoFocus}
          required
        />
        <p className="text-muted-foreground text-xs">
          {t("password.hint", { min: PASSWORD_MIN_LENGTH })}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-confirm`}>{labels?.confirm ?? t("password.confirm")}</Label>
        <Input
          id={`${id}-confirm`}
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          maxLength={PASSWORD_MAX_LENGTH}
          defaultValue={defaultValue}
          onChange={onChange}
          aria-invalid={mismatch ? true : undefined}
          required
        />
        {mismatch && (
          <p role="alert" className="text-destructive text-xs">
            {t("password.mismatch")}
          </p>
        )}
      </div>
    </>
  );
}

/** Reads both fields of NewPasswordFields; `null` when they don't match. */
export function readNewPassword(form: FormData): string | null {
  const password = String(form.get("newPassword"));
  return password === String(form.get("confirmPassword")) ? password : null;
}
