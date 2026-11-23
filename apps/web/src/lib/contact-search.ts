import { normalizeName } from "@coverband/shared";

/**
 * The band's contacts whose name matches what's typed (#329): every word, accents and case
 * ignored, names starting with it first. None for an empty name: the dialog only suggests.
 */
export function searchContacts<T extends { name: string }>(contacts: readonly T[], text: string) {
  const words = normalizeName(text).split(" ").filter(Boolean);
  if (words.length === 0) return [];
  const query = words.join(" ");
  return contacts
    .filter((contact) => {
      const name = normalizeName(contact.name);
      return words.every((word) => name.includes(word));
    })
    .sort(
      (a, b) =>
        Number(normalizeName(b.name).startsWith(query)) -
        Number(normalizeName(a.name).startsWith(query)),
    );
}
