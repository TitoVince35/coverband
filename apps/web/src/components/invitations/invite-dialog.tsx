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
import { errorMessage } from "@/lib/errors";
import { useOnline } from "@/lib/online";

export type InviteDialogProps = {
  /** Tooltip and accessible name of the "+" button. */
  label: string;
  title: string;
  description: string;
  /** Sends the invitation; throws an ApiRequestError on refusal. */
  invite: (input: { email: string; language: Language }) => Promise<unknown>;
  /** Query refreshed once sent (the pending invitations). */
  invalidates: readonly unknown[];
};

/**
 * Big "+" button opening an invitation form (email and email language) in a modal. Used by
 * admins for band leaders and by band leaders for musicians.
 */
export function InviteDialog({
  label,
  title,
  description,
  invite: send,
  invalidates,
}: InviteDialogProps) {
  const { t, i18n } = useTranslation();
  // Offline, the app is read-only (#165).
  const online = useOnline();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  // The email's language defaults to the inviter's own language, and follows it until changed.
  const ownLanguage = isLanguage(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LANGUAGE;
  const [chosen, setChosen] = useState<Language | null>(null);
  const language = chosen ?? ownLanguage;

  const invite = useMutation({
    mutationFn: (email: string) => send({ email, language }),
    onSuccess: (_res, email) => {
      toast.success(t("invitations.sent", { email }));
      void queryClient.invalidateQueries({ queryKey: invalidates });
      onOpenChange(false);
    },
  });

  // Every opening starts fresh: empty email, the inviter's language, no error.
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
          <DialogTrigger asChild disabled={!online}>
            <Button size="icon-lg" className="size-12 rounded-full" aria-label={label}>
              <Plus className="size-6" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent side="left">{label}</TooltipContent>
      </Tooltip>
      <DialogContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="font-heading">{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="invite-email">{t("invitations.email")}</Label>
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
            <Label htmlFor="invite-language">{t("invitations.language")}</Label>
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
              {invite.isPending ? t("invitations.sending") : t("invitations.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
