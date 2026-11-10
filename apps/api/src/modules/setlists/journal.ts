import { inArray } from "drizzle-orm";
import { setlists } from "../../core/db/schema";
import type { JournalDetails, JournalSource } from "../journal/service";

/** Setlists in the band journal: the setlist's current title (null once deleted). */
export const setlistJournalSource: JournalSource = {
  target: "setlist",
  async details(db, events) {
    const ids = [...new Set(events.map((event) => event.targetId))];
    const rows = await db
      .select({ id: setlists.id, title: setlists.title })
      .from(setlists)
      .where(inArray(setlists.id, ids));
    const titles = new Map(rows.map((row) => [row.id, row.title]));
    return new Map(
      events.map((event): [string, JournalDetails] => [
        event.id,
        { setlist: titles.get(event.targetId) ?? null },
      ]),
    );
  },
};
