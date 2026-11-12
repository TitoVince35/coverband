// Live mode's documents (brief 031, #309): which of a song's documents get a button, and what the
// button says; the "All" switch, remembered on the device.
import {
  type DocumentKind,
  type Instrument,
  instrumentLabel,
  type Language,
} from "@coverband/shared";

/** A short title: about 12 characters, cut with "…". */
export const SHORT_TITLE_LENGTH = 12;

export function shortTitle(title: string) {
  const characters = [...title.trim()];
  return characters.length <= SHORT_TITLE_LENGTH
    ? characters.join("")
    : `${characters
        .slice(0, SHORT_TITLE_LENGTH - 1)
        .join("")
        .trimEnd()}…`;
}

/** The same instrument, a known one by its code, free text whatever its case. */
export function sameInstrument(a: Instrument, b: Instrument) {
  if ("code" in a && "code" in b) return a.code === b.code;
  if ("label" in a && "label" in b) return a.label.toLowerCase() === b.label.toLowerCase();
  return false;
}

type Document = { id: string; title: string; kind: DocumentKind; instruments: Instrument[] };

export type LiveDocument<D extends Document> = {
  document: D;
  /** The instrument its button shows, or null for an untagged document. */
  instrument: Instrument | null;
  label: string;
};

/**
 * A song's documents with a button in live mode: photos only (no PDF in this first version), the
 * ones the phone can open now (`canOpen`), and unless `all`, the member's own instruments' and the
 * untagged ones. Each labelled with its instrument (the member's own first), or its short title
 * when untagged; the short title is added when two buttons would read the same.
 */
export function liveDocuments<D extends Document>(
  documents: readonly D[],
  {
    mine,
    all,
    canOpen,
    language,
  }: {
    mine: readonly Instrument[];
    all: boolean;
    canOpen: (id: string) => boolean;
    language: Language;
  },
): LiveDocument<D>[] {
  const isMine = (instrument: Instrument) => mine.some((own) => sameInstrument(own, instrument));
  const shown = documents.filter(
    (document) =>
      document.kind === "photo" &&
      canOpen(document.id) &&
      (all || document.instruments.length === 0 || document.instruments.some(isMine)),
  );
  const labelled = shown.map((document) => {
    const instrument = document.instruments.find(isMine) ?? document.instruments[0] ?? null;
    const label = instrument ? instrumentLabel(instrument, language) : shortTitle(document.title);
    return { document, instrument, label };
  });
  return labelled.map((entry) => {
    const twin = labelled.some((other) => other !== entry && other.label === entry.label);
    return twin && entry.instrument
      ? { ...entry, label: `${entry.label} · ${shortTitle(entry.document.title)}` }
      : entry;
  });
}

export const LIVE_ALL_DOCUMENTS_STORAGE_KEY = "coverband-live-all-documents";

/** Whether live mode shows every instrument's documents: only a stored "true" says so. */
export function readAllDocuments(): boolean {
  try {
    return localStorage.getItem(LIVE_ALL_DOCUMENTS_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function storeAllDocuments(all: boolean) {
  try {
    localStorage.setItem(LIVE_ALL_DOCUMENTS_STORAGE_KEY, String(all));
  } catch {
    // Storage unavailable (private mode): the choice lasts for this page only.
  }
}
