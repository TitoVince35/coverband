import { GIG_LIMITS, GIG_MAX_LENGTH, type WebLink } from "@coverband/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { WebLinksEditor } from "@/components/gigs/web-links-editor";
import { formatSetlistDuration } from "@/components/setlists/setlist-duration";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { setlistQuery, setlistsQuery } from "@/lib/setlists";

/** A gig's setlist, program and extra info (#328), as the form holds them (texts as typed). */
export type ExtrasDraft = {
  /** The setlist to make with the gig (#358), while it has none. */
  setlist: { from: string | null } | null;
  getInTime: string;
  soundcheckTime: string;
  programLinks: WebLink[];
  programNotes: string;
  pay: string;
  payNotes: string;
  sharedBackline: boolean;
  backlineNotes: string;
  techniciansProvided: boolean;
  notes: string;
};

const sectionTitle = "font-heading font-semibold text-base";

/**
 * The gig form's setlist (#358). A gig without one: none yet, a new one, or a copy of one of the
 * band's current setlists, made when the gig is saved and named after it (`title`: null until the
 * form has a title or a venue, which the name needs). A gig with one: that setlist, which never
 * changes.
 */
export function GigSetlistField({
  bandSlug,
  linkedId,
  title,
  value,
  onChange,
}: {
  bandSlug: string;
  /** The gig's own setlist, once it has one. */
  linkedId: string | null;
  /** The setlist's future title, from the form; null while the gig has no name yet. */
  title: string | null;
  value: { from: string | null } | null;
  onChange: (value: { from: string | null } | null) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const setlists = useQuery(setlistsQuery(bandSlug)).data ?? [];
  const linked = useQuery({ ...setlistQuery(bandSlug, linkedId ?? ""), enabled: !!linkedId }).data;

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-2">
      <h3 id={`${id}-title`} className={sectionTitle}>
        {t("gigs.setlist.title")}
      </h3>
      {linkedId ? (
        <>
          {linked && (
            <Link
              to="/b/$bandSlug/setlists/$setlistId"
              params={{ bandSlug, setlistId: linkedId }}
              className="block break-words text-primary text-sm underline-offset-4 hover:underline"
            >
              {linked.title}
            </Link>
          )}
          <p className="text-muted-foreground text-xs">{t("gigs.setlist.linked")}</p>
        </>
      ) : (
        <>
          <select
            aria-labelledby={`${id}-title`}
            aria-describedby={`${id}-hint`}
            disabled={title === null}
            value={value ? (value.from ?? NEW) : ""}
            onChange={(event) => {
              const choice = event.target.value;
              onChange(choice ? { from: choice === NEW ? null : choice } : null);
            }}
            className="h-10 w-full min-w-0 rounded-4xl border border-input bg-input/30 px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 md:text-sm"
          >
            <option value="">{t("gigs.setlist.none")}</option>
            <option value={NEW}>{t("gigs.setlist.new")}</option>
            {setlists.length > 0 && (
              <optgroup label={t("gigs.setlist.from")}>
                {setlists.map((setlist) => (
                  <option key={setlist.id} value={setlist.id}>
                    {setlist.title} · {formatSetlistDuration(t, setlist.duration)}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <p id={`${id}-hint`} className="break-words text-muted-foreground text-xs">
            {title === null ? t("gigs.setlist.needsName") : t("gigs.setlist.hint", { title })}
          </p>
        </>
      )}
    </section>
  );
}

/** The select's value for a new, empty setlist. */
const NEW = "new";

/** The gig form's program (#328): web links to the show's advertising, and free text. */
export function GigProgramFields({
  value,
  onChange,
}: {
  value: Pick<ExtrasDraft, "programLinks" | "programNotes">;
  onChange: (patch: Partial<ExtrasDraft>) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <section aria-labelledby={`${id}-title`} className="space-y-3">
      <h3 id={`${id}-title`} className={sectionTitle}>
        {t("gigs.program.title")}
      </h3>
      <WebLinksEditor
        label={t("gigs.program.links")}
        links={value.programLinks}
        max={GIG_LIMITS.programLinks}
        onChange={(programLinks) => onChange({ programLinks })}
      />
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-notes`}>{t("gigs.program.notes")}</Label>
        <Textarea
          id={`${id}-notes`}
          rows={3}
          value={value.programNotes}
          maxLength={GIG_MAX_LENGTH.programNotes}
          placeholder={t("gigs.program.notesPlaceholder")}
          onChange={(event) => onChange({ programNotes: event.target.value })}
        />
      </div>
    </section>
  );
}

/** The gig form's extra info (#328): get-in time, pay, shared backline, technicians, notes. */
export function GigExtraInfoFields({
  value,
  onChange,
  payInvalid,
}: {
  value: ExtrasDraft;
  onChange: (patch: Partial<ExtrasDraft>) => void;
  payInvalid: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <section aria-labelledby={`${id}-title`} className="space-y-3">
      <h3 id={`${id}-title`} className={sectionTitle}>
        {t("gigs.extras.title")}
      </h3>
      <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor={`${id}-getin`}>{t("gigs.extras.getIn")}</Label>
          <Input
            id={`${id}-getin`}
            type="time"
            value={value.getInTime}
            onChange={(event) => onChange({ getInTime: event.target.value })}
          />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor={`${id}-soundcheck`}>{t("gigs.extras.soundcheck")}</Label>
          <Input
            id={`${id}-soundcheck`}
            type="time"
            value={value.soundcheckTime}
            onChange={(event) => onChange({ soundcheckTime: event.target.value })}
          />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor={`${id}-pay`}>{t("gigs.extras.pay")}</Label>
          <Input
            id={`${id}-pay`}
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={payInvalid}
            value={value.pay}
            onChange={(event) => onChange({ pay: event.target.value })}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-paynotes`}>
          {t("gigs.extras.payNotes")}{" "}
          <span className="font-normal text-muted-foreground">{t("gigs.optional")}</span>
        </Label>
        <Input
          id={`${id}-paynotes`}
          value={value.payNotes}
          maxLength={GIG_MAX_LENGTH.payNotes}
          onChange={(event) => onChange({ payNotes: event.target.value })}
        />
      </div>
      <div className="space-y-2">
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="size-5 accent-primary"
            checked={value.sharedBackline}
            onChange={(event) => onChange({ sharedBackline: event.target.checked })}
          />
          {t("gigs.extras.sharedBackline")}
        </label>
        {value.sharedBackline && (
          <Textarea
            rows={3}
            aria-label={t("gigs.extras.backlineNotes")}
            placeholder={t("gigs.extras.backlinePlaceholder")}
            value={value.backlineNotes}
            maxLength={GIG_MAX_LENGTH.backlineNotes}
            onChange={(event) => onChange({ backlineNotes: event.target.value })}
          />
        )}
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="size-5 accent-primary"
            checked={value.techniciansProvided}
            onChange={(event) => onChange({ techniciansProvided: event.target.checked })}
          />
          {t("gigs.extras.technicians")}
        </label>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-notes`}>{t("gigs.extras.notes")}</Label>
        <Textarea
          id={`${id}-notes`}
          rows={3}
          value={value.notes}
          maxLength={GIG_MAX_LENGTH.notes}
          onChange={(event) => onChange({ notes: event.target.value })}
        />
      </div>
    </section>
  );
}
