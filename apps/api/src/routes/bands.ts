import { avatarUrl, FIELD_MAX_LENGTH, LANGUAGES, type Language } from "@coverband/shared";
import { zValidator } from "@hono/zod-validator";
import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { bandJournal } from "../activity";
import type { AppDeps } from "../app";
import { ownAvatarKey } from "../avatars";
import { updateBandGenre } from "../bands";
import { bandMembers, bands, users } from "../db/schema";
import { apiError } from "../errors";
import { instrumentsByBand, instrumentsOf, MAX_INSTRUMENTS, setInstruments } from "../instruments";
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
import { INVITATION_EMAILS, rateLimitUser } from "../middleware/rate-limit";
import { requireUser } from "../middleware/session";
import { validationHook } from "../validation";

const inviteBody = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  language: z.enum(Object.keys(LANGUAGES) as [Language, ...Language[]]),
});

const idParam = z.object({ bandSlug: z.string(), id: z.uuid() });

// A member's own instruments in a band: known codes or free text (checked and tidied on save).
const instrumentsBody = z.object({
  instruments: z
    .array(
      z.union([
        z.object({ code: z.string().max(50) }),
        z.object({ label: z.string().max(FIELD_MAX_LENGTH.instrument) }),
      ]),
    )
    .max(MAX_INSTRUMENTS),
});

// Only the genre can change: a band name is forever (it is also the band's URL).
const bandBody = z.object({
  genre: z.string().trim().max(FIELD_MAX_LENGTH.genre).nullable(),
});

/**
 * The logged-in user's bands (/api/bands). Everything under /:bandSlug requires membership
 * (404 otherwise); inviting musicians and changing the genre require the band leader role.
 */
export function bandRoutes(deps: AppDeps) {
  const { db } = deps;
  const member = requireMember(db);
  const limit = rateLimitUser(db, INVITATION_EMAILS);
  const musiciansOf = (band: { id: string; name: string }): InvitationScope => ({
    role: "musician",
    band,
  });

  return (
    new Hono<BandEnv>()
      .use(requireUser)
      .get("/", async (c) => {
        const rows = await db
          .select({
            name: bands.name,
            slug: bands.slug,
            genre: bands.genre,
            role: bandMembers.role,
            bandId: bands.id,
          })
          .from(bandMembers)
          .innerJoin(bands, eq(bands.id, bandMembers.bandId))
          .where(eq(bandMembers.userId, c.var.user?.id ?? ""))
          .orderBy(asc(bands.name));
        const instruments = await instrumentsByBand(db, c.var.user?.id ?? "");
        return c.json({
          bands: rows.map(({ bandId, ...band }) => ({
            ...band,
            instruments: instruments.get(bandId) ?? [],
          })),
        });
      })
      .get("/:bandSlug", member, async (c) => {
        const { id, name, slug, genre } = c.var.band;
        const userId = c.var.user?.id ?? "";
        const instruments = (await instrumentsOf(db, id, [userId])).get(userId) ?? [];
        return c.json({
          band: { name, slug, genre },
          membership: { ...c.var.membership, instruments },
        });
      })
      .patch(
        "/:bandSlug",
        member,
        requireLeader,
        zValidator("json", bandBody, validationHook),
        async (c) => {
          const { genre } = c.req.valid("json");
          return c.json({
            band: await updateBandGenre(db, c.var.band.id, genre, c.var.user?.id ?? ""),
          });
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
            joinedAt: bandMembers.joinedAt,
            image: users.image,
          })
          .from(bandMembers)
          .innerJoin(users, eq(users.id, bandMembers.userId))
          .where(eq(bandMembers.bandId, c.var.band.id))
          .orderBy(asc(bandMembers.joinedAt));
        // The storage key stays on the server: members get the avatar's URL (null: default avatar).
        const instruments = await instrumentsOf(
          db,
          c.var.band.id,
          rows.map((row) => row.userId),
        );
        const members = rows.map(({ image, ...member }) => ({
          ...member,
          instruments: instruments.get(member.userId) ?? [],
          avatarUrl: avatarUrl(member.userId, ownAvatarKey(member.userId, image)),
        }));
        return c.json({ members });
      })
      // The band's journal: its latest activity, for every member.
      .get("/:bandSlug/activity", member, async (c) => {
        return c.json({ entries: await bandJournal(db, c.var.band.id) });
      })
      // Members change their own instruments only.
      .put(
        "/:bandSlug/members/me/instruments",
        member,
        zValidator("json", instrumentsBody, validationHook),
        async (c) => {
          const instruments = await setInstruments(
            db,
            { bandId: c.var.band.id, userId: c.var.user?.id ?? "" },
            c.req.valid("json").instruments,
          );
          return c.json({ instruments });
        },
      )
      .get("/:bandSlug/invitations", member, requireLeader, async (c) => {
        return c.json({ invitations: await listInvitations(deps, musiciansOf(c.var.band)) });
      })
      .post(
        "/:bandSlug/invitations",
        member,
        requireLeader,
        limit,
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
        limit,
        zValidator("param", idParam, validationHook),
        async (c) => {
          const invitation = await resendInvitation(
            deps,
            musiciansOf(c.var.band),
            c.req.valid("param").id,
            c.var.user?.id ?? "",
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
            c.var.user?.id ?? "",
          );
          return revoked ? c.body(null, 204) : apiError(c, 404, "Invitation not found");
        },
      )
  );
}
