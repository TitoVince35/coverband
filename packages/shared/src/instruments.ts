import { FIELD_MAX_LENGTH } from "./bands";
import type { Language } from "./languages";

/**
 * Known instruments, by stable code (stored in the database, never renamed). Anything else is
 * free text, shown with a default icon. Labels and icons are looked up from the code.
 */
export const INSTRUMENTS = [
  "guitar",
  "bass_guitar",
  "drums",
  "vocals",
  "keyboards",
  "accordion",
  "violin",
  "cello",
  "upright_bass",
  "piano",
  "trumpet",
  "trombone",
  "french_horn",
  "tuba",
  "sousaphone",
  "percussion",
  "saxophone",
  "banjo",
  "ukulele",
  "flute",
  "clarinet",
  "harmonica",
] as const;

export type InstrumentCode = (typeof INSTRUMENTS)[number];

/** A known instrument, or free text for the others. */
export type Instrument = { code: InstrumentCode } | { label: string };

/** Longest free-text instrument (the onboarding's instrument field already used it). */
export const INSTRUMENT_LABEL_MAX_LENGTH = FIELD_MAX_LENGTH.instrument;

/** Instruments one member can list in a band (and a song's link can name). */
export const MAX_INSTRUMENTS = 10;

export function isInstrumentCode(value: unknown): value is InstrumentCode {
  return typeof value === "string" && (INSTRUMENTS as readonly string[]).includes(value);
}

/**
 * Checks a stored or received value. An unknown code (a corrupted value, or one day a code
 * removed from the catalogue) becomes free text instead of breaking labels and icons; anything
 * else that isn't an instrument gives null.
 */
export function parseInstrument(value: unknown): Instrument | null {
  if (typeof value !== "object" || value === null) return null;
  const { code, label } = value as { code?: unknown; label?: unknown };
  if (isInstrumentCode(code)) return { code };
  const text = typeof code === "string" ? code : label;
  return typeof text === "string" ? toInstrument(text) : null;
}

/**
 * Names per language: the label first, then synonyms people type. Matching uses every language,
 * so a French speaker typing "bass" or an English one typing « basse » finds the same code.
 * Here rather than in the web app's locale files: the API matches free text too.
 */
export const INSTRUMENT_NAMES: Record<InstrumentCode, Record<Language, readonly string[]>> = {
  guitar: {
    en: [
      "Guitar",
      "electric guitar",
      "acoustic guitar",
      "rhythm guitar",
      "lead guitar",
      "guitarist",
    ],
    fr: [
      "Guitare",
      "guitare électrique",
      "guitare acoustique",
      "guitare rythmique",
      "gratte",
      "guitariste",
    ],
  },
  bass_guitar: {
    en: ["Bass guitar", "bass", "electric bass", "bassist", "bass player"],
    fr: ["Basse", "guitare basse", "basse électrique", "bassiste"],
  },
  drums: { en: ["Drums", "drum kit", "drummer"], fr: ["Batterie", "batteur", "batteuse"] },
  vocals: {
    en: ["Vocals", "voice", "singer", "singing", "lead vocals", "backing vocals"],
    fr: ["Chant", "voix", "chanteur", "chanteuse", "chœurs"],
  },
  keyboards: {
    en: ["Keyboards", "keyboard", "keys", "synth", "synthesizer", "organ", "keyboardist"],
    fr: ["Claviers", "clavier", "synthé", "synthétiseur", "orgue", "claviériste"],
  },
  accordion: { en: ["Accordion", "accordionist"], fr: ["Accordéon", "accordéoniste"] },
  violin: { en: ["Violin", "fiddle", "violinist"], fr: ["Violon", "violoniste"] },
  cello: { en: ["Cello", "violoncello", "cellist"], fr: ["Violoncelle", "violoncelliste"] },
  upright_bass: {
    en: ["Upright bass", "double bass", "contrabass"],
    fr: ["Contrebasse", "contrebassiste"],
  },
  piano: { en: ["Piano", "grand piano", "pianist"], fr: ["Piano", "piano à queue", "pianiste"] },
  trumpet: { en: ["Trumpet", "trumpeter"], fr: ["Trompette", "trompettiste"] },
  trombone: { en: ["Trombone", "trombonist"], fr: ["Trombone", "tromboniste"] },
  french_horn: { en: ["French horn"], fr: ["Cor", "cor d'harmonie"] },
  tuba: { en: ["Tuba"], fr: ["Tuba"] },
  sousaphone: { en: ["Sousaphone"], fr: ["Soubassophone", "sousaphone"] },
  percussion: {
    en: ["Percussion", "percussions", "congas", "bongos", "cajon", "percussionist"],
    fr: ["Percussions", "percussion", "percussionniste"],
  },
  saxophone: { en: ["Saxophone", "sax", "saxophonist"], fr: ["Saxophone", "saxo", "saxophoniste"] },
  banjo: { en: ["Banjo"], fr: ["Banjo"] },
  ukulele: { en: ["Ukulele", "uke"], fr: ["Ukulélé"] },
  flute: { en: ["Flute", "flutist", "flautist"], fr: ["Flûte", "flûte traversière", "flûtiste"] },
  clarinet: { en: ["Clarinet", "clarinetist"], fr: ["Clarinette", "clarinettiste"] },
  harmonica: { en: ["Harmonica"], fr: ["Harmonica"] },
};

/** Lowercase, no accents, no punctuation, single spaces: « Chœurs ! » → "choeurs". */
export function normalizeName(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/œ/gi, "oe")
    .replace(/æ/gi, "ae")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const byName = new Map<string, InstrumentCode>(
  INSTRUMENTS.flatMap((code) =>
    Object.values(INSTRUMENT_NAMES[code])
      .flat()
      .map((name) => [normalizeName(name), code] as const),
  ),
);

/** The known instrument this text names, in any language, or null. */
export function matchInstrument(text: string): InstrumentCode | null {
  return byName.get(normalizeName(text)) ?? null;
}

/**
 * What someone typed, as an instrument: a known code when it matches, tidied free text otherwise
 * (cut at INSTRUMENT_LABEL_MAX_LENGTH), null when blank.
 */
export function toInstrument(text: string): Instrument | null {
  const code = matchInstrument(text);
  if (code) return { code };
  const label = text.trim().replace(/\s+/g, " ").slice(0, INSTRUMENT_LABEL_MAX_LENGTH).trim();
  return label ? { label } : null;
}

export function instrumentLabel(instrument: Instrument, language: Language): string {
  if (!("code" in instrument)) return instrument.label;
  // An unchecked value may hold an unknown code: show it rather than break (see parseInstrument).
  const names = INSTRUMENT_NAMES[instrument.code] as
    | (typeof INSTRUMENT_NAMES)[InstrumentCode]
    | undefined;
  return names?.[language][0] ?? instrument.code;
}

/**
 * Known instruments for a picker: all of them for an empty query, else those with a name (any
 * language, synonyms included) containing it. Labels starting with the query come first, then
 * alphabetical order in the given language.
 */
export function searchInstruments(query: string, language: Language): InstrumentCode[] {
  const label = (code: InstrumentCode) => INSTRUMENT_NAMES[code][language][0] ?? "";
  const alphabetical = (a: InstrumentCode, b: InstrumentCode) =>
    label(a).localeCompare(label(b), language);
  if (!query.trim()) return [...INSTRUMENTS].sort(alphabetical);
  // Text with nothing comparable left (another alphabet, only symbols) matches nothing.
  const wanted = normalizeName(query);
  if (!wanted) return [];
  const names = (code: InstrumentCode) =>
    Object.values(INSTRUMENT_NAMES[code]).flat().map(normalizeName);
  const rank = (code: InstrumentCode) => (normalizeName(label(code)).startsWith(wanted) ? 0 : 1);
  return INSTRUMENTS.filter((code) => names(code).some((name) => name.includes(wanted))).sort(
    (a, b) => rank(a) - rank(b) || alphabetical(a, b),
  );
}

/** A list for display, in the given language: "Guitar, Vocals" (empty for none). */
export function instrumentsLabel(instruments: readonly Instrument[], language: Language): string {
  return instruments.map((instrument) => instrumentLabel(instrument, language)).join(", ");
}
