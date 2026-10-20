import { lt } from "drizzle-orm";
import type { Db } from "../db/client";
import { activity } from "../db/schema";

/** Activity rows are kept one year (briefs/claude/006_logging.md); logs, 30 days in Cockpit. */
export const ACTIVITY_RETENTION_DAYS = 365;

/** Deletes the activity older than the retention; returns how many rows went. */
export async function purgeActivity(db: Db, now = new Date()) {
  const cutoff = new Date(now.getTime() - ACTIVITY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(activity)
    .where(lt(activity.createdAt, cutoff))
    .returning({ id: activity.id });
  return deleted.length;
}
