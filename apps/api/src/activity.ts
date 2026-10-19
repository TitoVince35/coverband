import type { ActivityAction, ActivityTarget } from "@coverband/shared";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Db, Tx } from "./db/client";
import { activity, songs, users } from "./db/schema";

export type ActivityEvent = {
  action: ActivityAction;
  /** Null for events outside a band. */
  bandId: string | null;
  /** The user who acted; null when nobody is logged in. */
  actorId: string | null;
  target: { type: ActivityTarget; id: string };
  /** Small, non-personal details: IDs, roles, codes. Never emails or names. */
  data?: Record<string, string | number | boolean | null>;
};

/**
 * Records a functional event. Pass the transaction of the change itself, so there is no event
 * without its change and no change without its event.
 */
export async function recordActivity(tx: Db | Tx, event: ActivityEvent) {
  await tx.insert(activity).values({
    action: event.action,
    bandId: event.bandId,
    actorId: event.actorId,
    targetType: event.target.type,
    targetId: event.target.id,
    data: event.data ?? null,
  });
}

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
