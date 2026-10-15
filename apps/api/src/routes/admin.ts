import { LANGUAGES, type Language } from "@coverband/shared";
import { zValidator } from "@hono/zod-validator";
import { asc } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../app";
import { users } from "../db/schema";
import { apiError } from "../errors";
import {
  AlreadyInvitedError,
  inviteLeader,
  listLeaderInvitations,
  resendLeaderInvitation,
  revokeLeaderInvitation,
} from "../invitations";
import { requireAdmin, type SessionEnv } from "../middleware/session";
import { validationHook } from "../validation";

const inviteBody = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  language: z.enum(Object.keys(LANGUAGES) as [Language, ...Language[]]),
});

const idParam = z.object({ id: z.uuid() });

/** Administration console API (/api/admin), application admins only. */
export function adminRoutes(deps: AppDeps) {
  return new Hono<SessionEnv>()
    .use(requireAdmin)
    .get("/users", async (c) => {
      const rows = await deps.db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(asc(users.createdAt));
      return c.json({ users: rows });
    })
    .get("/invitations", async (c) => {
      return c.json({ invitations: await listLeaderInvitations(deps) });
    })
    .post("/invitations", zValidator("json", inviteBody, validationHook), async (c) => {
      const { email, language } = c.req.valid("json");
      const invitedById = c.var.user?.id ?? "";
      try {
        const invitation = await inviteLeader(deps, { email, language, invitedById });
        return c.json({ id: invitation.id }, 201);
      } catch (error) {
        if (error instanceof AlreadyInvitedError) {
          return apiError(c, 409, error.message, "already_invited");
        }
        throw error;
      }
    })
    .post("/invitations/:id/resend", zValidator("param", idParam, validationHook), async (c) => {
      const invitation = await resendLeaderInvitation(deps, c.req.valid("param").id);
      return invitation ? c.json({ id: invitation.id }) : apiError(c, 404, "Invitation not found");
    })
    .delete("/invitations/:id", zValidator("param", idParam, validationHook), async (c) => {
      const revoked = await revokeLeaderInvitation(deps, c.req.valid("param").id);
      return revoked ? c.body(null, 204) : apiError(c, 404, "Invitation not found");
    });
}
