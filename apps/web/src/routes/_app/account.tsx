import { PASSWORD_MAX_LENGTH } from "@coverband/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { NewPasswordFields, readNewPassword } from "@/components/account/new-password-fields";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthRequestError, authClient, ensureAuthOk, sessionQuery } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";

// The logged-in user's account. For now: changing the password (#24).
export const Route = createFileRoute("/_app/account")({
  component: AccountPage,
});

function AccountPage() {
  const { t } = useTranslation();
  const { user } = Route.useRouteContext();

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-bold text-2xl tracking-tight">{t("account.title")}</h1>
        <p className="text-muted-foreground">
          {user.name} · {user.email}
        </p>
      </div>
      <ChangePasswordCard />
    </section>
  );
}

function ChangePasswordCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [mismatch, setMismatch] = useState(false);

  const change = useMutation({
    mutationFn: async ({ form, ...body }: { form: HTMLFormElement } & PasswordChange) => {
      // Other devices are logged out; this one gets a new session cookie.
      ensureAuthOk(await authClient.changePassword({ ...body, revokeOtherSessions: true }));
      return form;
    },
    onSuccess: async (form) => {
      form.reset();
      toast.success(t("account.changePassword.done"));
      await queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey });
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const newPassword = readNewPassword(form);
    if (newPassword === null) {
      setMismatch(true);
      return;
    }
    change.mutate({
      form: event.currentTarget,
      currentPassword: String(form.get("currentPassword")),
      newPassword,
    });
  }

  function changeError(error: Error) {
    if (error instanceof AuthRequestError) {
      if (error.code === "INVALID_PASSWORD") return t("account.changePassword.wrongCurrent");
      if (error.status === 429) return t("login.tooManyAttempts");
    }
    return errorMessage(t, error);
  }

  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle className="font-heading text-lg">{t("account.changePassword.title")}</CardTitle>
        <CardDescription>{t("account.changePassword.description")}</CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">{t("password.current")}</Label>
            <Input
              id="current-password"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              maxLength={PASSWORD_MAX_LENGTH}
              required
            />
          </div>
          <NewPasswordFields mismatch={mismatch} onChange={() => setMismatch(false)} />
          {change.isError && (
            <p role="alert" className="text-destructive text-sm">
              {changeError(change.error)}
            </p>
          )}
        </CardContent>
        <CardFooter className="mt-6 flex-col items-stretch">
          <Button type="submit" disabled={change.isPending}>
            {change.isPending
              ? t("account.changePassword.submitting")
              : t("account.changePassword.submit")}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

type PasswordChange = { currentPassword: string; newPassword: string };
