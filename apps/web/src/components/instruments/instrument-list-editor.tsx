import { type Instrument, instrumentLabel, MAX_INSTRUMENTS } from "@coverband/shared";
import { X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { InstrumentIcon } from "@/components/instrument-icon";
import { InstrumentPicker } from "@/components/instrument-picker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/i18n/use-language";
import { instrumentKey } from "@/lib/instrument-picker";

/** The list with an instrument added at the end, unless it's already there. */
export const withAdded = (current: Instrument[], instrument: Instrument | null) =>
  !instrument || current.some((i) => instrumentKey(i) === instrumentKey(instrument))
    ? current
    : [...current, instrument];

type Props = {
  /** For the picker's label. */
  id: string;
  list: Instrument[];
  onChange: (list: Instrument[]) => void;
  /** What's typed in the picker, not added yet: saving keeps it too (`withAdded`). */
  typed: Instrument | null;
  onType: (instrument: Instrument | null) => void;
  /** Marks the first one as the main instrument (a member's own list). */
  showMain?: boolean;
  /** Inside another form: Enter adds the typed text without submitting it. */
  nested?: boolean;
};

/**
 * Edits a list of instruments (#77, reused by song links): remove with ✕, add with the picker.
 * Choosing from the list, or Enter on the typed text, adds it; typing alone doesn't.
 */
export function InstrumentListEditor({
  id,
  list,
  onChange,
  typed,
  onType,
  showMain,
  nested,
}: Props) {
  const { t } = useTranslation();
  const language = useLanguage();
  // A new picker after each addition: empty again, ready for the next one.
  const [pickerKey, setPickerKey] = useState(0);

  function add(instrument: Instrument) {
    onChange(withAdded(list, instrument));
    onType(null);
    setPickerKey((key) => key + 1);
  }

  const picker = (
    <InstrumentPicker
      key={pickerKey}
      id={id}
      value={typed}
      exclude={list}
      onChange={onType}
      onPick={add}
      // After an addition, the new empty field keeps the focus (and a phone its keyboard).
      autoFocus={pickerKey > 0}
    />
  );

  return (
    <>
      {list.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("lineup.instruments.none")}</p>
      ) : (
        <ul className="space-y-1">
          {list.map((instrument, index) => {
            const label = instrumentLabel(instrument, language);
            return (
              <li
                key={instrumentKey(instrument)}
                className="flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5"
              >
                <InstrumentIcon instrument={instrument} />
                <span className="flex-1 text-sm">{label}</span>
                {showMain && index === 0 && (
                  <span className="text-muted-foreground text-xs">
                    {t("lineup.instruments.main")}
                  </span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("lineup.instruments.remove", { label })}
                  onClick={() => onChange(list.filter((_, i) => i !== index))}
                >
                  <X />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {list.length < MAX_INSTRUMENTS && (
        <div className="space-y-2">
          <Label htmlFor={id}>{t("lineup.instruments.add")}</Label>
          {nested ? (
            // The picker handles Enter itself while its list is open; otherwise Enter adds.
            // biome-ignore lint/a11y/noStaticElementInteractions: only catches Enter from the input.
            <div
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.defaultPrevented) {
                  event.preventDefault();
                  if (typed) add(typed);
                }
              }}
            >
              {picker}
            </div>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (typed) add(typed);
              }}
            >
              {picker}
            </form>
          )}
        </div>
      )}
    </>
  );
}
