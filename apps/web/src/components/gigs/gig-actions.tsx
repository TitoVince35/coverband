import { GIG_MAX_LENGTH } from "@coverband/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Ban, CalendarClock, EllipsisVertical, Eye, Pencil, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/i18n/use-language";
import { sessionQuery } from "@/lib/auth";
import { bandQuery } from "@/lib/bands";
import { errorMessage } from "@/lib/errors";
import { formatShortGigDate } from "@/lib/gig-format";
import { gigName, gigRights } from "@/lib/gig-rules";
import { cancelGig, deleteGig, type GigSummary, postponeGig } from "@/lib/gigs";
import { useOnline } from "@/lib/online";

/** The member's rights on a gig now (`gigRights`): its creator or a band leader manage it. */
export function useGigRights(
  bandSlug: string,
  gig: { status: string; date: string; createdById: string | null },
) {
  const isLeader = useQuery(bandQuery(bandSlug)).data?.membership.role === "leader";
  const userId = useQuery(sessionQuery).data?.user.id;
  return gigRights(gig, { userId, isLeader });
}

/** An action's line: its label, and what it does or why it can't, under it. */
function ActionText({ label, hint }: { label: string; hint?: string | undefined }) {
  return (
    <span className="flex min-w-0 flex-col">
      {label}
      {hint && <span className="whitespace-normal text-muted-foreground text-xs">{hint}</span>}
    </span>
  );
}

/**
 * A gig's actions (#327), from its row in the list (with View) or its compact view's header:
 * Edit, Postpone (back to proposed, then the form on its date), Cancel (asks the reason), Delete
 * (asks first; a settled gig is cancelled first). Each is shown or explained by the rules
 * (`gigRights`): the last three are its creator's or a band leader's.
 */
export function GigActions({
  bandSlug,
  gig,
  withView = false,
  onDeleted,
}: {
  bandSlug: string;
  gig: GigSummary;
  withView?: boolean;
  /** Deleting from the gig's own page goes back to the list. */
  onDeleted?: () => void;
}) {
  const { t } = useTranslation();
  const language = useLanguage();
  const online = useOnline();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const rights = useGigRights(bandSlug, gig);
  const [cancelling, setCancelling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const name = gigName(gig);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["bands", bandSlug] });
  const params = { bandSlug, gigId: gig.id };

  const postpone = useMutation({
    networkMode: "always",
    mutationFn: () => postponeGig(bandSlug, gig.id),
    onSuccess: async () => {
      toast.success(t("gigs.postpone.done"));
      await refresh();
      // The form, on the date to change.
      await navigate({ to: "/b/$bandSlug/gigs/$gigId/edit", params, search: { focus: "date" } });
    },
    onError: (error) => toast.error(errorMessage(t, error)),
  });

  const remove = useMutation({
    networkMode: "always",
    mutationFn: () => deleteGig(bandSlug, gig.id),
    onSuccess: async () => {
      toast.success(t("gigs.delete.done"));
      if (onDeleted) onDeleted();
      // After leaving its page: its own query would refetch a 404.
      queryClient.removeQueries({ queryKey: ["bands", bandSlug, "gigs", gig.id] });
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(t, error)),
  });

  const when = [formatShortGigDate(gig.date, language, new Date().getFullYear()), gig.venue?.city]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("gigs.actions.label", { name })}
            pending={postpone.isPending || remove.isPending}
          >
            <EllipsisVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72 max-w-[calc(100vw-2rem)]">
          <DropdownMenuLabel className="space-y-0.5">
            <span className="block truncate font-semibold">{name}</span>
            <span className="block font-normal text-muted-foreground text-xs">
              {when} · {t(`gigs.status.${gig.status}`)}
              {gig.createdBy && ` · ${t("gigs.actions.createdBy", { name: gig.createdBy })}`}
            </span>
            {!rights.manager && (
              <span className="block whitespace-normal font-normal text-muted-foreground text-xs">
                {t("gigs.actions.managersOnly")}
              </span>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {withView && (
            <DropdownMenuItem onSelect={() => navigate({ to: "/b/$bandSlug/gigs/$gigId", params })}>
              <Eye />
              {t("gigs.actions.view")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            disabled={!online || !rights.edit}
            onSelect={() => navigate({ to: "/b/$bandSlug/gigs/$gigId/edit", params })}
          >
            <Pencil />
            <ActionText
              label={t("gigs.edit.button")}
              hint={
                gig.status === "cancelled"
                  ? t("gigs.actions.cancelledHint")
                  : rights.past
                    ? t("gigs.actions.pastHint")
                    : gig.status === "settled"
                      ? t("gigs.actions.settledEditHint")
                      : undefined
              }
            />
          </DropdownMenuItem>
          {rights.postpone && (
            <DropdownMenuItem disabled={!online} onSelect={() => postpone.mutate()}>
              <CalendarClock />
              <ActionText label={t("gigs.postpone.button")} hint={t("gigs.postpone.hint")} />
            </DropdownMenuItem>
          )}
          {rights.cancel && (
            <DropdownMenuItem
              variant="destructive"
              disabled={!online}
              onSelect={() => setCancelling(true)}
            >
              <Ban />
              <ActionText label={t("gigs.cancel.button")} hint={t("gigs.cancel.hint")} />
            </DropdownMenuItem>
          )}
          {rights.manager && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={!online || !rights.delete}
                onSelect={() => setDeleting(true)}
              >
                <Trash2 />
                <ActionText
                  label={t("gigs.delete.button")}
                  hint={rights.delete ? undefined : t("gigs.delete.settledHint")}
                />
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <CancelGigDialog
        bandSlug={bandSlug}
        gig={gig}
        open={cancelling}
        onOpenChange={setCancelling}
        description={when}
      />
      <DeleteGigDialog
        name={name}
        open={deleting}
        onOpenChange={setDeleting}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}

/** Cancelling a gig (#327): asks for the reason, kept with the gig and shown at its top. */
export function CancelGigDialog({
  bandSlug,
  gig,
  open,
  onOpenChange,
  description,
}: {
  bandSlug: string;
  gig: GigSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  description: string;
}) {
  const { t } = useTranslation();
  const id = useId();
  const online = useOnline();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const cancel = useMutation({
    networkMode: "always",
    mutationFn: () => cancelGig(bandSlug, gig.id, reason.trim()),
    onSuccess: async () => {
      toast.success(t("gigs.cancel.done"));
      onOpenChange(false);
      setReason("");
      await queryClient.invalidateQueries({ queryKey: ["bands", bandSlug] });
    },
    onError: (error) => toast.error(errorMessage(t, error)),
  });
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">
            {t("gigs.cancel.title", { name: gigName(gig) })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {description}. {t("gigs.cancel.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-reason`}>{t("gigs.cancel.reason")}</Label>
          <Textarea
            id={`${id}-reason`}
            rows={3}
            value={reason}
            maxLength={GIG_MAX_LENGTH.cancelReason}
            onChange={(event) => setReason(event.target.value)}
          />
          <p className="text-muted-foreground text-xs">{t("gigs.cancel.reasonHint")}</p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("gigs.cancel.keep")}</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={!reason.trim() || !online}
            pending={cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            {t("gigs.cancel.confirm")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Deleting a gig, confirmed: its venue and contacts stay in the band's lists. */
export function DeleteGigDialog({
  name,
  open,
  onOpenChange,
  onConfirm,
}: {
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">
            {t("gigs.delete.title", { name })}
          </AlertDialogTitle>
          <AlertDialogDescription>{t("gigs.delete.description")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            {t("gigs.delete.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
