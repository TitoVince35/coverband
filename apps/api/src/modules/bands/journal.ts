import type { JournalDetails, JournalSource } from "../journal/service";

/** The band in its journal: the new genre (null: genre removed), and whether a logo was removed. */
export const bandJournalSource: JournalSource = {
  target: "band",
  async details(_db, events) {
    const details = new Map<string, JournalDetails>();
    for (const event of events) {
      if (event.action === "band.genre_changed") {
        details.set(event.id, {
          genre: typeof event.data?.genre === "string" ? event.data.genre : null,
        });
      } else if (event.action === "band.logo_changed") {
        details.set(event.id, { logo: event.data?.change === "removed" ? "removed" : "changed" });
      }
    }
    return details;
  },
};
