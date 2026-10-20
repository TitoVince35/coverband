import type { ActivityAction, ActivityTarget } from "@coverband/shared";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "../../core/db/client";
import { activity, users } from "../../core/db/schema";

/** How many entries the band journal shows. */
export const JOURNAL_SIZE = 10;

/**
 * What an entry may add for its sentence, besides who did what and when: a song's current title
 * (null once deleted), a song's new status, a band's new genre (null: removed). A new kind of
 * detail is added here, and its sentence in the web app.
 */
export type JournalDetails = {
  song?: string | null;
  status?: string | null;
  genre?: string | null;
  /** A logo change: removed, or anything else (added, replaced, another background). */
  logo?: "changed" | "removed";
};

/** An event of the journal, as a source sees it. */
export type JournalEvent = {
  id: string;
  action: ActivityAction;
  targetId: string;
  data: Record<string, unknown> | null;
};

/**
 * A module's part of the journal: the details of the events about its targets (songs for the
 * songs module), by event id. Only what a sentence needs: never ids of other rows or emails.
 */
export type JournalSource = {
  target: ActivityTarget;
  details(db: Db, events: readonly JournalEvent[]): Promise<Map<string, JournalDetails>>;
};

/**
 * A band's latest activity, newest first, for its journal: what happened, when, and who did it
 * (their current display name; null once their account is deleted), with the details the
 * sources give. Only band events.
 */
export async function bandJournal(
  db: Db,
  bandId: string,
  sources: readonly JournalSource[],
  limit = JOURNAL_SIZE,
) {
  const rows = await db
    .select({
      id: activity.id,
      action: activity.action,
      createdAt: activity.createdAt,
      actorName: users.name,
      targetType: activity.targetType,
      targetId: activity.targetId,
      data: activity.data,
    })
    .from(activity)
    .leftJoin(users, eq(users.id, activity.actorId))
    .where(
      and(
        eq(activity.bandId, bandId),
        // A band leader joins by creating the band: "created the band" says it already.
        sql`not (${activity.action} = 'member.joined' and coalesce(${activity.data}->>'role', '') = 'leader')`,
      ),
    )
    .orderBy(desc(activity.createdAt), desc(activity.id))
    .limit(limit);

  const details = new Map<string, JournalDetails>();
  for (const source of sources) {
    const events = rows.filter((row) => row.targetType === source.target);
    if (events.length === 0) continue;
    for (const [id, found] of await source.details(db, events)) details.set(id, found);
  }
  return rows.map(({ targetType: _, targetId: __, data: ___, ...entry }) => ({
    ...entry,
    ...details.get(entry.id),
  }));
}
