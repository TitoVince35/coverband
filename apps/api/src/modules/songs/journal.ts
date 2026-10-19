import { inArray } from "drizzle-orm";
import { songs } from "../../core/db/schema";
import type { JournalDetails, JournalSource } from "../journal/service";

/** Songs in the band journal: the song's current title (null once deleted) and its new status. */
export const songJournalSource: JournalSource = {
  target: "song",
  async details(db, events) {
    const ids = [...new Set(events.map((event) => event.targetId))];
    const rows = await db
      .select({ id: songs.id, title: songs.title })
      .from(songs)
      .where(inArray(songs.id, ids));
    const titles = new Map(rows.map((row) => [row.id, row.title]));
    return new Map(
      events.map((event): [string, JournalDetails] => [
        event.id,
        {
          song: titles.get(event.targetId) ?? null,
          // The new status, a code from SONG_STATUSES.
          ...(event.action === "song.status_changed"
            ? { status: typeof event.data?.status === "string" ? event.data.status : null }
            : {}),
        },
      ]),
    );
  },
};
