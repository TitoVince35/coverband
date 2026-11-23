import { GIG_MAX_LENGTH, GIG_TYPES, type GigType } from "@coverband/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
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
import { formatShortGigDate } from "@/lib/gig-format";
import { createGig, type Gig, type GigInput, updateGig, venuesQuery } from "@/lib/gigs";
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
};

const draftOf = (gig: Gig | undefined): Draft => ({
  date: gig?.date ?? "",
  showTime: gig?.showTime ?? "",
  title: gig?.title ?? "",
  type: gig?.type ?? "public",
  venue: gig?.venue
    ? { mode: "existing", id: gig.venue.id, gigs: 0, fields: venueFields(gig.venue) }
    : { mode: "none", search: "" },
});

/** What the gig still needs before Save, in the order the form asks for it; null when ready. */
export function missingOf(draft: Draft) {
  if (!draft.date) return "date" as const;
  if (!draft.title.trim() && draft.venue.mode === "none") return "titleOrVenue" as const;
  const venue = venueMissing(draft.venue);
  if (venue === "name") return "venueName" as const;
  if (venue === "city") return "venueCity" as const;
  return null;
}

/**
 * A gig's form (brief 034), a page of its own: date, show time, title, type, then the venue. Its
 * Save button stays at the bottom of the screen and says what is missing. A new gig opens once
 * saved; an edited one goes back to its view.
 */
export function GigForm({ bandSlug, gig }: { bandSlug: string; gig?: Gig }) {
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

  // The band's venue chosen: how many gigs use it, from the venues' list once it comes.
  const chosen = draft.venue;
  const venueState: VenueState =
    chosen.mode === "existing"
      ? { ...chosen, gigs: venues.find((venue) => venue.id === chosen.id)?.gigs ?? chosen.gigs }
      : chosen;

  const save = useMutation({
    networkMode: "always",
    mutationFn: () => {
      const input: GigInput = {
        date: draft.date,
        title: draft.title.trim() || null,
        type: draft.type,
        showTime: draft.showTime || null,
        venue: venueInput(draft.venue),
      };
      return gig
        ? updateGig(bandSlug, gig.id, { ...input, version: gig.version })
        : createGig(bandSlug, input);
    },
    onSuccess: async (saved) => {
      toast.success(gig ? t("gigs.form.saved") : t("gigs.form.created"));
      await queryClient.invalidateQueries({ queryKey: ["bands", bandSlug] });
      if (saved) {
        await navigate({
          to: "/b/$bandSlug/gigs/$gigId",
          params: { bandSlug, gigId: saved.id },
          replace: !gig,
        });
      }
    },
    onError: (error) => toast.error(errorMessage(t, error)),
  });

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
        if (!missing) save.mutate();
      }}
    >
      {!gig && <p className="text-muted-foreground text-sm">{t("gigs.form.intro")}</p>}
      <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor={`${id}-date`}>{t("gigs.form.date")}</Label>
          <Input
            id={`${id}-date`}
            type="date"
            required
            value={draft.date}
            onChange={(event) => set({ date: event.target.value })}
          />
        </div>
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
      <fieldset className="space-y-2">
        <legend className="mb-2 font-medium text-sm">{t("gigs.form.type")}</legend>
        <div className="flex flex-wrap gap-2">
          {GIG_TYPES.map((type) => (
            <label
              key={type}
              className={cn(
                "flex h-10 cursor-pointer items-center rounded-4xl border px-4 text-sm has-focus-visible:ring-2 has-focus-visible:ring-ring",
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
              {t(`gigs.type.${type}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <VenueField state={venueState} venues={venues} onChange={(venue) => set({ venue })} />

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
