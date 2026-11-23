import { GIG_LIMITS, GIG_MAX_LENGTH, type WebLink } from "@coverband/shared";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { WebLinksEditor } from "@/components/gigs/web-links-editor";
import { formatSetlistDuration } from "@/components/setlists/setlist-duration";
import { SetlistTitleDialog } from "@/components/setlists/setlist-title-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useOnline } from "@/lib/online";
import { setlistQuery, setlistsQuery } from "@/lib/setlists";

/** A gig's setlist, program and extra info (#328), as the form holds them (texts as typed). */
export type ExtrasDraft = {
  setlistId: string | null;
  getInTime: string;
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
 * The gig form's setlist (the band's current setlists, the linked one even archived; "Create
 * setlist" opens the new one in the editor, `onCreateSetlist` keeping the form's draft first).
 */
export function GigSetlistField({
  bandSlug,
  gigKey,
  value,
  onChange,
  onCreateSetlist,
}: {
  bandSlug: string;
  /** The gig's id, or "new": where the new setlist leads back to. */
  gigKey: string;
  value: string | null;
  onChange: (setlistId: string | null) => void;
  onCreateSetlist: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const online = useOnline();
  const [creating, setCreating] = useState(false);
  const setlists = useQuery(setlistsQuery(bandSlug)).data ?? [];
  // The linked setlist, when it's archived (not in the current ones).
  const linked = useQuery({
    ...setlistQuery(bandSlug, value ?? ""),
    enabled: value !== null && !setlists.some((setlist) => setlist.id === value),
  }).data;

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-2">
      <h3 id={`${id}-title`} className={sectionTitle}>
        {t("gigs.setlist.title")}
      </h3>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-labelledby={`${id}-title`}
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value || null)}
          className="h-10 min-w-0 flex-1 basis-48 rounded-4xl border border-input bg-input/30 px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm"
        >
          <option value="">{t("gigs.setlist.none")}</option>
          {linked?.archivedAt && (
            <option value={linked.id}>{t("gigs.setlist.archived", { title: linked.title })}</option>
          )}
          {setlists.map((setlist) => (
            <option key={setlist.id} value={setlist.id}>
              {setlist.title} · {formatSetlistDuration(t, setlist.duration)}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="outline"
          disabled={!online}
          onClick={() => {
            onCreateSetlist();
            setCreating(true);
          }}
        >
          <Plus />
          {t("gigs.setlist.create")}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">{t("gigs.setlist.hint")}</p>
      <SetlistTitleDialog
        bandSlug={bandSlug}
        open={creating}
        onOpenChange={setCreating}
        forGig={gigKey}
      />
    </section>
  );
}

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
          <Input
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
