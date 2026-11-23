import { normalizeName } from "@coverband/shared";

/**
 * The band's venues matching what's typed in the gig form's venue box: every word in the name or
 * the city, accents and case ignored; names starting with it first. Every venue when it's empty.
 */
export function searchVenues<T extends { name: string; city: string }>(
  venues: readonly T[],
  text: string,
): T[] {
  const words = normalizeName(text).split(" ").filter(Boolean);
  if (words.length === 0) return [...venues];
  const query = words.join(" ");
  return venues
    .map((venue) => ({ venue, haystack: normalizeName(`${venue.name} ${venue.city}`) }))
    .filter(({ haystack }) => words.every((word) => haystack.includes(word)))
    .sort(
      (a, b) =>
        Number(normalizeName(b.venue.name).startsWith(query)) -
        Number(normalizeName(a.venue.name).startsWith(query)),
    )
    .map(({ venue }) => venue);
}
