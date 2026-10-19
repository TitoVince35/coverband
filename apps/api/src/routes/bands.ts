import { FIELD_MAX_LENGTH, LANGUAGES, type Language } from "@coverband/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { bandJournal } from "../activity";
import { bandsOf, updateBandGenre } from "../bands";
import type { AppDeps } from "../deps";
import { apiError } from "../errors";
import { instrumentsOf, MAX_INSTRUMENTS, setInstruments } from "../instruments";
import {
  type InvitationScope,
  invite,
  listInvitations,
  resendInvitation,
  revokeInvitation,
} from "../invitations";
import { lineupOf } from "../members";
import { requireLeader, requireMember } from "../middleware/band";
import { INVITATION_EMAILS, rateLimitUser } from "../middleware/rate-limit";
import { requireUser, type SessionEnv } from "../middleware/session";
import { validationHook } from "../validation";
import { songRoutes } from "./songs";

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
  return new Hono<SessionEnv>()
    .use(requireUser)
    .get("/", async (c) => c.json({ bands: await bandsOf(db, c.var.user.id) }))
    .route("/:bandSlug", oneBandRoutes(deps));
}

/** One band (/api/bands/:bandSlug), for its members only: the guard runs once for every route. */
function oneBandRoutes(deps: AppDeps) {
  const { db } = deps;
  const limit = rateLimitUser(db, INVITATION_EMAILS);
  const musiciansOf = (band: { id: string; name: string }): InvitationScope => ({
    role: "musician",
    band,
  });

  return (
    new Hono<SessionEnv>()
      .use(requireMember(db))
      .get("/", async (c) => {
        const { id, name, slug, genre } = c.var.band;
        const userId = c.var.user.id;
        const instruments = (await instrumentsOf(db, id, [userId])).get(userId) ?? [];
        return c.json({
          band: { name, slug, genre },
          membership: { ...c.var.membership, instruments },
        });
      })
      .patch("/", requireLeader, zValidator("json", bandBody, validationHook), async (c) => {
        const { genre } = c.req.valid("json");
        return c.json({
          band: await updateBandGenre(db, c.var.band.id, genre, c.var.user.id),
        });
      })
      .get("/members", async (c) => c.json({ members: await lineupOf(db, c.var.band.id) }))
      // The band's journal: its latest activity, for every member.
      .get("/activity", async (c) => {
        return c.json({ entries: await bandJournal(db, c.var.band.id) });
      })
      .route("/songs", songRoutes(deps))
      // Members change their own instruments only.
      .put(
        "/members/me/instruments",
        zValidator("json", instrumentsBody, validationHook),
        async (c) => {
          const instruments = await setInstruments(
            db,
            { bandId: c.var.band.id, userId: c.var.user.id },
            c.req.valid("json").instruments,
          );
          return c.json({ instruments });
        },
      )
      .get("/invitations", requireLeader, async (c) => {
        return c.json({ invitations: await listInvitations(deps, musiciansOf(c.var.band)) });
      })
      .post(
        "/invitations",
        requireLeader,
        limit,
        zValidator("json", inviteBody, validationHook),
        async (c) => {
          const invitation = await invite(deps, musiciansOf(c.var.band), {
            ...c.req.valid("json"),
            invitedById: c.var.user.id,
          });
          return c.json({ id: invitation.id }, 201);
        },
      )
      .post(
        "/invitations/:id/resend",
        requireLeader,
        limit,
        zValidator("param", idParam, validationHook),
        async (c) => {
          const invitation = await resendInvitation(
            deps,
            musiciansOf(c.var.band),
            c.req.valid("param").id,
            c.var.user.id,
          );
          return invitation
            ? c.json({ id: invitation.id })
            : apiError(c, 404, "Invitation not found");
        },
      )
      .delete(
        "/invitations/:id",
        requireLeader,
        zValidator("param", idParam, validationHook),
        async (c) => {
          const revoked = await revokeInvitation(
            deps,
            musiciansOf(c.var.band),
            c.req.valid("param").id,
            c.var.user.id,
          );
          return revoked ? c.body(null, 204) : apiError(c, 404, "Invitation not found");
        },
      )
  );
}
