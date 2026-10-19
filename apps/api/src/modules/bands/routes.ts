import { FIELD_MAX_LENGTH } from "@coverband/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { requireUser, type SessionEnv } from "../../core/http/session";
import { validationHook } from "../../core/http/validation";
import type { AppDeps } from "../../deps";
import { instrumentsOf } from "../instruments/service";
import { requireLeader, requireMember } from "./guard";
import { bandsOf, updateBandGenre } from "./service";

// Only the genre can change: a band name is forever (it is also the band's URL).
const bandBody = z.object({
  genre: z.string().trim().max(FIELD_MAX_LENGTH.genre).nullable(),
});

/**
 * The logged-in user's bands (/api/bands), and each band itself for its members (404 otherwise).
 * Changing the genre is the band leader's. A band's features (members, songs...) are their own
 * sub-apps under /api/bands/:bandSlug, each guarded by requireMember.
 */
export function bandRoutes(deps: AppDeps) {
  const { db } = deps;
  const member = requireMember(db);
  return new Hono<SessionEnv>()
    .use(requireUser)
    .get("/", async (c) => c.json({ bands: await bandsOf(db, c.var.user.id) }))
    .get("/:bandSlug", member, async (c) => {
      const { id, name, slug, genre } = c.var.band;
      const userId = c.var.user.id;
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
          band: await updateBandGenre(db, c.var.band.id, genre, c.var.user.id),
        });
      },
    );
}
