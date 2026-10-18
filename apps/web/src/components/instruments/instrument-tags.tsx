import { type Instrument, instrumentLabel } from "@coverband/shared";
import { InstrumentIcon } from "@/components/instrument-icon";
import { useLanguage } from "@/i18n/use-language";
import { cn } from "@/lib/utils";

/** Instruments as small tags with their icon, in order (the first is the main one). */
export function InstrumentTags({
  instruments,
  className,
}: {
  instruments: readonly Instrument[];
  className?: string;
}) {
  const language = useLanguage();
  if (instruments.length === 0) return null;
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {instruments.map((instrument) => {
        const label = instrumentLabel(instrument, language);
        return (
          <li
            key={label}
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs"
          >
            <InstrumentIcon instrument={instrument} className="size-3.5" />
            {label}
          </li>
        );
      })}
    </ul>
  );
}
