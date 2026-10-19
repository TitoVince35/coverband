import { Hono } from "hono";
import type { SessionEnv } from "../../core/http/session";
import type { AppDeps } from "../../deps";
import { requireMember } from "../bands/guard";
import { bandJournal } from "./service";

/** The band's journal (/api/bands/:bandSlug/activity): its latest activity, for every member. */
export function journalRoutes(deps: AppDeps) {
  const { db } = deps;
  return new Hono<SessionEnv>()
    .use(requireMember(db))
    .get("/", async (c) => c.json({ entries: await bandJournal(db, c.var.band.id) }));
}
