import { eq, inArray } from "drizzle-orm";
import { gigs, venues } from "../../core/db/schema";
import type { JournalDetails, JournalSource } from "../journal/service";

/**
 * Gigs in the band journal: the gig's current name, its title or else its venue's name (null
 * once deleted), and its date.
 */
export const gigJournalSource: JournalSource = {
  target: "gig",
  async details(db, events) {
    const ids = [...new Set(events.map((event) => event.targetId))];
    const rows = await db
      .select({ id: gigs.id, title: gigs.title, venue: venues.name, date: gigs.date })
      .from(gigs)
      .leftJoin(venues, eq(venues.id, gigs.venueId))
      .where(inArray(gigs.id, ids));
    const found = new Map(rows.map((row) => [row.id, row]));
    return new Map(
      events.map((event): [string, JournalDetails] => {
        const gig = found.get(event.targetId);
        return [
          event.id,
          { gig: gig ? (gig.title ?? gig.venue) : null, gigDate: gig?.date ?? null },
        ];
      }),
    );
  },
};
