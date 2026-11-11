/**
 * Where a journal sentence's link goes (#285): the sentence is translated with this marker in
 * place of the song's or setlist's name, then split around it, so the name becomes a link
 * wherever each language puts it. Never typed by anyone: a private-use character.
 */
export const LINK_MARKER = "";

/** The sentence's text before and after the marker; null when it has none (no link then). */
export function splitAtMarker(sentence: string): [before: string, after: string] | null {
  const at = sentence.indexOf(LINK_MARKER);
  if (at < 0) return null;
  return [sentence.slice(0, at), sentence.slice(at + LINK_MARKER.length)];
}
