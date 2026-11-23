import { telHref } from "@coverband/shared";
import { Mail, Phone, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ContactDialog, type ContactPlace } from "@/components/gigs/contact-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { BandContact } from "@/lib/gigs";
import { useOnline } from "@/lib/online";

/** A contact on one line: its type as a badge, then name, phone and email. */
export function ContactLine({ contact }: { contact: BandContact }) {
  const { t } = useTranslation();
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <Badge variant="secondary" className="shrink-0">
        {t(`gigs.contacts.types.${contact.type}`)}
      </Badge>
      <span className="min-w-0 truncate text-sm">
        <span className="font-medium">{contact.name}</span>
        {contact.phone && <span className="text-muted-foreground"> · {contact.phone}</span>}
        {contact.email && <span className="text-muted-foreground"> · {contact.email}</span>}
      </span>
    </span>
  );
}

/**
 * The gig form's contacts (#329): its venue's ("From the venue", every gig there) then its own
 * ("This gig"), each opening its dialog; "Add contact" (all there is while there's none). The
 * title shows once there's one.
 */
export function GigContactsField({
  bandSlug,
  venueName,
  venueContacts,
  gigContacts,
  onVenueContacts,
  onGigContacts,
}: {
  bandSlug: string;
  /** The gig's venue, when it has one. */
  venueName: string | null;
  venueContacts: readonly BandContact[];
  gigContacts: readonly BandContact[];
  onVenueContacts: (contacts: BandContact[]) => void;
  onGigContacts: (contacts: BandContact[]) => void;
}) {
  const { t } = useTranslation();
  const online = useOnline();
  // The dialog: a new contact, or one being edited where it's listed.
  const [dialog, setDialog] = useState<{
    contact?: BandContact;
    place: ContactPlace;
    key: number;
  } | null>(null);
  const shown = venueName ? venueContacts : [];
  const empty = shown.length === 0 && gigContacts.length === 0;

  const put = (list: readonly BandContact[], contact: BandContact) =>
    list.some((item) => item.id === contact.id)
      ? list.map((item) => (item.id === contact.id ? contact : item))
      : [...list, contact];

  const done = (contact: BandContact, place: ContactPlace) => {
    // Its details may have changed: shown fresh wherever it's listed.
    const inVenue = venueContacts.some((item) => item.id === contact.id);
    const inGig = gigContacts.some((item) => item.id === contact.id);
    if (place === "venue" || inVenue) onVenueContacts(put(venueContacts, contact));
    if ((place === "gig" && !inVenue) || inGig) onGigContacts(put(gigContacts, contact));
  };

  const group = (label: string, list: readonly BandContact[], place: ContactPlace) =>
    list.length > 0 && (
      <div className="space-y-1">
        <h4 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
          {label}
        </h4>
        <ul>
          {list.map((contact) => (
            <li key={contact.id}>
              <button
                type="button"
                className="flex min-h-11 w-full items-center rounded-lg px-1 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setDialog({ contact, place, key: Date.now() })}
              >
                <ContactLine contact={contact} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <section className="space-y-2" aria-label={t("gigs.contacts.title")}>
      {!empty && (
        <h3 className="font-heading font-semibold text-base">{t("gigs.contacts.title")}</h3>
      )}
      {venueName && group(t("gigs.contacts.fromVenue", { venue: venueName }), shown, "venue")}
      {group(t("gigs.contacts.thisGig"), gigContacts, "gig")}
      <Button
        type="button"
        variant="outline"
        disabled={!online}
        onClick={() => setDialog({ place: "gig", key: Date.now() })}
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
          place={dialog.place}
          venueName={venueName ?? undefined}
          onDone={done}
          onRemove={
            dialog.contact
              ? () => {
                  const id = dialog.contact?.id;
                  if (dialog.place === "venue") {
                    onVenueContacts(venueContacts.filter((item) => item.id !== id));
                  } else {
                    onGigContacts(gigContacts.filter((item) => item.id !== id));
                  }
                }
              : undefined
          }
        />
      )}
    </section>
  );
}

/**
 * The compact view's contacts (#329): the venue's, then the gig's own, each with Call and Email
 * (the phone's apps, offline too).
 */
export function GigContactsList({
  venueName,
  venueContacts,
  gigContacts,
}: {
  venueName: string | null;
  venueContacts: readonly BandContact[];
  gigContacts: readonly BandContact[];
}) {
  const { t } = useTranslation();
  if (venueContacts.length === 0 && gigContacts.length === 0) return null;
  const group = (label: string, list: readonly BandContact[]) =>
    list.length > 0 && (
      <div className="space-y-1">
        <h4 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
          {label}
        </h4>
        <ul>
          {list.map((contact) => (
            <li key={contact.id} className="flex min-h-12 items-center gap-2">
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <Badge variant="secondary" className="shrink-0">
                  {t(`gigs.contacts.types.${contact.type}`)}
                </Badge>
                <span className="min-w-0 truncate font-medium text-sm">{contact.name}</span>
              </span>
              {contact.phone && (
                <Button asChild variant="secondary" size="icon-lg" className="rounded-full">
                  <a
                    href={telHref(contact.phone)}
                    aria-label={t("gigs.contacts.call", { name: contact.name })}
                  >
                    <Phone />
                  </a>
                </Button>
              )}
              {contact.email && (
                <Button asChild variant="secondary" size="icon-lg" className="rounded-full">
                  <a
                    href={`mailto:${contact.email}`}
                    aria-label={t("gigs.contacts.mail", { name: contact.name })}
                  >
                    <Mail />
                  </a>
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  return (
    <section className="space-y-2">
      <h3 className="font-heading font-semibold">{t("gigs.contacts.title")}</h3>
      {venueName && group(t("gigs.contacts.fromVenue", { venue: venueName }), venueContacts)}
      {group(t("gigs.contacts.thisGig"), gigContacts)}
    </section>
  );
}
