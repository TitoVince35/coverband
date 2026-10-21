import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
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
import { accessQuery } from "@/lib/access";
import { api } from "@/lib/api";
import { ApiRequestError, ensureOk, errorMessage } from "@/lib/errors";
import { safeRedirect } from "@/lib/redirect";

// The beta access code (#148): visitors without it land here instead of the login page.
export const Route = createFileRoute("/access")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => {
    const target = safeRedirect(search.redirect);
    return target ? { redirect: target } : {};
  },
  beforeLoad: async ({ context, search }) => {
    if ((await context.queryClient.ensureQueryData(accessQuery)).granted) {
      throw redirect({ href: search.redirect ?? "/" });
    }
  },
  component: AccessPage,
});

function AccessPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { redirect: target } = Route.useSearch();

  const submit = useMutation({
    mutationFn: async (code: string) => {
      await ensureOk(await api.access.$post({ json: { code } }));
    },
    onSuccess: () => {
      // The server set the cookie: no need to ask it again before leaving.
      queryClient.setQueryData(accessQuery.queryKey, { required: true, granted: true });
      router.history.push(target ?? "/");
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit.mutate(String(new FormData(event.currentTarget).get("code")));
  }

  function submitError(error: Error) {
    if (error instanceof ApiRequestError && error.code === "too_many_requests") {
      return t("access.tooManyAttempts");
    }
    return errorMessage(t, error);
  }

  return (
    <div className="mx-auto mt-4 max-w-sm space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-xl">{t("access.title")}</CardTitle>
          <CardDescription>{t("access.description")}</CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">{t("access.code")}</Label>
              <Input id="code" name="code" autoComplete="off" maxLength={200} required />
            </div>
            {submit.isError && (
              <p role="alert" className="text-destructive text-sm">
                {submitError(submit.error)}
              </p>
            )}
          </CardContent>
          <CardFooter className="mt-6 flex-col items-stretch gap-4">
            <Button type="submit" pending={submit.isPending}>
              {submit.isPending ? t("access.submitting") : t("access.submit")}
            </Button>
            <p className="text-muted-foreground text-xs">{t("access.invited")}</p>
          </CardFooter>
        </form>
      </Card>
      <AppVersion />
    </div>
  );
}
