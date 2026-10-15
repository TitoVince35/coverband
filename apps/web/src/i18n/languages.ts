export const LANGUAGES = {
  en: "English",
  fr: "Français",
} as const;

export type Language = keyof typeof LANGUAGES;

export const DEFAULT_LANGUAGE: Language = "en";
export const LANGUAGE_STORAGE_KEY = "coverband-language";

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
