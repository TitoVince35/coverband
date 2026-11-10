// Setlists (brief 026): a band's ordered songs, in parts.

/** Length limits for a setlist's texts, shared by the API and the forms. */
export const SETLIST_MAX_LENGTH = { title: 100, partName: 50 } as const;

/**
 * How much a band keeps: current setlists per band (archived ones not counted), parts and songs
 * per setlist.
 */
export const SETLIST_LIMITS = { perBand: 50, parts: 5, songs: 50 } as const;
