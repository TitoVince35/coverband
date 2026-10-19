import { MAX_ENERGY, SONG_STATUSES, type SongStatus } from "@coverband/shared";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<SongStatus, string> = {
  proposed: "border-border bg-transparent text-muted-foreground",
  learning: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  ready: "",
};

/** Where the band is with a song: proposed, learning or ready. */
export function SongStatusBadge({ status }: { status: SongStatus }) {
  const { t } = useTranslation();
  return <Badge className={STATUS_STYLES[status]}>{t(`songs.status.${status}`)}</Badge>;
}

/** Chili peppers for a song's energy; nothing when it isn't rated. */
export function EnergyPeppers({
  energy,
  className,
}: {
  energy: number | null;
  className?: string;
}) {
  const { t } = useTranslation();
  if (!energy) return null;
  return (
    <span
      role="img"
      aria-label={t("songs.energy.value", { count: energy, max: MAX_ENERGY })}
      className={cn("whitespace-nowrap", className)}
    >
      {"🌶️".repeat(energy)}
    </span>
  );
}

/** Chooses a song's status, one tap: three options side by side. */
export function StatusPicker({
  value,
  onChange,
  busy,
}: {
  value: SongStatus;
  onChange: (status: SongStatus) => void;
  /** A change is being saved: still focusable (keyboard users keep their place). */
  busy?: boolean;
}) {
  const { t } = useTranslation();
  const name = useId();
  return (
    <fieldset
      aria-busy={busy}
      className="inline-flex rounded-4xl bg-muted p-1 aria-busy:opacity-60"
    >
      <legend className="sr-only">{t("songs.status.label")}</legend>
      {SONG_STATUSES.map((status) => (
        <label
          key={status}
          className={cn(
            "relative rounded-4xl px-3 py-1.5 font-medium text-sm transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
            status === value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <input
            type="radio"
            name={name}
            value={status}
            checked={status === value}
            onChange={() => onChange(status)}
            // Invisible, over the whole label: a tap lands on the radio itself.
            className="absolute inset-0 cursor-pointer appearance-none rounded-4xl opacity-0"
          />
          {t(`songs.status.${status}`)}
        </label>
      ))}
    </fieldset>
  );
}

/** Rates a song's energy from 1 to MAX_ENERGY peppers; tapping the current rating clears it. */
export function EnergyPicker({
  value,
  onChange,
  busy,
}: {
  value: number | null;
  onChange: (energy: number | null) => void;
  /** A change is being saved: still focusable (keyboard users keep their place). */
  busy?: boolean;
}) {
  const { t } = useTranslation();
  const levels = Array.from({ length: MAX_ENERGY }, (_, i) => i + 1);
  return (
    <div aria-busy={busy} className="flex items-center gap-1 aria-busy:opacity-60">
      {levels.map((level) => (
        <button
          key={level}
          type="button"
          aria-label={t("songs.energy.set", { count: level, max: MAX_ENERGY })}
          aria-pressed={value === level}
          onClick={() => onChange(value === level ? null : level)}
          className={cn(
            "rounded-full p-1.5 text-xl leading-none outline-none transition focus-visible:ring-2 focus-visible:ring-ring",
            value !== null && level <= value ? "" : "opacity-30 grayscale hover:opacity-60",
          )}
        >
          🌶️
        </button>
      ))}
      <span className="ml-2 text-muted-foreground text-sm">
        {value
          ? t("songs.energy.value", { count: value, max: MAX_ENERGY })
          : t("songs.energy.none")}
      </span>
    </div>
  );
}
