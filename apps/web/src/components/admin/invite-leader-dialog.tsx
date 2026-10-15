import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DEFAULT_LANGUAGE, isLanguage, LANGUAGES, type Language } from "@/i18n/languages";
import { adminInvitationsQuery } from "@/lib/admin";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/errors";

/** Big "+" button opening the band leader invitation form in a modal. */
export function InviteLeaderDialog() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
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
      onOpenChange(false);
    },
  });

  // Every opening starts fresh: empty email, the admin's language, no error.
  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setChosen(null);
      invite.reset();
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    invite.mutate(String(new FormData(event.currentTarget).get("email")));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button
              size="icon-lg"
              className="size-12 rounded-full"
              aria-label={t("admin.invite.new")}
            >
              <Plus className="size-6" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent side="left">{t("admin.invite.new")}</TooltipContent>
      </Tooltip>
      <DialogContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="font-heading">{t("admin.invite.title")}</DialogTitle>
            <DialogDescription>{t("admin.invite.description")}</DialogDescription>
          </DialogHeader>
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
              <SelectTrigger id="invite-language" className="w-full">
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
          {invite.isError && (
            <p role="alert" className="text-destructive text-sm">
              {errorMessage(t, invite.error)}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={invite.isPending}>
              {invite.isPending ? t("admin.invite.sending") : t("admin.invite.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
