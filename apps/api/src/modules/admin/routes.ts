import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { apiError } from "../../core/errors";
import { requireAdmin, type SessionEnv } from "../../core/http/session";
import { validationHook } from "../../core/http/validation";
import type { AppDeps } from "../../deps";
import { ADMIN_BAND_SORTS, adminBandPage } from "../bands/service";
import type { JournalSource } from "../journal/service";
import { adminBandDetails, adminStats, usersWithBands } from "./service";

/** A list page of the admin app (react-admin's pagination, sort and search). */
const listQuery = <Sort extends string>(sorts: readonly [Sort, ...Sort[]], defaultSort: Sort) =>
  z.object({
    page: z.coerce.number().int().min(1).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(25),
    sort: z.enum(sorts).default(defaultSort),
    order: z.enum(["asc", "desc"]).default("asc"),
    q: z
      .string()
      .trim()
      .max(100)
      .optional()
      .transform((q) => q || undefined),
  });

const bandListQuery = listQuery(ADMIN_BAND_SORTS, "name");
const idParam = z.object({ id: z.uuid() });

/**
 * Administration console API (/api/admin), application admins only. Leader invitations: see
 * invitations. `journalSources`: what the band journal needs (as `/bands/:bandSlug/activity`).
 */
export function adminRoutes(deps: AppDeps, journalSources: readonly JournalSource[]) {
  const { db } = deps;
  return new Hono<SessionEnv>()
    .use(requireAdmin)
    .get("/stats", async (c) => c.json(await adminStats(db, new Date())))
    .get("/users", async (c) => c.json({ users: await usersWithBands(db) }))
    .get("/bands", zValidator("query", bandListQuery, validationHook), async (c) =>
      c.json(await adminBandPage(db, c.req.valid("query"))),
    )
    .get("/bands/:id", zValidator("param", idParam, validationHook), async (c) => {
      const band = await adminBandDetails(db, c.req.valid("param").id, journalSources);
      if (!band) return apiError(c, 404, "Band not found");
      return c.json({ data: band });
    });
}
