import { pushEndpointBody, pushSubscriptionBody, teamNoteBody } from "@coverband/shared/schemas";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { isPushService } from "../../adapters/push";
import { apiError } from "../../core/errors";
import { requireAdmin, requireUser, type SessionEnv } from "../../core/http/session";
import { validationHook } from "../../core/http/validation";
import type { AppDeps } from "../../deps";
import {
  markNotificationRead,
  pushTeamNote,
  removePushSubscription,
  savePushSubscription,
  sendTeamNote,
  teamNotePage,
  unreadNotifications,
} from "./service";

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
      const { text } = c.req.valid("json");
      const note = await sendTeamNote(deps.db, text, c.var.user.id);
      // Pushed to subscribed devices too (#262): the app shows it either way.
      const devices = deps.push
        ? await pushTeamNote({ ...deps, log: c.var.log, push: deps.push }, { id: note.id, text })
        : { reached: 0, failed: 0 };
      return c.json({ data: { ...note, devices } }, 201);
    });
}

/**
 * Push notifications on the user's devices (/api/push, #261): the server's public VAPID key (null:
 * push is off), and a device's subscription saved or removed.
 */
export function pushRoutes(deps: AppDeps) {
  const { push } = deps;
  return new Hono<SessionEnv>()
    .use(requireUser)
    .get("/key", (c) => c.json({ publicKey: push?.keys.publicKey ?? null }))
    .put("/subscription", zValidator("json", pushSubscriptionBody, validationHook), async (c) => {
      if (!push) return apiError(c, 404, "Push notifications are off");
      const subscription = c.req.valid("json");
      // Only the browsers' push services: the server will send to this address.
      if (!isPushService(subscription.endpoint, push.serviceHosts)) {
        return apiError(c, 400, "Unknown push service");
      }
      await savePushSubscription(deps.db, c.var.user.id, subscription);
      return c.body(null, 204);
    })
    .delete("/subscription", zValidator("json", pushEndpointBody, validationHook), async (c) => {
      await removePushSubscription(deps.db, c.var.user.id, c.req.valid("json").endpoint);
      return c.body(null, 204);
    });
}
