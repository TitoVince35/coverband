/** A download's name (a document's title, a setlist's): plain ASCII, and its UTF-8 form (RFC 6266). */
export function fileName(title: string, extension: string) {
  const name = `${title}.${extension}`;
  const ascii =
    name
      .normalize("NFD")
      .replace(/[^\x20-\x7e]/g, "")
      .replace(/["\\]/g, "") || "document";
  return `filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
