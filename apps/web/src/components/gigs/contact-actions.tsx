import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EllipsisVertical, Merge, Pencil, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { usage } from "@/components/gigs/contact-dialog";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/errors";
import {
  type BandContactInput,
  type BandContactSummary,
  bandContactsQuery,
  deleteBandContact,
  mergeBandContacts,
} from "@/lib/gigs";
import { useOnline } from "@/lib/online";
import { cn } from "@/lib/utils";

/** A contact's actions on the contacts page (#334): Edit, Merge with…, Delete. */
export function ContactActions({
  bandSlug,
  contact,
  onEdit,
}: {
  bandSlug: string;
  contact: BandContactSummary;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const online = useOnline();
  const [merging, setMerging] = useState(false);
  const [deleting, setDeleting] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("gigs.contacts.actions", { name: contact.name })}
          >
            <EllipsisVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuItem disabled={!online} onSelect={onEdit}>
            <Pencil />
            {t("gigs.contacts.edit")}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!online} onSelect={() => setMerging(true)}>
            <Merge />
            {t("gigs.contacts.merge")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={!online}
            onSelect={() => setDeleting(true)}
          >
            <Trash2 />
            {t("gigs.contacts.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {merging && (
        <MergeContactsDialog
          bandSlug={bandSlug}
          contact={contact}
          onClose={() => setMerging(false)}
        />
      )}
      <DeleteContactDialog
        bandSlug={bandSlug}
        contact={contact}
        open={deleting}
        onOpenChange={setDeleting}
      />
    </>
  );
}

const DETAILS = ["name", "type", "phone", "email", "notes"] as const;

/**
 * Merging two contacts (#334), the same person entered twice: the other one, then for each detail
 * which one to keep; the other contact is deleted, its gigs and venues listing this one.
 */
function MergeContactsDialog({
  bandSlug,
  contact,
  onClose,
}: {
  bandSlug: string;
  contact: BandContactSummary;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const online = useOnline();
  const queryClient = useQueryClient();
  const others = (useQuery(bandContactsQuery(bandSlug)).data ?? []).filter(
    (other) => other.id !== contact.id,
  );
  const [otherId, setOtherId] = useState(() => likelyTwin(contact, others)?.id ?? "");
  const other = others.find((candidate) => candidate.id === otherId);
  // For each detail: this contact's ("mine") or the other's; an empty one never wins.
  const [keep, setKeep] = useState<Partial<Record<(typeof DETAILS)[number], "mine" | "other">>>({});
  const choice = (detail: (typeof DETAILS)[number]) =>
    keep[detail] ?? (contact[detail] ? "mine" : other?.[detail] ? "other" : "mine");
  const shown = (value: string | null, detail: (typeof DETAILS)[number]) =>
    !value
      ? t("gigs.contacts.none")
      : detail === "type"
        ? t(`gigs.contacts.types.${value as BandContactSummary["type"]}`)
        : value;

  const merge = useMutation({
    networkMode: "always",
    mutationFn: () => {
      if (!other) throw new Error("No other contact");
      const pick = <K extends (typeof DETAILS)[number]>(detail: K) =>
        (choice(detail) === "mine" ? contact : other)[detail];
      const details: BandContactInput = {
        name: pick("name"),
        type: pick("type"),
        phone: pick("phone"),
        email: pick("email"),
        notes: pick("notes"),
      };
      return mergeBandContacts(bandSlug, contact.id, other.id, details);
    },
    onSuccess: async () => {
      toast.success(t("gigs.contacts.merged"));
      await queryClient.invalidateQueries({ queryKey: ["bands", bandSlug] });
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && !merge.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="break-words">
            {t("gigs.contacts.mergeTitle", { name: contact.name })}
          </DialogTitle>
          <DialogDescription>{t("gigs.contacts.mergeHint")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-other`}>{t("gigs.contacts.other")}</Label>
          <select
            id={`${id}-other`}
            value={otherId}
            onChange={(event) => {
              setOtherId(event.target.value);
              setKeep({});
            }}
            className="h-10 w-full rounded-4xl border border-input bg-input/30 px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm"
          >
            <option value="">{t("gigs.contacts.chooseOther")}</option>
            {others.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {[candidate.name, t(`gigs.contacts.types.${candidate.type}`), candidate.phone]
                  .filter(Boolean)
                  .join(" · ")}
              </option>
            ))}
          </select>
        </div>
        {other && (
          <fieldset className="space-y-2">
            <legend className="mb-2 font-medium text-sm">{t("gigs.contacts.keep")}</legend>
            {DETAILS.map((detail) => (
              <div key={detail} className="space-y-1">
                <p className="text-muted-foreground text-xs">
                  {t(`gigs.contacts.details.${detail}`)}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(["mine", "other"] as const).map((side) => (
                    <label
                      key={side}
                      className={cn(
                        "flex min-h-10 min-w-0 cursor-pointer items-center gap-2 rounded-lg border px-2 text-sm has-focus-visible:ring-2 has-focus-visible:ring-ring",
                        choice(detail) === side && "border-primary bg-primary/10",
                      )}
                    >
                      <input
                        type="radio"
                        name={`${id}-${detail}`}
                        className="accent-primary"
                        checked={choice(detail) === side}
                        onChange={() => setKeep((current) => ({ ...current, [detail]: side }))}
                      />
                      <span className="min-w-0 truncate">
                        {shown((side === "mine" ? contact : other)[detail], detail)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <p className="text-muted-foreground text-xs">
              {t("gigs.contacts.mergeResult", {
                gigs: contact.gigs + other.gigs,
                venues: contact.venues.length + other.venues.length,
              })}
            </p>
          </fieldset>
        )}
        {merge.isError && (
          <p role="alert" className="text-destructive text-sm">
            {errorMessage(t, merge.error)}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={merge.isPending} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!other || !online}
            pending={merge.isPending}
            onClick={() => merge.mutate()}
          >
            {t("gigs.contacts.mergeConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The contact most likely the same person: the same phone or email, else a name containing it. */
export function likelyTwin<T extends { name: string; phone: string | null; email: string | null }>(
  contact: T,
  others: readonly T[],
) {
  const digits = (phone: string | null) => phone?.replace(/\D/g, "") ?? "";
  return (
    others.find(
      (other) =>
        (digits(other.phone) !== "" && digits(other.phone) === digits(contact.phone)) ||
        (other.email !== null && other.email.toLowerCase() === contact.email?.toLowerCase()),
    ) ??
    others.find((other) => {
      const a = other.name.toLowerCase();
      const b = contact.name.toLowerCase();
      return a.includes(b) || b.includes(a);
    })
  );
}

/**
 * Deleting a contact (#334), confirmed: removed from every gig and venue, their details deleted
 * for everyone in the band; merging is offered instead for a person entered twice.
 */
function DeleteContactDialog({
  bandSlug,
  contact,
  open,
  onOpenChange,
}: {
  bandSlug: string;
  contact: BandContactSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const remove = useMutation({
    networkMode: "always",
    mutationFn: () => deleteBandContact(bandSlug, contact.id),
    onSuccess: async () => {
      toast.success(t("gigs.contacts.deleted"));
      await queryClient.invalidateQueries({ queryKey: ["bands", bandSlug] });
    },
    onError: (error) => toast.error(errorMessage(t, error)),
  });
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">
            {t("gigs.contacts.deleteTitle", { name: contact.name })}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span className="block">
              {t("gigs.contacts.deleteDescription", { where: usage(t, contact) })}
            </span>
            <span className="block">{t("gigs.contacts.deleteMergeHint")}</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => remove.mutate()}>
            {t("gigs.contacts.deleteConfirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
