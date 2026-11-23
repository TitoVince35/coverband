import { normalizeName } from "@coverband/shared";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ContactActions } from "@/components/gigs/contact-actions";
import { ContactDialog, usage } from "@/components/gigs/contact-dialog";
import { GigPagesNav } from "@/components/gigs/gig-pages-nav";
import { ListSkeleton } from "@/components/loading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage, replacesData } from "@/lib/errors";
import { type BandContactSummary, bandContactsQuery } from "@/lib/gigs";
import { useOnline } from "@/lib/online";

// The band's contacts (#334): type, phone, email and where each is used, a search; each opens
// its dialog; Merge with… and Delete in its menu.
export const Route = createFileRoute("/_app/b/$bandSlug/contacts")({
  component: ContactsPage,
});

/** Contacts matching a search on name, phone or email, accents and case ignored. */
function matching(contacts: readonly BandContactSummary[], search: string) {
  const words = normalizeName(search).split(" ").filter(Boolean);
  if (words.length === 0) return contacts;
  return contacts.filter((contact) => {
    const text = normalizeName([contact.name, contact.phone, contact.email].join(" "));
    const digits = (contact.phone ?? "").replace(/\D/g, "");
    return words.every(
      (word) => text.includes(word) || (/^\d+$/.test(word) && digits.includes(word)),
    );
  });
}

function ContactsPage() {
  const { t } = useTranslation();
  const { bandSlug } = Route.useParams();
  const contacts = useQuery(bandContactsQuery(bandSlug));
  const online = useOnline();
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<{ contact?: BandContactSummary; key: number } | null>(null);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-4">
        <h2 className="flex-1 font-heading font-semibold text-lg">
          {t("gigs.contacts.pageTitle")}
        </h2>
        <Button disabled={!online} onClick={() => setDialog({ key: Date.now() })}>
          <Plus />
          {t("gigs.contacts.new")}
        </Button>
      </div>
      <GigPagesNav bandSlug={bandSlug} />
      <div className="relative">
        <Search
          aria-hidden
          className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground"
        />
        <Input
          type="search"
          aria-label={t("gigs.contacts.search")}
          placeholder={t("gigs.contacts.search")}
          className="pl-9"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      {contacts.isPending ? (
        <ListSkeleton rows={4} />
      ) : contacts.data === undefined || replacesData(contacts.error) ? (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage(t, contacts.error)}
        </p>
      ) : contacts.data.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("gigs.contacts.empty")}</p>
      ) : (
        <ul
          className="divide-y rounded-xl border bg-card"
          aria-label={t("gigs.contacts.pageTitle")}
        >
          {matching(contacts.data, search).map((contact) => (
            <li key={contact.id} className="flex items-center">
              <button
                type="button"
                className="min-w-0 flex-1 space-y-0.5 rounded-xl px-3 py-3 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setDialog({ contact, key: Date.now() })}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Badge variant="secondary" className="shrink-0">
                    {t(`gigs.contacts.types.${contact.type}`)}
                  </Badge>
                  <span className="min-w-0 truncate font-semibold">{contact.name}</span>
                </span>
                {(contact.phone || contact.email) && (
                  <span className="block truncate text-sm">
                    {[contact.phone, contact.email].filter(Boolean).join(" · ")}
                  </span>
                )}
                <span className="block truncate text-muted-foreground text-xs">
                  {usage(t, contact)}
                </span>
              </button>
              <div className="px-1">
                <ContactActions
                  bandSlug={bandSlug}
                  contact={contact}
                  onEdit={() => setDialog({ contact, key: Date.now() })}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      {dialog && (
        <ContactDialog
          key={dialog.key}
          bandSlug={bandSlug}
          open
          onOpenChange={(open) => !open && setDialog(null)}
          contact={dialog.contact}
          place="gig"
          onDone={() => {}}
        />
      )}
    </section>
  );
}
