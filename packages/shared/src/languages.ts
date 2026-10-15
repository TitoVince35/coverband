/** Supported languages, named in their own language. English is the default and fallback. */
export const LANGUAGES = {
  en: "English",
  fr: "Français",
} as const;

export type Language = keyof typeof LANGUAGES;

export const DEFAULT_LANGUAGE: Language = "en";

export function isLanguage(value: string | null | undefined): value is Language {
  return value != null && Object.hasOwn(LANGUAGES, value);
}

/** Picks the first supported language from preferences like `["fr-FR", "en-US"]`. */
export function pickLanguage(preferences: readonly string[]): Language {
  for (const preference of preferences) {
    const base = preference.toLowerCase().split("-")[0];
    if (isLanguage(base)) {
      return base;
    }
  }
  return DEFAULT_LANGUAGE;
}
