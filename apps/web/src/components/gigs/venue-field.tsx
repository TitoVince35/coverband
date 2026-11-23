import { VENUE_LIMITS, VENUE_MAX_LENGTH, type WebLink } from "@coverband/shared";
import { MapPin, Plus, Search } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { WebLinksEditor } from "@/components/gigs/web-links-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { BandContact, VenueInput, VenueSummary } from "@/lib/gigs";
import { cn } from "@/lib/utils";
import { searchVenues } from "@/lib/venue-search";

/** A venue's details as the form holds them (texts as typed). */
export type VenueFields = {
  name: string;
  city: string;
  address: string;
  links: WebLink[];
  description: string;
  /** Its usual people (#329), shown on every gig there. */
  contacts: BandContact[];
};

/**
 * The gig form's venue: none yet (the search box, with what's typed), the band's venue (its
 * details editable, for every gig there), or a new one (saved with the gig).
 */
export type VenueState =
  | { mode: "none"; search: string }
  | { mode: "existing"; id: string; gigs: number; fields: VenueFields }
  | { mode: "new"; fields: VenueFields };

export const emptyVenueFields = (name = ""): VenueFields => ({
  name,
  city: "",
  address: "",
  links: [],
  description: "",
  contacts: [],
});

/** A venue as the API gives it, as form fields. */
export const venueFields = (venue: {
  name: string;
  city: string;
  address: string | null;
  links: WebLink[];
  description: string | null;
  contacts?: BandContact[];
}): VenueFields => ({
  name: venue.name,
  city: venue.city,
  address: venue.address ?? "",
  links: venue.links,
  description: venue.description ?? "",
  contacts: venue.contacts ?? [],
});

/** What a venue state saves: null without a venue; never an incomplete one (see `venueMissing`). */
export function venueInput(state: VenueState): VenueInput | null {
  if (state.mode === "none") return null;
  const { fields } = state;
  return {
    ...(state.mode === "existing" ? { id: state.id } : {}),
    name: fields.name.trim(),
    city: fields.city.trim(),
    address: fields.address.trim() || null,
    links: fields.links,
    description: fields.description.trim() || null,
    contactIds: fields.contacts.map((contact) => contact.id),
  };
}

/** What the venue still needs before it can be saved: its name, its city, or nothing. */
export function venueMissing(state: VenueState): "name" | "city" | null {
  if (state.mode === "none") return null;
  if (!state.fields.name.trim()) return "name";
  if (!state.fields.city.trim()) return "city";
  return null;
}

/**
 * The venue block of the gig form (brief 034): a search box on the band's venues followed by a
 * "+" button; a venue chosen shows its details, filled in and editable; "+" shows them empty.
 * `extra` goes under the details (the venue's contacts, later its map).
 */
export function VenueField({
  state,
  onChange,
  venues,
  disabled,
  extra,
}: {
  state: VenueState;
  onChange: (state: VenueState) => void;
  venues: readonly VenueSummary[];
  disabled?: boolean | undefined;
  extra?: ReactNode | undefined;
}) {
  const { t } = useTranslation();
  const id = useId();

  if (state.mode === "none") {
    return (
      <VenueSearch
        search={state.search}
        venues={venues}
        disabled={disabled}
        onSearch={(search) => onChange({ mode: "none", search })}
        onPick={(venue) =>
          onChange({ mode: "existing", id: venue.id, gigs: venue.gigs, fields: venueFields(venue) })
        }
        onNew={(name) => onChange({ mode: "new", fields: emptyVenueFields(name) })}
      />
    );
  }

  const { fields } = state;
  const set = (patch: Partial<VenueFields>) =>
    onChange({ ...state, fields: { ...fields, ...patch } });
  return (
    <section aria-labelledby={`${id}-title`} className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 id={`${id}-title`} className="flex-1 font-heading font-semibold">
          {t("gigs.venue.title")}
          {state.mode === "new" && (
            <span className="font-normal text-muted-foreground"> · {t("gigs.venue.new")}</span>
          )}
        </h3>
        {!disabled && (
          <Button
            type="button"
            variant="link"
            className="h-auto px-0"
            onClick={() => onChange({ mode: "none", search: "" })}
          >
            {state.mode === "new" ? t("gigs.venue.chooseExisting") : t("gigs.venue.change")}
          </Button>
        )}
      </div>
      <div className="space-y-3 rounded-xl border bg-card p-3">
        {state.mode === "existing" && (
          <p className="text-muted-foreground text-xs">
            {t("gigs.venue.usedBy", { count: state.gigs })}
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor={`${id}-name`}>{t("gigs.venue.name")}</Label>
            <Input
              id={`${id}-name`}
              value={fields.name}
              maxLength={VENUE_MAX_LENGTH.name}
              disabled={disabled}
              autoFocus={state.mode === "new" && !fields.name}
              onChange={(event) => set({ name: event.target.value })}
            />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor={`${id}-city`}>{t("gigs.venue.city")}</Label>
            <Input
              id={`${id}-city`}
              value={fields.city}
              maxLength={VENUE_MAX_LENGTH.city}
              disabled={disabled}
              autoFocus={state.mode === "new" && fields.name !== "" && !fields.city}
              onChange={(event) => set({ city: event.target.value })}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-address`}>
            {t("gigs.venue.address")}{" "}
            <span className="font-normal text-muted-foreground">{t("gigs.optional")}</span>
          </Label>
          <Input
            id={`${id}-address`}
            value={fields.address}
            maxLength={VENUE_MAX_LENGTH.address}
            disabled={disabled}
            autoComplete="street-address"
            onChange={(event) => set({ address: event.target.value })}
          />
        </div>
        <WebLinksEditor
          label={t("gigs.venue.links")}
          links={fields.links}
          max={VENUE_LIMITS.links}
          disabled={disabled}
          onChange={(links) => set({ links })}
        />
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-description`}>
            {t("gigs.venue.description")}{" "}
            <span className="font-normal text-muted-foreground">{t("gigs.optional")}</span>
          </Label>
          <Textarea
            id={`${id}-description`}
            rows={2}
            value={fields.description}
            maxLength={VENUE_MAX_LENGTH.description}
            disabled={disabled}
            placeholder={t("gigs.venue.descriptionPlaceholder")}
            onChange={(event) => set({ description: event.target.value })}
          />
        </div>
        {extra}
        {state.mode === "existing" && (
          <p className="text-muted-foreground text-xs">{t("gigs.venue.sharedHint")}</p>
        )}
      </div>
    </section>
  );
}

/** The search box on the band's venues, its matches under it, then the "+" button. */
function VenueSearch({
  search,
  venues,
  disabled,
  onSearch,
  onPick,
  onNew,
}: {
  search: string;
  venues: readonly VenueSummary[];
  disabled: boolean | undefined;
  onSearch: (search: string) => void;
  onPick: (venue: VenueSummary) => void;
  onNew: (name: string) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const matches = searchVenues(venues, search).slice(0, 8);
  const typed = search.trim();
  // The options: the matches, then "New venue “…”" once something is typed.
  const count = matches.length + (typed ? 1 : 0);
  const choose = (index: number) => {
    const venue = matches[index];
    if (venue) onPick(venue);
    else if (typed) onNew(typed);
  };

  return (
    <section aria-labelledby={`${id}-label`} className="space-y-2">
      <Label
        id={`${id}-label`}
        htmlFor={`${id}-input`}
        className="font-heading font-semibold text-base"
      >
        {t("gigs.venue.title")}
      </Label>
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden
            className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground"
          />
          <Input
            id={`${id}-input`}
            role="combobox"
            aria-expanded={open && count > 0}
            aria-controls={`${id}-list`}
            aria-activedescendant={open && count > 0 ? `${id}-option-${active}` : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            className="h-11 pl-9"
            placeholder={t("gigs.venue.searchPlaceholder")}
            value={search}
            disabled={disabled}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onChange={(event) => {
              onSearch(event.target.value);
              setActive(0);
              setOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setOpen(true);
                setActive((index) => Math.min(index + 1, count - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((index) => Math.max(index - 1, 0));
              } else if (event.key === "Enter" && open && count > 0) {
                event.preventDefault();
                choose(active);
              } else if (event.key === "Escape") {
                setOpen(false);
              }
            }}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          size="icon-lg"
          className="size-11"
          disabled={disabled}
          aria-label={t("gigs.venue.newButton")}
          onClick={() => onNew(typed)}
        >
          <Plus />
        </Button>
      </div>
      {open && count > 0 && (
        <div
          id={`${id}-list`}
          role="listbox"
          aria-label={t("gigs.venue.list")}
          className="overflow-hidden rounded-xl border bg-popover shadow-md"
        >
          {matches.map((venue, index) => (
            <div
              key={venue.id}
              id={`${id}-option-${index}`}
              role="option"
              // Focus stays in the input (aria-activedescendant); arrows move the highlight.
              tabIndex={-1}
              aria-selected={index === active}
              className={cn(
                "flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2",
                index === active && "bg-accent",
              )}
              // Before the input's blur closes the list.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(index)}
              onKeyDown={(event) => event.key === "Enter" && choose(index)}
            >
              <MapPin aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{venue.name}</span>
                <span className="block truncate text-muted-foreground text-xs">
                  {venue.city} · {t("gigs.venue.gigCount", { count: venue.gigs })}
                </span>
              </span>
            </div>
          ))}
          {typed && (
            <div
              id={`${id}-option-${matches.length}`}
              role="option"
              tabIndex={-1}
              aria-selected={active === matches.length}
              className={cn(
                "flex min-h-12 cursor-pointer items-center gap-3 border-t px-3 py-2 text-primary",
                active === matches.length && "bg-accent",
              )}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onNew(typed)}
              onKeyDown={(event) => event.key === "Enter" && onNew(typed)}
            >
              <Plus aria-hidden className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                {t("gigs.venue.newNamed", { name: typed })}
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
