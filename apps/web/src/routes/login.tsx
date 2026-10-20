import { PASSWORD_MAX_LENGTH } from "@coverband/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { AppVersion } from "@/components/app-version";
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
import { removeUserQueries } from "@/lib/query-client";
import { safeRedirect } from "@/lib/redirect";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => {
    const target = safeRedirect(search.redirect);
    return target ? { redirect: target } : {};
  },
  beforeLoad: async ({ context, search }) => {
    if (await context.queryClient.ensureQueryData(sessionQuery)) {
      throw redirect({ href: search.redirect ?? "/" });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { redirect: target } = Route.useSearch();

  const login = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      ensureAuthOk(await authClient.signIn.email({ email, password }));
    },
    onSuccess: async () => {
      // A previous user's data may still be cached (an expired session doesn't clear it).
      removeUserQueries(queryClient);
      await queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey });
      router.history.push(target ?? "/");
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    login.mutate({ email: String(form.get("email")), password: String(form.get("password")) });
  }

  function loginError(error: Error) {
    if (error instanceof AuthRequestError) {
      if (error.status === 401) return t("login.invalidCredentials");
      if (error.status === 429) return t("login.tooManyAttempts");
    }
    return errorMessage(t, error);
  }

  return (
    <div className="mx-auto mt-4 max-w-sm space-y-4">
      <img src="/logo.svg" alt="" className="mx-auto size-24" />
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-xl">{t("login.title")}</CardTitle>
          <CardDescription>{t("login.description")}</CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t("login.email")}</Label>
              <Input id="email" name="email" type="email" autoComplete="username" required />
            </div>
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor="password">{t("login.password")}</Label>
                <Link
                  to="/forgot-password"
                  className="text-muted-foreground text-xs underline-offset-4 hover:text-foreground hover:underline"
                >
                  {t("login.forgotPassword")}
                </Link>
              </div>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                maxLength={PASSWORD_MAX_LENGTH}
                required
              />
            </div>
            {login.isError && (
              <p role="alert" className="text-destructive text-sm">
                {loginError(login.error)}
              </p>
            )}
          </CardContent>
          <CardFooter className="mt-6 flex-col items-stretch gap-4">
            <Button type="submit" disabled={login.isPending}>
              {login.isPending ? t("login.submitting") : t("login.submit")}
            </Button>
            <p className="text-muted-foreground text-xs">{t("login.invitationOnly")}</p>
          </CardFooter>
        </form>
      </Card>
      <AppVersion />
    </div>
  );
}
