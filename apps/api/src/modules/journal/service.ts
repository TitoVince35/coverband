import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "../../core/db/client";
import { activity, songs, users } from "../../core/db/schema";

/** How many entries the band journal shows. */
export const JOURNAL_SIZE = 10;

/**
 * A band's latest activity, newest first, for its journal: what happened, when, and who did it
 * (their current display name; null once their account is deleted). Only band events, and only
 * the details a sentence needs: the new genre, a song's current title (null once deleted) and new
 * status; never
 * ids of other rows or emails.
 */
export async function bandJournal(db: Db, bandId: string, limit = JOURNAL_SIZE) {
  const rows = await db
    .select({
      id: activity.id,
      action: activity.action,
      createdAt: activity.createdAt,
      actorName: users.name,
      data: activity.data,
      songTitle: songs.title,
    })
    .from(activity)
    .leftJoin(users, eq(users.id, activity.actorId))
    .leftJoin(songs, and(eq(activity.targetType, "song"), eq(songs.id, activity.targetId)))
    .where(
      and(
        eq(activity.bandId, bandId),
        // A band leader joins by creating the band: "created the band" says it already.
        sql`not (${activity.action} = 'member.joined' and coalesce(${activity.data}->>'role', '') = 'leader')`,
      ),
    )
    .orderBy(desc(activity.createdAt), desc(activity.id))
    .limit(limit);
  return rows.map(({ data, songTitle, ...entry }) => ({
    ...entry,
    ...(entry.action.startsWith("song.") ? { song: songTitle } : {}),
    // The new status, a code from SONG_STATUSES.
    ...(entry.action === "song.status_changed"
      ? { status: typeof data?.status === "string" ? data.status : null }
      : {}),
    // The new genre is the only detail shown (null: genre removed).
    ...(entry.action === "band.genre_changed"
      ? { genre: typeof data?.genre === "string" ? data.genre : null }
      : {}),
  }));
}
