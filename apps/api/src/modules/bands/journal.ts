import type { JournalDetails, JournalSource } from "../journal/service";

/** The band in its journal: the new genre is the only detail shown (null: genre removed). */
export const bandJournalSource: JournalSource = {
  target: "band",
  async details(_db, events) {
    return new Map(
      events
        .filter((event) => event.action === "band.genre_changed")
        .map((event): [string, JournalDetails] => [
          event.id,
          { genre: typeof event.data?.genre === "string" ? event.data.genre : null },
        ]),
    );
  },
};
