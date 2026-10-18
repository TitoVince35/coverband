import {
  type Instrument,
  instrumentLabel,
  type Language,
  matchInstrument,
  normalizeName,
  searchInstruments,
  toInstrument,
} from "@coverband/shared";

/** One line of the picker's list. `custom`: keep what was typed as a new free-text instrument. */
export type PickerOption = { instrument: Instrument; label: string; custom?: boolean };

/** Identity of an instrument in a list: its code, or its free text ignoring case and accents. */
export const instrumentKey = (instrument: Instrument) =>
  "code" in instrument ? instrument.code : `label:${normalizeName(instrument.label)}`;
const keyOf = instrumentKey;

/**
 * The picker's list for what's typed: known instruments matching it (all of them when nothing is
 * typed), then free-text instruments other bands use, then, when the text names none of them,
 * an option to keep it as is. Instruments already chosen (`exclude`) are left out.
 */
export function pickerOptions(
  text: string,
  language: Language,
  suggestions: readonly string[] = [],
  exclude: readonly Instrument[] = [],
): PickerOption[] {
  const excluded = new Set(exclude.map(keyOf));
  const wanted = normalizeName(text);
  const known = searchInstruments(text, language).map((code) => ({ code }) as Instrument);
  const shared = suggestions
    .filter((label) => !matchInstrument(label))
    .filter((label) => !text.trim() || (wanted && normalizeName(label).includes(wanted)))
    .map((label) => ({ label }) as Instrument);
  const options: PickerOption[] = [...known, ...shared]
    .filter((instrument) => !excluded.has(keyOf(instrument)))
    .map((instrument) => ({ instrument, label: instrumentLabel(instrument, language) }));

  const typed = toInstrument(text);
  const listed = typed && [...known, ...shared].some((i) => keyOf(i) === keyOf(typed));
  if (typed && "label" in typed && !listed && !excluded.has(keyOf(typed))) {
    options.push({ instrument: typed, label: typed.label, custom: true });
  }
  return options;
}
