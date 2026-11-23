import {
  BAND_CONTACT_MAX_LENGTH,
  BAND_CONTACT_TYPES,
  type BandContactType,
} from "@coverband/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { searchContacts } from "@/lib/contact-search";
import { errorMessage } from "@/lib/errors";
import {
  type BandContact,
  type BandContactInput,
  type BandContactSummary,
  bandContactsQuery,
  createBandContact,
  updateBandContact,
} from "@/lib/gigs";
import { useOnline } from "@/lib/online";
import { cn } from "@/lib/utils";

/** Where the dialog adds a contact: the gig alone, or its venue (every gig there). */
export type ContactPlace = "gig" | "venue";

const emptyFields = (): BandContactInput => ({
  name: "",
  type: "organizer",
  phone: null,
  email: null,
  notes: null,
});

const fieldsOf = ({ id: _, ...fields }: BandContact): BandContactInput => fields;

/**
 * Adding or editing a gig's contact (#329): type and name required; the band's contacts are
 * suggested as the name is typed, so one person isn't entered twice; "Also a contact of the
 * venue" adds them to the venue instead of this gig alone. Saving writes the contact at once
 * (its details change everywhere); `onDone` then links it where it goes, saved with the gig.
 * Editing one also offers to remove it from where it's listed.
 */
export function ContactDialog({
  bandSlug,
  open,
  onOpenChange,
  contact,
  place,
  venueName,
  onDone,
  onRemove,
}: {
  bandSlug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The contact edited; none: a new one. */
  contact?: BandContact | undefined;
  /** Where it's listed now (editing), or where it goes by default. */
  place: ContactPlace;
  /** The gig's venue, when it has one: "Also a contact of the venue" is offered then. */
  venueName?: string | undefined;
  onDone: (contact: BandContact, place: ContactPlace) => void;
  onRemove?: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  const id = useId();
  const online = useOnline();
  const queryClient = useQueryClient();
  const known = useQuery({ ...bandContactsQuery(bandSlug), enabled: open }).data ?? [];
  const [fields, setFields] = useState<BandContactInput>(() =>
    contact ? fieldsOf(contact) : emptyFields(),
  );
  // An existing contact of the band, picked from the suggestions or edited.
  const [picked, setPicked] = useState<BandContact | undefined>(contact);
  const [toVenue, setToVenue] = useState(place === "venue");
  const [suggesting, setSuggesting] = useState(false);
  const set = (patch: Partial<BandContactInput>) =>
    setFields((current) => ({ ...current, ...patch }));
  const suggestions = picked ? [] : searchContacts(known, fields.name).slice(0, 5);

  const save = useMutation({
    networkMode: "always",
    mutationFn: async () => {
      const input: BandContactInput = {
        name: fields.name.trim(),
        type: fields.type,
        phone: fields.phone?.trim() || null,
        email: fields.email?.trim() || null,
        notes: fields.notes?.trim() || null,
      };
      if (!picked) return createBandContact(bandSlug, input);
      const unchanged = (Object.keys(input) as (keyof BandContactInput)[]).every(
        (key) => input[key] === picked[key],
      );
      return unchanged ? picked : updateBandContact(bandSlug, picked.id, input);
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ["bands", bandSlug] });
      if (saved) {
        const { id: savedId, name, type, phone, email, notes } = saved;
        onDone({ id: savedId, name, type, phone, email, notes }, toVenue ? "venue" : "gig");
      }
      onOpenChange(false);
    },
  });

  const pick = (suggestion: BandContactSummary) => {
    const { id: pickedId, name, type, phone, email, notes } = suggestion;
    setPicked({ id: pickedId, name, type, phone, email, notes });
    setFields({ name, type, phone, email, notes });
    setSuggesting(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!save.isPending) onOpenChange(next);
      }}
    >
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (fields.name.trim()) save.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>{contact ? t("gigs.contacts.edit") : t("gigs.contacts.add")}</DialogTitle>
            <DialogDescription className={cn(!picked && "sr-only")}>
              {picked ? t("gigs.contacts.sharedHint") : t("gigs.contacts.suggestHint")}
            </DialogDescription>
          </DialogHeader>
          <fieldset className="space-y-2">
            <legend className="mb-2 font-medium text-sm">{t("gigs.contacts.type")}</legend>
            <div className="flex flex-wrap gap-2">
              {BAND_CONTACT_TYPES.map((type) => (
                <label
                  key={type}
                  className={cn(
                    "flex h-10 cursor-pointer items-center rounded-4xl border px-4 text-sm has-focus-visible:ring-2 has-focus-visible:ring-ring",
                    fields.type === type
                      ? "border-primary bg-primary/10 font-semibold"
                      : "text-muted-foreground",
                  )}
                >
                  <input
                    type="radio"
                    name={`${id}-type`}
                    className="sr-only"
                    checked={fields.type === type}
                    onChange={() => set({ type: type as BandContactType })}
                  />
                  {t(`gigs.contacts.types.${type}`)}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-name`}>{t("gigs.contacts.name")}</Label>
            <Input
              id={`${id}-name`}
              role="combobox"
              aria-expanded={suggesting && suggestions.length > 0}
              aria-controls={`${id}-known`}
              aria-autocomplete="list"
              autoComplete="off"
              required
              maxLength={BAND_CONTACT_MAX_LENGTH.name}
              value={fields.name}
              onFocus={() => setSuggesting(true)}
              onBlur={() => setSuggesting(false)}
              onChange={(event) => {
                set({ name: event.target.value });
                setSuggesting(true);
              }}
            />
            {suggesting && suggestions.length > 0 && (
              <div
                id={`${id}-known`}
                role="listbox"
                aria-label={t("gigs.contacts.known")}
                className="overflow-hidden rounded-xl border bg-popover shadow-md"
              >
                {suggestions.map((suggestion) => (
                  <div
                    key={suggestion.id}
                    role="option"
                    tabIndex={-1}
                    aria-selected={false}
                    className="cursor-pointer px-3 py-2 hover:bg-accent"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => pick(suggestion)}
                    onKeyDown={(event) => event.key === "Enter" && pick(suggestion)}
                  >
                    <span className="block truncate font-medium text-sm">
                      {suggestion.name} · {t(`gigs.contacts.types.${suggestion.type}`)}
                    </span>
                    <span className="block truncate text-muted-foreground text-xs">
                      {usage(t, suggestion)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {!picked && (
              <p className="text-muted-foreground text-xs">{t("gigs.contacts.suggestHint")}</p>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor={`${id}-phone`}>{t("gigs.contacts.phone")}</Label>
              <Input
                id={`${id}-phone`}
                type="tel"
                autoComplete="off"
                maxLength={BAND_CONTACT_MAX_LENGTH.phone}
                value={fields.phone ?? ""}
                onChange={(event) => set({ phone: event.target.value })}
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor={`${id}-email`}>{t("gigs.contacts.email")}</Label>
              <Input
                id={`${id}-email`}
                type="email"
                autoComplete="off"
                maxLength={BAND_CONTACT_MAX_LENGTH.email}
                value={fields.email ?? ""}
                onChange={(event) => set({ email: event.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-notes`}>
              {t("gigs.contacts.notes")}{" "}
              <span className="font-normal text-muted-foreground">{t("gigs.optional")}</span>
            </Label>
            <Textarea
              id={`${id}-notes`}
              rows={2}
              maxLength={BAND_CONTACT_MAX_LENGTH.notes}
              value={fields.notes ?? ""}
              onChange={(event) => set({ notes: event.target.value })}
            />
          </div>
          {venueName && !contact && (
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-5 accent-primary"
                checked={toVenue}
                onChange={(event) => setToVenue(event.target.checked)}
              />
              <span className="min-w-0">
                <span className="block">{t("gigs.contacts.alsoVenue")}</span>
                <span className="block break-words text-muted-foreground text-xs">
                  {t("gigs.contacts.alsoVenueHint", { venue: venueName })}
                </span>
              </span>
            </label>
          )}
          {save.isError && (
            <p role="alert" className="text-destructive text-sm">
              {errorMessage(t, save.error)}
            </p>
          )}
          <DialogFooter className="flex-wrap gap-2">
            {onRemove && (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive sm:mr-auto"
                onClick={() => {
                  onRemove();
                  onOpenChange(false);
                }}
              >
                {place === "venue" ? t("gigs.contacts.removeVenue") : t("gigs.contacts.removeGig")}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={!fields.name.trim() || !online}
              pending={save.isPending}
            >
              {contact ? t("common.save") : t("gigs.contacts.addButton")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Where a contact is used: "Le Mondo Bizarro, 3 gigs". */
export function usage(t: TFunction, contact: { venues: { name: string }[]; gigs: number }) {
  const parts = [
    ...contact.venues.map((venue) => venue.name),
    ...(contact.gigs > 0 ? [t("gigs.contacts.gigCount", { count: contact.gigs })] : []),
  ];
  return parts.length ? parts.join(", ") : t("gigs.contacts.unused");
}
