import { FIELD_MAX_LENGTH, LANGUAGES, type Language } from "@coverband/shared";
import { zValidator } from "@hono/zod-validator";
import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../app";
import { BandNameTakenError, updateBand } from "../bands";
import { bandMembers, bands, users } from "../db/schema";
import { apiError } from "../errors";
import {
  AlreadyInvitedError,
  AlreadyMemberError,
  type InvitationScope,
  invite,
  listInvitations,
  resendInvitation,
  revokeInvitation,
} from "../invitations";
import { type BandEnv, requireLeader, requireMember } from "../middleware/band";
import { requireUser } from "../middleware/session";
import { validationHook } from "../validation";

const inviteBody = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  language: z.enum(Object.keys(LANGUAGES) as [Language, ...Language[]]),
});

const idParam = z.object({ bandSlug: z.string(), id: z.uuid() });

const bandBody = z
  .object({
    name: z.string().trim().min(1).max(FIELD_MAX_LENGTH.bandName).optional(),
    genre: z.string().trim().max(FIELD_MAX_LENGTH.genre).nullable().optional(),
  })
  .refine((body) => body.name !== undefined || body.genre !== undefined, "Nothing to change");

/**
 * The logged-in user's bands (/api/bands). Everything under /:bandSlug requires membership
 * (404 otherwise); inviting musicians and editing the band require the band leader role.
 */
export function bandRoutes(deps: AppDeps) {
  const { db } = deps;
  const member = requireMember(db);
  const musiciansOf = (band: { id: string; name: string }): InvitationScope => ({
    role: "musician",
    band,
  });

  return new Hono<BandEnv>()
    .use(requireUser)
    .get("/", async (c) => {
      const rows = await db
        .select({
          name: bands.name,
          slug: bands.slug,
          genre: bands.genre,
          role: bandMembers.role,
          instrument: bandMembers.instrument,
        })
        .from(bandMembers)
        .innerJoin(bands, eq(bands.id, bandMembers.bandId))
        .where(eq(bandMembers.userId, c.var.user?.id ?? ""))
        .orderBy(asc(bands.name));
      return c.json({ bands: rows });
    })
    .get("/:bandSlug", member, (c) => {
      const { name, slug, genre } = c.var.band;
      return c.json({ band: { name, slug, genre }, membership: c.var.membership });
    })
    .patch(
      "/:bandSlug",
      member,
      requireLeader,
      zValidator("json", bandBody, validationHook),
      async (c) => {
        try {
          return c.json({ band: await updateBand(db, c.var.band.id, c.req.valid("json")) });
        } catch (error) {
          if (error instanceof BandNameTakenError) {
            return apiError(c, 409, error.message, "band_name_taken");
          }
          throw error;
        }
      },
    )
    .get("/:bandSlug/members", member, async (c) => {
      const rows = await db
        .select({
          userId: users.id,
          name: users.name,
          firstName: users.firstName,
          lastName: users.lastName,
          nickname: users.nickname,
          role: bandMembers.role,
          instrument: bandMembers.instrument,
          joinedAt: bandMembers.joinedAt,
        })
        .from(bandMembers)
        .innerJoin(users, eq(users.id, bandMembers.userId))
        .where(eq(bandMembers.bandId, c.var.band.id))
        .orderBy(asc(bandMembers.joinedAt));
      return c.json({ members: rows });
    })
    .get("/:bandSlug/invitations", member, requireLeader, async (c) => {
      return c.json({ invitations: await listInvitations(deps, musiciansOf(c.var.band)) });
    })
    .post(
      "/:bandSlug/invitations",
      member,
      requireLeader,
      zValidator("json", inviteBody, validationHook),
      async (c) => {
        try {
          const invitation = await invite(deps, musiciansOf(c.var.band), {
            ...c.req.valid("json"),
            invitedById: c.var.user?.id ?? "",
          });
          return c.json({ id: invitation.id }, 201);
        } catch (error) {
          if (error instanceof AlreadyInvitedError) {
            return apiError(c, 409, error.message, "already_invited");
          }
          if (error instanceof AlreadyMemberError) {
            return apiError(c, 409, error.message, "already_member");
          }
          throw error;
        }
      },
    )
    .post(
      "/:bandSlug/invitations/:id/resend",
      member,
      requireLeader,
      zValidator("param", idParam, validationHook),
      async (c) => {
        const invitation = await resendInvitation(
          deps,
          musiciansOf(c.var.band),
          c.req.valid("param").id,
        );
        return invitation
          ? c.json({ id: invitation.id })
          : apiError(c, 404, "Invitation not found");
      },
    )
    .delete(
      "/:bandSlug/invitations/:id",
      member,
      requireLeader,
      zValidator("param", idParam, validationHook),
      async (c) => {
        const revoked = await revokeInvitation(
          deps,
          musiciansOf(c.var.band),
          c.req.valid("param").id,
        );
        return revoked ? c.body(null, 204) : apiError(c, 404, "Invitation not found");
      },
    );
}
