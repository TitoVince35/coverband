import { LANGUAGES, type Language } from "@coverband/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { usersWithBands } from "../admin";
import type { AppDeps } from "../deps";
import { apiError } from "../errors";
import {
  inviteLeader,
  listLeaderInvitations,
  resendLeaderInvitation,
  revokeLeaderInvitation,
} from "../invitations";
import { INVITATION_EMAILS, rateLimitUser } from "../middleware/rate-limit";
import { requireAdmin, type SessionEnv } from "../middleware/session";
import { validationHook } from "../validation";

const inviteBody = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  language: z.enum(Object.keys(LANGUAGES) as [Language, ...Language[]]),
});

const idParam = z.object({ id: z.uuid() });

/** Administration console API (/api/admin), application admins only. */
export function adminRoutes(deps: AppDeps) {
  const limit = rateLimitUser(deps.db, INVITATION_EMAILS);
  return new Hono<SessionEnv>()
    .use(requireAdmin)
    .get("/users", async (c) => c.json({ users: await usersWithBands(deps.db) }))
    .get("/invitations", async (c) => {
      return c.json({ invitations: await listLeaderInvitations(deps) });
    })
    .post("/invitations", limit, zValidator("json", inviteBody, validationHook), async (c) => {
      const { email, language } = c.req.valid("json");
      const invitedById = c.var.user.id;
      const invitation = await inviteLeader(deps, { email, language, invitedById });
      return c.json({ id: invitation.id }, 201);
    })
    .post(
      "/invitations/:id/resend",
      limit,
      zValidator("param", idParam, validationHook),
      async (c) => {
        const invitation = await resendLeaderInvitation(
          deps,
          c.req.valid("param").id,
          c.var.user.id,
        );
        return invitation
          ? c.json({ id: invitation.id })
          : apiError(c, 404, "Invitation not found");
      },
    )
    .delete("/invitations/:id", zValidator("param", idParam, validationHook), async (c) => {
      const revoked = await revokeLeaderInvitation(deps, c.req.valid("param").id, c.var.user.id);
      return revoked ? c.body(null, 204) : apiError(c, 404, "Invitation not found");
    });
}
