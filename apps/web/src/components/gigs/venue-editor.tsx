import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ContactDialog } from "@/components/gigs/contact-dialog";
import { ContactLine } from "@/components/gigs/gig-contacts";
import { GigStatusBadge } from "@/components/gigs/gig-status";
import {
  emptyVenueFields,
  VenueDetailsFields,
  type VenueFields,
  venueFields,
} from "@/components/gigs/venue-field";
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
import { useLanguage } from "@/i18n/use-language";
import { errorMessage } from "@/lib/errors";
import { formatShortGigDate } from "@/lib/gig-format";
import { gigName } from "@/lib/gig-rules";
import {
  type BandContact,
  createVenue,
  deleteVenue,
  updateVenue,
  type VenueDetails,
} from "@/lib/gigs";
import { useKeyboardUp } from "@/lib/keyboard";
import { useOnline } from "@/lib/online";
import { cn } from "@/lib/utils";

/**
 * A venue's page (#334): every field, its map, its contacts, its gigs; Save stays at the bottom,
 * with Delete (only when no gig uses it). A new venue (none given) opens its page once saved.
 */
export function VenueEditor({ bandSlug, venue }: { bandSlug: string; venue?: VenueDetails }) {
  const { t } = useTranslation();
  const online = useOnline();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const keyboardUp = useKeyboardUp();
  const [fields, setFields] = useState<VenueFields>(() =>
    venue ? venueFields(venue) : emptyVenueFields(),
  );
  const [deleting, setDeleting] = useState(false);
  const set = (patch: Partial<VenueFields>) => setFields((current) => ({ ...current, ...patch }));
  const missing = !fields.name.trim() ? "venueName" : !fields.city.trim() ? "venueCity" : null;
  const used = venue?.gigList.length ?? 0;

  const save = useMutation({
    networkMode: "always",
    mutationFn: () => {
      const input = {
        name: fields.name.trim(),
        city: fields.city.trim(),
        address: fields.address.trim() || null,
        links: fields.links,
        description: fields.description.trim() || null,
        contactIds: fields.contacts.map((contact) => contact.id),
        ...(fields.pinMoved && fields.latitude !== null && fields.longitude !== null
          ? { coordinates: { latitude: fields.latitude, longitude: fields.longitude } }
          : {}),
      };
      return venue ? updateVenue(bandSlug, venue.id, input) : createVenue(bandSlug, input);
    },
    onSuccess: async (saved) => {
      toast.success(t("gigs.venues.saved"));
      await queryClient.invalidateQueries({ queryKey: ["bands", bandSlug] });
      if (saved && !venue) {
        await navigate({
          to: "/b/$bandSlug/venues/$venueId",
          params: { bandSlug, venueId: saved.id },
          replace: true,
        });
      }
    },
    onError: (error) => toast.error(errorMessage(t, error)),
  });

  const remove = useMutation({
    networkMode: "always",
    mutationFn: () => deleteVenue(bandSlug, venue?.id ?? ""),
    onSuccess: async () => {
      toast.success(t("gigs.venues.deleted"));
      await navigate({ to: "/b/$bandSlug/venues", params: { bandSlug } });
      queryClient.removeQueries({ queryKey: ["bands", bandSlug, "venues", venue?.id] });
      await queryClient.invalidateQueries({ queryKey: ["bands", bandSlug] });
    },
    onError: (error) => toast.error(errorMessage(t, error)),
  });

  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        // A dialog's own form (a contact) reaches here through its portal.
        if (event.target !== event.currentTarget) return;
        if (!missing) save.mutate();
      }}
    >
      <div className="space-y-3">
        <VenueDetailsFields fields={fields} onChange={set} isNew={!venue} />
        {venue && <p className="text-muted-foreground text-xs">{t("gigs.venues.sharedHint")}</p>}
      </div>
      <VenueContactsField
        bandSlug={bandSlug}
        contacts={fields.contacts}
        onChange={(contacts) => set({ contacts })}
      />
      {venue && <VenueGigs bandSlug={bandSlug} venue={venue} />}

      <div
        className={cn(
          "sticky z-10 -mx-4 flex flex-wrap items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur",
          keyboardUp
            ? "bottom-0"
            : "bottom-[calc(3.25rem+env(safe-area-inset-bottom))] sm:bottom-0",
        )}
      >
        {venue && (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive"
            disabled={!online || used > 0}
            pending={remove.isPending}
            onClick={() => setDeleting(true)}
          >
            <Trash2 />
            {t("gigs.venues.delete")}
          </Button>
        )}
        <p
          className={cn(
            "min-w-0 flex-1 text-sm",
            missing ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground",
          )}
          aria-live="polite"
        >
          {missing
            ? t(`gigs.form.missing.${missing}`)
            : used > 0
              ? t("gigs.venues.inUse", { count: used })
              : null}
        </p>
        <Button type="submit" disabled={missing !== null || !online} pending={save.isPending}>
          {t("common.save")}
        </Button>
      </div>
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="break-words">
              {t("gigs.venues.deleteTitle", { name: venue?.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t("gigs.venues.deleteDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => remove.mutate()}>
              {t("gigs.venues.deleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

/** A venue's usual people (#334): each opens its dialog (Remove from the venue); Add contact. */
function VenueContactsField({
  bandSlug,
  contacts,
  onChange,
}: {
  bandSlug: string;
  contacts: readonly BandContact[];
  onChange: (contacts: BandContact[]) => void;
}) {
  const { t } = useTranslation();
  const online = useOnline();
  const [dialog, setDialog] = useState<{ contact?: BandContact; key: number } | null>(null);
  return (
    <section className="space-y-2" aria-label={t("gigs.contacts.title")}>
      <h3 className="font-heading font-semibold text-base">{t("gigs.contacts.title")}</h3>
      {contacts.length > 0 ? (
        <ul>
          {contacts.map((contact) => (
            <li key={contact.id}>
              <button
                type="button"
                className="flex min-h-11 w-full items-center rounded-lg px-1 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setDialog({ contact, key: Date.now() })}
              >
                <ContactLine contact={contact} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{t("gigs.venues.noContact")}</p>
      )}
      <Button
        type="button"
        variant="outline"
        disabled={!online}
        onClick={() => setDialog({ key: Date.now() })}
      >
        <Plus />
        {t("gigs.contacts.addButtonLong")}
      </Button>
      {dialog && (
        <ContactDialog
          key={dialog.key}
          bandSlug={bandSlug}
          open
          onOpenChange={(open) => !open && setDialog(null)}
          contact={dialog.contact}
          place="venue"
          onDone={(saved) =>
            onChange(
              contacts.some((item) => item.id === saved.id)
                ? contacts.map((item) => (item.id === saved.id ? saved : item))
                : [...contacts, saved],
            )
          }
          onRemove={
            dialog.contact
              ? () => onChange(contacts.filter((item) => item.id !== dialog.contact?.id))
              : undefined
          }
        />
      )}
    </section>
  );
}

/** The gigs at a venue (#334), the latest first, each opening its compact view. */
function VenueGigs({ bandSlug, venue }: { bandSlug: string; venue: VenueDetails }) {
  const { t } = useTranslation();
  const language = useLanguage();
  const thisYear = new Date().getFullYear();
  return (
    <section className="space-y-2" aria-label={t("gigs.venues.gigsHere")}>
      <h3 className="font-heading font-semibold text-base">{t("gigs.venues.gigsHere")}</h3>
      {venue.gigList.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("gigs.venues.noGig")}</p>
      ) : (
        <ul className="divide-y">
          {venue.gigList.map((gig) => (
            <li key={gig.id}>
              <Link
                to="/b/$bandSlug/gigs/$gigId"
                params={{ bandSlug, gigId: gig.id }}
                className="flex min-h-11 items-center gap-3 rounded-lg px-1 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="shrink-0 text-muted-foreground text-sm tabular-nums">
                  {formatShortGigDate(gig.date, language, thisYear)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {gigName({ title: gig.title, venue })}
                </span>
                <GigStatusBadge status={gig.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
