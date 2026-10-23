/**
 * What a song's document is (#238): a photo (a chord grid on paper), a PDF (a score), or a file
 * for an app (Guitar Pro, MuseScore). Photos and PDFs open in the app; the others are downloaded.
 */
export const DOCUMENT_KINDS = ["photo", "pdf", "guitarpro", "musescore"] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/** The extensions of each kind, as a file is named (lower case, without the dot). */
export const DOCUMENT_EXTENSIONS: Record<DocumentKind, readonly string[]> = {
  photo: ["jpg", "jpeg", "png", "webp"],
  pdf: ["pdf"],
  guitarpro: ["gp", "gpx", "gp5", "gp4", "gp3"],
  musescore: ["mscz", "mscx"],
};

/**
 * A document's limits: its size (photos are shrunk in the browser first), a song's count, and a
 * band's storage during the beta, so a mistake can't fill the bucket.
 */
export const DOCUMENT_LIMITS = {
  maxBytes: 4_000_000,
  perSong: 20,
  perBand: 500_000_000,
  title: 100,
} as const;

/** Whether the app shows this kind itself (photos, PDFs) rather than downloading it. */
export const opensInApp = (kind: DocumentKind) => kind === "photo" || kind === "pdf";

/** A document's file, served by the API to the band's members. Its file never changes. */
export function documentUrl(bandSlug: string, songId: string, documentId: string) {
  return `/api/bands/${bandSlug}/songs/${songId}/documents/${documentId}/file`;
}
