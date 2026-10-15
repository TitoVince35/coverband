import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEFAULT_LANGUAGE, isLanguage, LANGUAGES, type Language } from "@/i18n/languages";
import { adminInvitationsQuery } from "@/lib/admin";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/errors";

export function InviteLeaderForm() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  // The email's language defaults to the admin's own language, and follows it until changed.
  const adminLanguage = isLanguage(i18n.resolvedLanguage)
    ? i18n.resolvedLanguage
    : DEFAULT_LANGUAGE;
  const [chosen, setChosen] = useState<Language | null>(null);
  const language = chosen ?? adminLanguage;

  const invite = useMutation({
    mutationFn: async (email: string) =>
      ensureOk(await api.admin.invitations.$post({ json: { email, language } })),
    onSuccess: (_res, email) => {
      toast.success(t("admin.invite.sent", { email }));
      void queryClient.invalidateQueries({ queryKey: adminInvitationsQuery.queryKey });
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = String(new FormData(form).get("email"));
    invite.mutate(email, {
      onSuccess: () => {
        form.reset();
        setChosen(null);
      },
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-lg">{t("admin.invite.title")}</CardTitle>
        <CardDescription>{t("admin.invite.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <Label htmlFor="invite-email">{t("admin.invite.email")}</Label>
              <Input
                id="invite-email"
                name="email"
                type="email"
                autoComplete="off"
                required
                onChange={() => invite.isError && invite.reset()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-language">{t("admin.invite.language")}</Label>
              <Select
                value={language}
                onValueChange={(value) => isLanguage(value) && setChosen(value)}
              >
                <SelectTrigger id="invite-language" className="w-full sm:w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(LANGUAGES).map(([code, name]) => (
                    <SelectItem key={code} value={code} lang={code}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {invite.isError && (
            <p role="alert" className="text-destructive text-sm">
              {errorMessage(t, invite.error)}
            </p>
          )}
          <Button type="submit" disabled={invite.isPending} className="w-full sm:w-auto">
            {invite.isPending ? t("admin.invite.sending") : t("admin.invite.submit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
