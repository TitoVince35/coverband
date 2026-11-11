import type { ActivityAction, ActivityTarget } from "@coverband/shared";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "../../core/db/client";
import { activity, users } from "../../core/db/schema";

/** How many entries the band journal shows. */
export const JOURNAL_SIZE = 10;
/** How many entries a song's history shows (#286). */
export const SONG_HISTORY_SIZE = 50;

/** A song's history (#286): its latest events, newest first, as the band journal tells them. */
export function songHistory(
  db: Db,
  bandId: string,
  songId: string,
  sources: readonly JournalSource[],
) {
  return bandJournal(db, bandId, sources, SONG_HISTORY_SIZE, { type: "song", id: songId });
}

/**
 * What an entry may add for its sentence, besides who did what and when: a song's current title
 * (null once deleted), a song's new status, a band's new genre (null: removed). A new kind of
 * detail is added here, and its sentence in the web app.
 */
export type JournalDetails = {
  song?: string | null;
  /** A setlist's current title (null once deleted). */
  setlist?: string | null;
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
  target?: { type: ActivityTarget; id: string },
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
        // One song's history (#286): only its own events, its documents' included.
        target && eq(activity.targetType, target.type),
        target && eq(activity.targetId, target.id),
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
  return rows.map(({ targetType, targetId, data: _, ...entry }) => ({
    ...entry,
    target: pageTarget(targetType, targetId),
    ...details.get(entry.id),
  }));
}

/** A target the web app has a page for (#285): the journal links to it. */
type PageTarget = { type: "song" | "setlist"; id: string };

/** An entry's target when it has a page, else null: never another kind's id (users, invitations). */
function pageTarget(type: ActivityTarget, id: string): PageTarget | null {
  return type === "song" || type === "setlist" ? { type, id } : null;
}
