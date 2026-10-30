import { teamNoteBody } from "@coverband/shared/schemas";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { apiError } from "../../core/errors";
import { requireAdmin, requireUser, type SessionEnv } from "../../core/http/session";
import { validationHook } from "../../core/http/validation";
import type { AppDeps } from "../../deps";
import { markNotificationRead, sendTeamNote, teamNotePage, unreadNotifications } from "./service";

const idParam = z.object({ id: z.uuid() });
const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
});

/** A user's notifications (/api/notifications, #260): the unread ones, and reading one. */
export function notificationRoutes(deps: AppDeps) {
  return new Hono<SessionEnv>()
    .use(requireUser)
    .get("/", async (c) =>
      c.json({ notifications: await unreadNotifications(deps.db, c.var.user.id) }),
    )
    .post("/:id/read", zValidator("param", idParam, validationHook), async (c) => {
      const read = await markNotificationRead(deps.db, c.var.user.id, c.req.valid("param").id);
      return read ? c.body(null, 204) : apiError(c, 404, "Notification not found");
    });
}

/**
 * Notes from the app's team (/api/admin/notifications, #260), sent by application admins to
 * every user. In react-admin's shape: a list is `{ data, total }`, a created one `{ data }`.
 */
export function adminNotificationRoutes(deps: AppDeps) {
  return new Hono<SessionEnv>()
    .use(requireAdmin)
    .get("/", zValidator("query", pageQuery, validationHook), async (c) =>
      c.json(await teamNotePage(deps.db, c.req.valid("query"))),
    )
    .post("/", zValidator("json", teamNoteBody, validationHook), async (c) => {
      const note = await sendTeamNote(deps.db, c.req.valid("json").text, c.var.user.id);
      return c.json({ data: note }, 201);
    });
}
