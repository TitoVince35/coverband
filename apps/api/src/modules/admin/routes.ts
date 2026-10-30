import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { apiError } from "../../core/errors";
import { requireAdmin, type SessionEnv } from "../../core/http/session";
import { validationHook } from "../../core/http/validation";
import type { AppDeps } from "../../deps";
import { ADMIN_BAND_SORTS, adminBandPage, setBandDisabled } from "../bands/service";
import type { JournalSource } from "../journal/service";
import {
  ADMIN_USER_SORTS,
  adminBandDetails,
  adminStats,
  adminUserDetails,
  adminUserPage,
  deleteBand,
  deleteUser,
  sendPasswordReset,
  setUserBanned,
} from "./service";

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
/** A filter that's on with `true`, off otherwise. */
const flag = z
  .enum(["true", "false"])
  .optional()
  .transform((value) => value === "true");
const userListQuery = listQuery(ADMIN_USER_SORTS, "name").extend({
  admins: flag,
  bandless: flag,
});
const idParam = z.object({ id: z.uuid() });
const statusParam = idParam.extend({ status: z.enum(["disable", "enable"]) });
/** Deleting a band: its name, typed again. */
const deleteBandBody = z.object({ name: z.string().max(200) });

/**
 * Administration console API (/api/admin), application admins only. Leader invitations: see
 * invitations. `journalSources`: what the band journal needs (as `/bands/:bandSlug/activity`).
 */
export function adminRoutes(deps: AppDeps, journalSources: readonly JournalSource[]) {
  const { db } = deps;
  return (
    new Hono<SessionEnv>()
      .use(requireAdmin)
      .get("/stats", async (c) => c.json(await adminStats(db, new Date())))
      .get("/users", zValidator("query", userListQuery, validationHook), async (c) =>
        c.json(await adminUserPage(db, c.req.valid("query"))),
      )
      .get("/users/:id", zValidator("param", idParam, validationHook), async (c) => {
        const user = await adminUserDetails(
          deps,
          c.req.valid("param").id,
          c.var.user.id,
          new Date(),
        );
        if (!user) return apiError(c, 404, "User not found");
        return c.json({ data: user });
      })
      // Blocking and unblocking (#249): the user's page in return.
      .post(
        "/users/:id/:status{ban|unban}",
        zValidator("param", idParam.extend({ status: z.enum(["ban", "unban"]) }), validationHook),
        async (c) => {
          const { id, status } = c.req.valid("param");
          await setUserBanned(db, id, status === "ban", c.var.user.id);
          return c.json({ data: await adminUserDetails(deps, id, c.var.user.id, new Date()) });
        },
      )
      .post(
        "/users/:id/password-reset",
        zValidator("param", idParam, validationHook),
        async (c) => {
          await sendPasswordReset(deps, c.req.valid("param").id);
          return c.body(null, 204);
        },
      )
      .delete("/users/:id", zValidator("param", idParam, validationHook), async (c) => {
        const { id } = c.req.valid("param");
        await deleteUser({ ...deps, log: c.var.log }, id, c.var.user.id);
        return c.json({ data: { id } });
      })
      .get("/bands", zValidator("query", bandListQuery, validationHook), async (c) =>
        c.json(await adminBandPage(db, c.req.valid("query"))),
      )
      .get("/bands/:id", zValidator("param", idParam, validationHook), async (c) => {
        const band = await adminBandDetails(db, c.req.valid("param").id, journalSources);
        if (!band) return apiError(c, 404, "Band not found");
        return c.json({ data: band });
      })
      // Suspending a band and making it active again (#248): the band's page in return.
      .post(
        "/bands/:id/:status{disable|enable}",
        zValidator("param", statusParam, validationHook),
        async (c) => {
          const { id, status } = c.req.valid("param");
          await setBandDisabled(db, id, status === "disable", c.var.user.id);
          return c.json({ data: await adminBandDetails(db, id, journalSources) });
        },
      )
      .delete(
        "/bands/:id",
        zValidator("param", idParam, validationHook),
        zValidator("json", deleteBandBody, validationHook),
        async (c) => {
          const { id } = c.req.valid("param");
          await deleteBand(
            { ...deps, log: c.var.log },
            id,
            c.req.valid("json").name,
            c.var.user.id,
          );
          return c.json({ data: { id } });
        },
      )
  );
}
