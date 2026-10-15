import { PASSWORD_MAX_LENGTH } from "@coverband/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
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
import { authClient, sessionQuery } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
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

/** Login failure carrying the HTTP status, so the form can explain what went wrong. */
class LoginError extends Error {
  constructor(readonly status: number) {
    super(`Login failed (${status})`);
  }
}

function LoginPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { redirect: target } = Route.useSearch();

  const login = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const { error } = await authClient.signIn.email({ email, password });
      if (error) {
        throw new LoginError(error.status);
      }
    },
    onSuccess: async () => {
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
    if (error instanceof LoginError) {
      if (error.status === 401) return t("login.invalidCredentials");
      if (error.status === 429) return t("login.tooManyAttempts");
    }
    return errorMessage(t, error);
  }

  return (
    <Card className="mx-auto mt-4 max-w-sm">
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
            <Label htmlFor="password">{t("login.password")}</Label>
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
  );
}
