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

/**
 * Names per language: the label first, then synonyms people type. Matching uses every language,
 * so a French speaker typing "bass" or an English one typing « basse » finds the same code.
 * Here rather than in the web app's locale files: the API matches free text too.
 */
export const INSTRUMENT_NAMES: Record<InstrumentCode, Record<Language, readonly string[]>> = {
  guitar: {
    en: ["Guitar", "electric guitar", "acoustic guitar", "rhythm guitar", "lead guitar"],
    fr: ["Guitare", "guitare électrique", "guitare acoustique", "guitare rythmique", "gratte"],
  },
  bass_guitar: {
    en: ["Bass guitar", "bass", "electric bass"],
    fr: ["Basse", "guitare basse", "basse électrique"],
  },
  drums: { en: ["Drums", "drum kit", "drummer"], fr: ["Batterie", "batteur", "batteuse"] },
  vocals: {
    en: ["Vocals", "voice", "singer", "singing", "lead vocals", "backing vocals"],
    fr: ["Chant", "voix", "chanteur", "chanteuse", "chœurs"],
  },
  keyboards: {
    en: ["Keyboards", "keyboard", "keys", "synth", "synthesizer", "organ"],
    fr: ["Claviers", "clavier", "synthé", "synthétiseur", "orgue"],
  },
  accordion: { en: ["Accordion"], fr: ["Accordéon"] },
  violin: { en: ["Violin", "fiddle"], fr: ["Violon"] },
  cello: { en: ["Cello", "violoncello"], fr: ["Violoncelle"] },
  upright_bass: { en: ["Upright bass", "double bass", "contrabass"], fr: ["Contrebasse"] },
  piano: { en: ["Piano", "grand piano"], fr: ["Piano", "piano à queue"] },
  trumpet: { en: ["Trumpet"], fr: ["Trompette"] },
  trombone: { en: ["Trombone"], fr: ["Trombone"] },
  french_horn: { en: ["French horn"], fr: ["Cor", "cor d'harmonie"] },
  tuba: { en: ["Tuba"], fr: ["Tuba"] },
  sousaphone: { en: ["Sousaphone"], fr: ["Soubassophone", "sousaphone"] },
  percussion: {
    en: ["Percussion", "percussions", "congas", "bongos", "cajon"],
    fr: ["Percussions", "percussion"],
  },
  saxophone: { en: ["Saxophone", "sax"], fr: ["Saxophone", "saxo"] },
  banjo: { en: ["Banjo"], fr: ["Banjo"] },
  ukulele: { en: ["Ukulele", "uke"], fr: ["Ukulélé"] },
  flute: { en: ["Flute"], fr: ["Flûte", "flûte traversière"] },
  clarinet: { en: ["Clarinet"], fr: ["Clarinette"] },
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

/** What someone typed, as an instrument: a known code when it matches, free text otherwise. */
export function toInstrument(text: string): Instrument {
  const code = matchInstrument(text);
  return code ? { code } : { label: text.trim().replace(/\s+/g, " ") };
}

export function instrumentLabel(instrument: Instrument, language: Language): string {
  return "code" in instrument
    ? (INSTRUMENT_NAMES[instrument.code][language][0] ?? "")
    : instrument.label;
}

/**
 * Known instruments for a picker: all of them for an empty query, else those with a name (any
 * language, synonyms included) containing it. Labels starting with the query come first, then
 * alphabetical order in the given language.
 */
export function searchInstruments(query: string, language: Language): InstrumentCode[] {
  const wanted = normalizeName(query);
  const label = (code: InstrumentCode) => INSTRUMENT_NAMES[code][language][0] ?? "";
  const names = (code: InstrumentCode) =>
    Object.values(INSTRUMENT_NAMES[code]).flat().map(normalizeName);
  const rank = (code: InstrumentCode) => (normalizeName(label(code)).startsWith(wanted) ? 0 : 1);
  return INSTRUMENTS.filter(
    (code) => !wanted || names(code).some((name) => name.includes(wanted)),
  ).sort((a, b) => rank(a) - rank(b) || label(a).localeCompare(label(b), language));
}
