import { APP_NAME } from "@coverband/shared";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import {
  DEFAULT_LANGUAGE,
  isLanguage,
  LANGUAGE_STORAGE_KEY,
  LANGUAGES,
  type Language,
  pickLanguage,
} from "./languages";
import en from "./locales/en.json";
import fr from "./locales/fr.json";

export const resources = {
  en: { translation: en },
  fr: { translation: fr },
} as const;

/** The language explicitly chosen on this device, if any. */
export function readStoredLanguage(): Language | null {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** Explicit choice first, then the browser's preferences, then English. */
function detectLanguage(): Language {
  return readStoredLanguage() ?? pickLanguage(navigator.languages ?? [navigator.language]);
}

i18n.on("languageChanged", (language) => {
  document.documentElement.lang = language;
});

await i18n.use(initReactI18next).init({
  resources,
  lng: detectLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: Object.keys(LANGUAGES),
  // React already escapes. `{{appName}}` works in every translation.
  interpolation: { escapeValue: false, defaultVariables: { appName: APP_NAME } },
  returnNull: false,
});

/** Switches language and remembers the choice on this device. */
export async function changeLanguage(language: Language) {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Storage unavailable: the choice lasts for this page only.
  }
  await i18n.changeLanguage(language);
}

export default i18n;
