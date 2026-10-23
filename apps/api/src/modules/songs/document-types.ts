import { DOCUMENT_EXTENSIONS, type DocumentKind } from "@coverband/shared";
import { imageType } from "../../core/images";

/** What a document's file is, as it is stored and served. */
export type DocumentType = {
  kind: DocumentKind;
  /** Served with it: an image's or a PDF's own type, else a download. */
  contentType: string;
  extension: string;
};

const ascii = (bytes: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...bytes.subarray(start, end));

/** A zip archive (`.gp`, `.mscz`): both apps save their files as one. */
const isZip = (bytes: Uint8Array) => ascii(bytes, 0, 4) === "PK\u0003\u0004";

/**
 * The type of a document's file (#238) from its first bytes and its name's extension together,
 * never the type the browser declares; null for anything else (an SVG, a Word file, a zip that
 * isn't a score). Photos and PDFs keep their type; Guitar Pro and MuseScore files are downloads.
 */
export function documentType(bytes: Uint8Array, fileName: string): DocumentType | null {
  const extension = /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase() ?? "";
  const is = (kind: DocumentKind) => DOCUMENT_EXTENSIONS[kind].includes(extension);
  const download = (kind: DocumentKind): DocumentType => ({
    kind,
    contentType: "application/octet-stream",
    extension,
  });

  // A photo whatever it's called: the browser shrinks it and may rename it.
  const image = imageType(bytes, ["image/jpeg", "image/png", "image/webp"]);
  if (image) return { kind: "photo", contentType: image.type, extension: image.extension };
  if (ascii(bytes, 0, 5) === "%PDF-") {
    return { kind: "pdf", contentType: "application/pdf", extension: "pdf" };
  }
  if (is("guitarpro")) {
    // Guitar Pro 7 and later: a zip; 6: a "BCFS" container; 3 to 5: a header with their name.
    if (extension === "gp" && isZip(bytes)) return download("guitarpro");
    if (extension === "gpx" && ascii(bytes, 0, 4) === "BCFS") return download("guitarpro");
    if (/^gp[345]$/.test(extension) && ascii(bytes, 1, 19) === "FICHIER GUITAR PRO") {
      return download("guitarpro");
    }
  }
  if (is("musescore")) {
    if (extension === "mscz" && isZip(bytes)) return download("musescore");
    // Uncompressed: an XML document whose root is <museScore>.
    const head = new TextDecoder().decode(bytes.subarray(0, 1024));
    if (extension === "mscx" && /^\s*(<\?xml[^>]*>\s*)?<museScore[\s>]/.test(head)) {
      return download("musescore");
    }
  }
  return null;
}
