import {
  GIG_MAX_LENGTH,
  GIG_TYPES,
  type GigType,
  gigSetlistTitle,
  SETLIST_MAX_LENGTH,
} from "@coverband/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CalendarClock } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useGigRights } from "@/components/gigs/gig-actions";
import { GigContactsField } from "@/components/gigs/gig-contacts";
import {
  type ExtrasDraft,
  GigExtraInfoFields,
  GigProgramFields,
  GigSetlistField,
} from "@/components/gigs/gig-extras-fields";
import { PostersField } from "@/components/gigs/gig-posters";
import { GigStatusBadge } from "@/components/gigs/gig-status";
import {
  VenueField,
  type VenueState,
  venueFields,
  venueInput,
  venueMissing,
} from "@/components/gigs/venue-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/i18n/use-language";
import { errorMessage } from "@/lib/errors";
import { formatGigDate, formatShortGigDate } from "@/lib/gig-format";
import { parsePay, payText } from "@/lib/gig-rules";
import {
  type BandContact,
  createGig,
  type Gig,
  type GigInput,
  postponeGig,
  settleGig,
  updateGig,
  venuesQuery,
} from "@/lib/gigs";
import { useKeyboardUp } from "@/lib/keyboard";
import { useOnline } from "@/lib/online";
import { cn } from "@/lib/utils";

/** The form's values, as typed. */
type Draft = {
  date: string;
  showTime: string;
  title: string;
  type: GigType;
  venue: VenueState;
  /** Its own contacts (#329); the venue's are in `venue`. */
  contacts: BandContact[];
} & ExtrasDraft;

const draftOf = (gig: Gig | undefined): Draft => ({
  date: gig?.date ?? "",
  showTime: gig?.showTime ?? "",
  title: gig?.title ?? "",
  type: gig?.type ?? "public",
  venue: gig?.venue
    ? { mode: "existing", id: gig.venue.id, gigs: 0, fields: venueFields(gig.venue) }
    : { mode: "none", search: "" },
  setlist: null,
  getInTime: gig?.getInTime ?? "",
  soundcheckTime: gig?.soundcheckTime ?? "",
  programLinks: gig?.programLinks ?? [],
  programNotes: gig?.programNotes ?? "",
  pay: payText(gig?.payCents ?? null),
  payNotes: gig?.payNotes ?? "",
  sharedBackline: gig?.sharedBackline ?? false,
  backlineNotes: gig?.backlineNotes ?? "",
  techniciansProvided: gig?.techniciansProvided ?? false,
  notes: gig?.notes ?? "",
  contacts: gig?.contacts ?? [],
});

/** What the gig still needs before Save, in the order the form asks for it; null when ready. */
export function missingOf(draft: Draft) {
  if (!draft.date) return "date" as const;
  if (!draft.title.trim() && draft.venue.mode === "none") return "titleOrVenue" as const;
  const venue = venueMissing(draft.venue);
  if (venue === "name") return "venueName" as const;
  if (venue === "city") return "venueCity" as const;
  if (parsePay(draft.pay) === undefined) return "pay" as const;
  return null;
}

/**
 * A gig's form (brief 034), a page of its own: date, show time, title, type, then the venue. Its
 * Save button stays at the bottom of the screen and says what is missing. A new gig opens once
 * saved; an edited one goes back to its view.
 */
export function GigForm({
  bandSlug,
  gig,
  focus,
}: {
  bandSlug: string;
  gig?: Gig;
  /** The field to start on: the date, after Postpone. */
  focus?: "date" | undefined;
}) {
  const { t } = useTranslation();
  const language = useLanguage();
  const id = useId();
  const online = useOnline();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const keyboardUp = useKeyboardUp();
  const venues = useQuery(venuesQuery(bandSlug)).data ?? [];
  const [draft, setDraft] = useState(() => draftOf(gig));
  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));
  const missing = missingOf(draft);
  const rights = useGigRights(
    bandSlug,
    gig ?? { status: "proposed", date: "9999-12-31", createdById: null },
  );
  // Settled: the date, title and venue stay as they are until postponed (#327).
  const fixed = gig?.status === "settled";
  // The status switch: a new gig's creator, or its creator or a band leader, settles it.
  const canSettle = gig ? rights.settle : true;
  const [settling, setSettling] = useState(false);

  // The band's venue chosen: how many gigs use it, from the venues' list once it comes.
  const chosen = draft.venue;
  const venueState: VenueState =
    chosen.mode === "existing"
      ? { ...chosen, gigs: venues.find((venue) => venue.id === chosen.id)?.gigs ?? chosen.gigs }
      : chosen;
  // The venue's contacts: the band's venue's current ones (the venues' list, fetched again after
  // any change) until changed here, never the copy the form was opened with.
  const venueContacts =
    chosen.mode === "none"
      ? []
      : chosen.mode === "existing" && !chosen.fields.contactsEdited
        ? (venues.find((venue) => venue.id === chosen.id)?.contacts ?? chosen.fields.contacts)
        : chosen.fields.contacts;

  const postpone = useMutation({
    networkMode: "always",
    mutationFn: () => postponeGig(bandSlug, gig?.id ?? ""),
    onSuccess: async () => {
      toast.success(t("gigs.postpone.done"));
      // On the date first: the new version then makes a fresh form, which starts there.
      await navigate({
        to: "/b/$bandSlug/gigs/$gigId/edit",
        params: { bandSlug, gigId: gig?.id ?? "" },
        search: { focus: "date" },
        replace: true,
      });
      await queryClient.invalidateQueries({ queryKey: ["bands", bandSlug] });
    },
    onError: (error) => toast.error(errorMessage(t, error)),
  });

  const save = useMutation({
    networkMode: "always",
    mutationFn: async () => {
      const input: GigInput = {
        date: draft.date,
        title: draft.title.trim() || null,
        type: draft.type,
        showTime: draft.showTime || null,
        venue: venueInput(draft.venue),
        setlist: gig?.setlistId ? null : draft.setlist,
        getInTime: draft.getInTime || null,
        soundcheckTime: draft.soundcheckTime || null,
        programLinks: draft.programLinks,
        programNotes: draft.programNotes.trim() || null,
        payCents: parsePay(draft.pay) ?? null,
        payNotes: draft.payNotes.trim() || null,
        sharedBackline: draft.sharedBackline,
        backlineNotes: draft.sharedBackline ? draft.backlineNotes.trim() || null : null,
        techniciansProvided: draft.techniciansProvided,
        notes: draft.notes.trim() || null,
        contactIds: draft.contacts.map((contact) => contact.id),
      };
      const saved = gig
        ? await updateGig(bandSlug, gig.id, { ...input, version: gig.version })
        : await createGig(bandSlug, input);
      return saved && settling && saved.status === "proposed"
        ? settleGig(bandSlug, saved.id)
        : saved;
    },
    onSuccess: async (saved) => {
      toast.success(gig ? t("gigs.form.saved") : t("gigs.form.created"));
      await queryClient.invalidateQueries({ queryKey: ["bands", bandSlug] });
      // A new, empty setlist made with it (#358): its editor, to fill it.
      if (saved?.setlistId && draft.setlist?.from === null && !gig?.setlistId) {
        await navigate({
          to: "/b/$bandSlug/setlists/$setlistId",
          params: { bandSlug, setlistId: saved.setlistId },
          replace: !gig,
        });
      } else if (saved) {
        await navigate({
          to: "/b/$bandSlug/gigs/$gigId",
          params: { bandSlug, gigId: saved.id },
          replace: !gig,
        });
      }
    },
    onError: (error) => toast.error(errorMessage(t, error)),
  });

  // The title its setlist will have (#358): the gig's name and date, once the form has them.
  const gigName =
    draft.title.trim() || (draft.venue.mode !== "none" ? draft.venue.fields.name.trim() : "");
  const setlistTitle =
    gigName && draft.date ? gigSetlistTitle(gigName, draft.date, SETLIST_MAX_LENGTH.title) : null;

  const summary = [
    draft.date ? formatShortGigDate(draft.date, language, new Date().getFullYear()) : null,
    draft.title.trim() || (draft.venue.mode !== "none" ? draft.venue.fields.name.trim() : null),
  ]
    .filter(Boolean)
    .join(" · ");

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
      {!gig && <p className="text-muted-foreground text-sm">{t("gigs.form.intro")}</p>}
      {gig && fixed && (
        <SettledDetails
          gig={gig}
          canPostpone={rights.postpone}
          postponing={postpone.isPending}
          onPostpone={() => postpone.mutate()}
        />
      )}
      <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
        {!fixed && (
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor={`${id}-date`}>{t("gigs.form.date")}</Label>
            <Input
              id={`${id}-date`}
              type="date"
              required
              autoFocus={focus === "date"}
              value={draft.date}
              onChange={(event) => set({ date: event.target.value })}
            />
          </div>
        )}
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor={`${id}-show`}>
            {t("gigs.form.showTime")}{" "}
            <span className="font-normal text-muted-foreground">{t("gigs.optional")}</span>
          </Label>
          <Input
            id={`${id}-show`}
            type="time"
            value={draft.showTime}
            onChange={(event) => set({ showTime: event.target.value })}
          />
        </div>
      </div>
      {!fixed && (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-title`}>{t("gigs.form.title")}</Label>
          <Input
            id={`${id}-title`}
            value={draft.title}
            maxLength={GIG_MAX_LENGTH.title}
            placeholder={t("gigs.form.titlePlaceholder")}
            onChange={(event) => set({ title: event.target.value })}
          />
        </div>
      )}
      <fieldset className="space-y-2">
        <legend className="mb-2 font-medium text-sm">{t("gigs.form.type")}</legend>
        <div className="flex flex-wrap gap-2">
          {GIG_TYPES.map((type) => (
            <label
              key={type}
              className={cn(
                "flex h-10 cursor-pointer items-center whitespace-nowrap rounded-4xl border px-3 text-sm has-focus-visible:ring-2 has-focus-visible:ring-ring",
                draft.type === type
                  ? "border-primary bg-primary/10 font-semibold"
                  : "text-muted-foreground",
              )}
            >
              <input
                type="radio"
                name={`${id}-type`}
                value={type}
                checked={draft.type === type}
                onChange={() => set({ type })}
                className="sr-only"
              />
              {t(`gigs.form.types.${type}`)}
            </label>
          ))}
        </div>
      </fieldset>
      {!fixed && (
        <VenueField state={venueState} venues={venues} onChange={(venue) => set({ venue })} />
      )}
      <GigProgramFields value={draft} onChange={set} />
      {canSettle && (
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-3">
          <input
            type="checkbox"
            role="switch"
            aria-checked={settling}
            checked={settling}
            onChange={(event) => setSettling(event.target.checked)}
            className="mt-0.5 size-5 accent-primary"
          />
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-sm">{t("gigs.settle.switch")}</span>
            <span className="block text-muted-foreground text-xs">{t("gigs.settle.hint")}</span>
          </span>
        </label>
      )}
      <GigSetlistField
        bandSlug={bandSlug}
        linkedId={gig?.setlistId ?? null}
        title={setlistTitle}
        value={draft.setlist}
        onChange={(setlist) => set({ setlist })}
      />
      <GigContactsField
        bandSlug={bandSlug}
        venueName={draft.venue.mode === "none" ? null : draft.venue.fields.name.trim() || null}
        venueContacts={venueContacts}
        gigContacts={draft.contacts}
        onGigContacts={(contacts) => set({ contacts })}
        onVenueContacts={(contacts) =>
          setDraft((current) =>
            current.venue.mode === "none"
              ? current
              : {
                  ...current,
                  venue: {
                    ...current.venue,
                    fields: { ...current.venue.fields, contacts, contactsEdited: true },
                  },
                },
          )
        }
      />
      <PostersField bandSlug={bandSlug} gig={gig} />
      <GigExtraInfoFields value={draft} onChange={set} payInvalid={missing === "pay"} />

      {/* Save stays at the bottom of the screen, above the band's bar on a phone. */}
      <div
        className={cn(
          "sticky z-10 -mx-4 flex items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur",
          keyboardUp
            ? "bottom-0"
            : "bottom-[calc(3.25rem+env(safe-area-inset-bottom))] sm:bottom-0",
        )}
      >
        <p
          className={cn(
            "min-w-0 flex-1 truncate text-sm",
            missing ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground",
          )}
          aria-live="polite"
        >
          {missing ? t(`gigs.form.missing.${missing}`) : summary}
        </p>
        <Button type="submit" disabled={missing !== null || !online} pending={save.isPending}>
          {t("common.save")}
        </Button>
      </div>
    </form>
  );
}

/** A settled gig's fixed details (#327): its date, title and venue, and Postpone to change them. */
function SettledDetails({
  gig,
  canPostpone,
  postponing,
  onPostpone,
}: {
  gig: Gig;
  canPostpone: boolean;
  postponing: boolean;
  onPostpone: () => void;
}) {
  const { t } = useTranslation();
  const language = useLanguage();
  const online = useOnline();
  return (
    <section
      aria-label={t("gigs.settled.label")}
      className="space-y-3 rounded-xl border bg-card p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <GigStatusBadge status="settled" />
        <span className="flex-1" />
        {canPostpone && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!online}
            pending={postponing}
            onClick={onPostpone}
          >
            <CalendarClock />
            {t("gigs.postpone.button")}
          </Button>
        )}
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{t("gigs.form.date")}</dt>
        <dd>{formatGigDate(gig.date, language, new Date().getFullYear())}</dd>
        {gig.title && (
          <>
            <dt className="text-muted-foreground">{t("gigs.form.title")}</dt>
            <dd className="break-words">{gig.title}</dd>
          </>
        )}
        {gig.venue && (
          <>
            <dt className="text-muted-foreground">{t("gigs.venue.title")}</dt>
            <dd className="break-words">
              {gig.venue.name} · {gig.venue.city}
            </dd>
          </>
        )}
      </dl>
      <p className="text-muted-foreground text-xs">{t("gigs.settled.hint")}</p>
    </section>
  );
}
