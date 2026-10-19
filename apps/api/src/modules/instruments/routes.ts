import { Hono } from "hono";
import { requireUser, type SessionEnv } from "../../core/http/session";
import type { AppDeps } from "../../deps";
import { sharedCustomInstruments } from "./service";

/** Instruments shared by every band (/api/instruments), for the instrument picker. */
export function instrumentRoutes(deps: AppDeps) {
  return new Hono<SessionEnv>()
    .use(requireUser)
    .get("/suggestions", async (c) => c.json({ labels: await sharedCustomInstruments(deps.db) }));
}
