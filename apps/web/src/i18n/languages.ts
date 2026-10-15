// Languages are shared with the API (emails); only the storage key is web-specific.
export {
  DEFAULT_LANGUAGE,
  isLanguage,
  LANGUAGES,
  type Language,
  pickLanguage,
} from "@coverband/shared";

export const LANGUAGE_STORAGE_KEY = "coverband-language";
