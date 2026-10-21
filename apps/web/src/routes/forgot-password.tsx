import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
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
import { AuthRequestError, authClient, ensureAuthOk } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";

// "Forgot password?" from the login page (#24). The answer is the same whether the email has an
// account or not, so this page never tells who is registered.
export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const { t, i18n } = useTranslation();

  const request = useMutation({
    mutationFn: async (email: string) => {
      ensureAuthOk(
        await authClient.requestPasswordReset({
          email,
          // The email is written in the app's current language.
          fetchOptions: { headers: { "Accept-Language": i18n.language } },
        }),
      );
      return email;
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    request.mutate(String(new FormData(event.currentTarget).get("email")));
  }

  function requestError(error: Error) {
    if (error instanceof AuthRequestError && error.status === 429) {
      return t("login.tooManyAttempts");
    }
    return errorMessage(t, error);
  }

  return (
    <Card className="mx-auto mt-4 max-w-sm">
      <CardHeader>
        <CardTitle className="font-heading text-xl">{t("forgotPassword.title")}</CardTitle>
        <CardDescription>{t("forgotPassword.description")}</CardDescription>
      </CardHeader>
      {request.isSuccess ? (
        <CardContent className="space-y-4">
          <p role="status" className="text-sm">
            {t("forgotPassword.sent", { email: request.data })}
          </p>
          <Button asChild variant="outline" className="w-full">
            <Link to="/login">{t("forgotPassword.backToLogin")}</Link>
          </Button>
        </CardContent>
      ) : (
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t("login.email")}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                required
                autoFocus
              />
            </div>
            {request.isError && (
              <p role="alert" className="text-destructive text-sm">
                {requestError(request.error)}
              </p>
            )}
          </CardContent>
          <CardFooter className="mt-6 flex-col items-stretch gap-2">
            <Button type="submit" pending={request.isPending}>
              {request.isPending ? t("forgotPassword.submitting") : t("forgotPassword.submit")}
            </Button>
            <Button asChild variant="ghost">
              <Link to="/login">{t("forgotPassword.backToLogin")}</Link>
            </Button>
          </CardFooter>
        </form>
      )}
    </Card>
  );
}
