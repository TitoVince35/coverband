import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
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
import { AuthRequestError, authClient, ensureAuthOk } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { clearUserData } from "@/lib/query-client";

// Opened from the password reset email (#24). The email's link goes through the API, which checks
// the token and redirects here with `?token=...`, or `?error=INVALID_TOKEN` when it is used or expired.
export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>): { token?: string } =>
    typeof search.token === "string" && search.token && !search.error
      ? { token: search.token }
      : {},
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { token } = Route.useSearch();
  const [mismatch, setMismatch] = useState(false);

  const reset = useMutation({
    mutationFn: async (newPassword: string) => {
      ensureAuthOk(await authClient.resetPassword({ newPassword, token: token ?? "" }));
    },
    onSuccess: async () => {
      // Every session of the account was revoked, including this device's if it was logged in.
      clearUserData(queryClient);
      toast.success(t("resetPassword.done"));
      await router.navigate({ to: "/login" });
    },
  });

  const invalidLink =
    !token || (reset.error instanceof AuthRequestError && reset.error.code === "INVALID_TOKEN");

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = readNewPassword(new FormData(event.currentTarget));
    if (password === null) {
      setMismatch(true);
    } else {
      reset.mutate(password);
    }
  }

  function resetError(error: Error) {
    if (error instanceof AuthRequestError && error.status === 429) {
      return t("login.tooManyAttempts");
    }
    return errorMessage(t, error);
  }

  return (
    <Card className="mx-auto mt-4 max-w-sm">
      <CardHeader>
        <CardTitle className="font-heading text-xl">{t("resetPassword.title")}</CardTitle>
        {!invalidLink && <CardDescription>{t("resetPassword.description")}</CardDescription>}
      </CardHeader>
      {invalidLink ? (
        <CardContent className="space-y-4">
          <p role="alert" className="text-sm">
            {t("resetPassword.invalidLink")}
          </p>
          <Button asChild className="w-full">
            <Link to="/forgot-password">{t("resetPassword.requestNew")}</Link>
          </Button>
        </CardContent>
      ) : (
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            <NewPasswordFields mismatch={mismatch} onChange={() => setMismatch(false)} />
            {reset.isError && (
              <p role="alert" className="text-destructive text-sm">
                {resetError(reset.error)}
              </p>
            )}
          </CardContent>
          <CardFooter className="mt-6 flex-col items-stretch">
            <Button type="submit" disabled={reset.isPending}>
              {reset.isPending ? t("resetPassword.submitting") : t("resetPassword.submit")}
            </Button>
          </CardFooter>
        </form>
      )}
    </Card>
  );
}
