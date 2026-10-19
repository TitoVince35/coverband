import { LANGUAGES, type Language } from "@coverband/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { apiError } from "../../core/errors";
import { type RateLimitRule, rateLimitUser } from "../../core/http/rate-limit";
import { requireAdmin, type SessionEnv } from "../../core/http/session";
import { validationHook } from "../../core/http/validation";
import type { AppDeps } from "../../deps";
import { requireLeader, requireMember } from "../bands/guard";
import {
  type InvitationScope,
  invite,
  LEADER_INVITATIONS,
  listInvitations,
  resendInvitation,
  revokeInvitation,
} from "./service";

/** Invitation send and resend (they send emails): per user, admin and band leader routes together. */
export const INVITATION_EMAILS: RateLimitRule = {
  name: "invitation-emails",
  max: 20,
  windowMs: 60 * 60 * 1000,
};

const inviteBody = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  language: z.enum(Object.keys(LANGUAGES) as [Language, ...Language[]]),
});

const idParam = z.object({ id: z.uuid() });

/** Band leader invitations (/api/admin/invitations), sent by application admins. */
export function leaderInvitationRoutes(deps: AppDeps) {
  const limit = rateLimitUser(deps.db, INVITATION_EMAILS);
  return new Hono<SessionEnv>()
    .use(requireAdmin)
    .get("/", async (c) => {
      return c.json({ invitations: await listInvitations(deps, LEADER_INVITATIONS) });
    })
    .post("/", limit, zValidator("json", inviteBody, validationHook), async (c) => {
      const invitation = await invite(deps, LEADER_INVITATIONS, {
        ...c.req.valid("json"),
        invitedById: c.var.user.id,
      });
      return c.json({ id: invitation.id }, 201);
    })
    .post("/:id/resend", limit, zValidator("param", idParam, validationHook), async (c) => {
      const { id } = c.req.valid("param");
      const invitation = await resendInvitation(deps, LEADER_INVITATIONS, id, c.var.user.id);
      return invitation ? c.json({ id: invitation.id }) : apiError(c, 404, "Invitation not found");
    })
    .delete("/:id", zValidator("param", idParam, validationHook), async (c) => {
      const { id } = c.req.valid("param");
      const revoked = await revokeInvitation(deps, LEADER_INVITATIONS, id, c.var.user.id);
      return revoked ? c.body(null, 204) : apiError(c, 404, "Invitation not found");
    });
}

/** A band's musician invitations (/api/bands/:bandSlug/invitations), sent by its band leader. */
export function bandInvitationRoutes(deps: AppDeps) {
  const limit = rateLimitUser(deps.db, INVITATION_EMAILS);
  const musiciansOf = (band: { id: string; name: string }): InvitationScope => ({
    role: "musician",
    band,
  });
  return new Hono<SessionEnv>()
    .use(requireMember(deps.db))
    .use(requireLeader)
    .get("/", async (c) => {
      return c.json({ invitations: await listInvitations(deps, musiciansOf(c.var.band)) });
    })
    .post("/", limit, zValidator("json", inviteBody, validationHook), async (c) => {
      const invitation = await invite(deps, musiciansOf(c.var.band), {
        ...c.req.valid("json"),
        invitedById: c.var.user.id,
      });
      return c.json({ id: invitation.id }, 201);
    })
    .post("/:id/resend", limit, zValidator("param", idParam, validationHook), async (c) => {
      const { id } = c.req.valid("param");
      const invitation = await resendInvitation(deps, musiciansOf(c.var.band), id, c.var.user.id);
      return invitation ? c.json({ id: invitation.id }) : apiError(c, 404, "Invitation not found");
    })
    .delete("/:id", zValidator("param", idParam, validationHook), async (c) => {
      const { id } = c.req.valid("param");
      const revoked = await revokeInvitation(deps, musiciansOf(c.var.band), id, c.var.user.id);
      return revoked ? c.body(null, 204) : apiError(c, 404, "Invitation not found");
    });
}
