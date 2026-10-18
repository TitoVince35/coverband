import { useTranslation } from "react-i18next";
import { DEFAULT_LANGUAGE, isLanguage, type Language } from "./languages";

/** The language the app is shown in, for helpers that take a `Language` (instrument labels...). */
export function useLanguage(): Language {
  const { i18n } = useTranslation();
  return isLanguage(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LANGUAGE;
}
