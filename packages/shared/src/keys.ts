import type { Language } from "./languages";

/**
 * Musical keys of a song, as codes: the note (`#` sharp, `b` flat), then `m` for minor. Each key
 * is spelled the way musicians usually write it: D♭ major but C♯ minor, A♭ major but G♯ minor.
 */
export const MAJOR_KEYS = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "F#",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
] as const;
export const MINOR_KEYS = [
  "Cm",
  "C#m",
  "Dm",
  "Ebm",
  "Em",
  "Fm",
  "F#m",
  "Gm",
  "G#m",
  "Am",
  "Bbm",
  "Bm",
] as const;
export const MUSICAL_KEYS = [...MAJOR_KEYS, ...MINOR_KEYS] as const;

export type MusicalKey = (typeof MUSICAL_KEYS)[number];

export function isMusicalKey(value: unknown): value is MusicalKey {
  return typeof value === "string" && (MUSICAL_KEYS as readonly string[]).includes(value);
}

const NOTES: Record<Language, Record<string, string>> = {
  en: { C: "C", D: "D", E: "E", F: "F", G: "G", A: "A", B: "B" },
  fr: { C: "Do", D: "Ré", E: "Mi", F: "Fa", G: "Sol", A: "La", B: "Si" },
};
const MODES: Record<Language, { major: string; minor: string }> = {
  en: { major: "major", minor: "minor" },
  fr: { major: "majeur", minor: "mineur" },
};
const ACCIDENTALS: Record<string, string> = { "#": "♯", b: "♭" };

function parts(key: MusicalKey) {
  const minor = key.endsWith("m");
  const note = minor ? key.slice(0, -1) : key;
  return { letter: note.charAt(0), accidental: ACCIDENTALS[note.slice(1)] ?? "", minor };
}

/** A key in words: "E minor", "D♭ major"; « Mi mineur », « Ré♭ majeur ». */
export function keyLabel(key: MusicalKey, language: Language): string {
  const { letter, accidental, minor } = parts(key);
  return `${NOTES[language][letter]}${accidental} ${MODES[language][minor ? "minor" : "major"]}`;
}

/** A key in chord notation, the same in every language: "Em", "D♭", "C♯m". */
export function keyShort(key: MusicalKey): string {
  const { letter, accidental, minor } = parts(key);
  return `${letter}${accidental}${minor ? "m" : ""}`;
}
