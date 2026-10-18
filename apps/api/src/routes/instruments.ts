import { Hono } from "hono";
import type { AppDeps } from "../app";
import { sharedCustomInstruments } from "../instruments";
import { requireUser, type SessionEnv } from "../middleware/session";

/** Instruments shared by every band (/api/instruments), for the instrument picker. */
export function instrumentRoutes(deps: AppDeps) {
  return new Hono<SessionEnv>()
    .use(requireUser)
    .get("/suggestions", async (c) => c.json({ labels: await sharedCustomInstruments(deps.db) }));
}
