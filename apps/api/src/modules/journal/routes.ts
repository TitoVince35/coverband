import { Hono } from "hono";
import type { SessionEnv } from "../../core/http/session";
import type { AppDeps } from "../../deps";
import { requireMember } from "../bands/guard";
import { bandJournal, type JournalSource } from "./service";

/**
 * The band's journal (/api/bands/:bandSlug/activity): its latest activity, for every member, with
 * the details each module's source gives about its events.
 */
export function journalRoutes(deps: AppDeps, sources: readonly JournalSource[]) {
  const { db } = deps;
  return new Hono<SessionEnv>()
    .use(requireMember(db))
    .get("/", async (c) => c.json({ entries: await bandJournal(db, c.var.band.id, sources) }));
}
