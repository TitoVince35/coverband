import { Hono } from "hono";
import { requireAdmin, type SessionEnv } from "../../core/http/session";
import type { AppDeps } from "../../deps";
import { usersWithBands } from "./service";

/** Administration console API (/api/admin), application admins only. Leader invitations: see invitations. */
export function adminRoutes(deps: AppDeps) {
  return new Hono<SessionEnv>()
    .use(requireAdmin)
    .get("/users", async (c) => c.json({ users: await usersWithBands(deps.db) }));
}
