/** Length limits for profile and band fields, shared by the API and the forms. */
export const FIELD_MAX_LENGTH = {
  firstName: 50,
  lastName: 50,
  nickname: 50,
  instrument: 50,
  bandName: 60,
  genre: 50,
} as const;

/** Role of a member in a band. Distinct from the global admin role. */
export const BAND_ROLES = ["leader", "musician"] as const;
export type BandRole = (typeof BAND_ROLES)[number];

/**
 * URL-safe name of a band, used in `/b/:bandSlug`: "Les Rockeurs d'Été" → "les-rockeurs-d-ete".
 * Falls back to "band" when nothing usable is left (a name made only of symbols).
 */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/g, "");
  return slug || "band";
}

/** Name shown for a person: their nickname if they have one, else first and last name. */
export function displayName(person: {
  firstName: string;
  lastName: string;
  nickname?: string | null | undefined;
}): string {
  return person.nickname?.trim() || `${person.firstName} ${person.lastName}`.trim();
}
