import { DEFAULT_TIME_ZONE, GIG_FILTERS, isTimeZone } from "@coverband/shared";
import { gigBody, gigUpdateBody } from "@coverband/shared/schemas";
import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { apiError } from "../../core/errors";
import type { SessionEnv } from "../../core/http/session";
import { validationHook } from "../../core/http/validation";
import type { AppDeps } from "../../deps";
import { type BandEnv, requireMember } from "../bands/guard";
import { createGig, getGig, listGigs, updateGig } from "./service";

const gigParam = z.object({ bandSlug: z.string(), gigId: z.uuid() });

/** Which gigs, by "A gig's day" in the member's time zone (the app sends the device's). */
const listQuery = z.object({
  when: z.enum(GIG_FILTERS).default("next"),
  tz: z.string().max(64).optional(),
});

/** The time zone a request names, when the runtime knows it. */
export const timeZoneOf = (tz: string | undefined) =>
  tz && isTimeZone(tz) ? tz : DEFAULT_TIME_ZONE;

/**
 * A band's gigs (brief 034), under /api/bands/:bandSlug/gigs: every member lists, creates and
 * edits them, with their venue.
 */
export function gigRoutes({ db }: AppDeps) {
  const who = (c: Context<BandEnv>) => ({ bandId: c.var.band.id, userId: c.var.user.id });

  return new Hono<SessionEnv>()
    .use(requireMember(db))
    .get("/", zValidator("query", listQuery, validationHook), async (c) => {
      const { when, tz } = c.req.valid("query");
      const gigs = await listGigs(db, c.var.band.id, when, {
        now: new Date(),
        timeZone: timeZoneOf(tz),
      });
      return c.json({ gigs });
    })
    .post("/", zValidator("json", gigBody, validationHook), async (c) => {
      const gig = await createGig(db, who(c), c.req.valid("json"));
      return gig ? c.json({ gig }, 201) : apiError(c, 500, "Gig not created");
    })
    .get("/:gigId", zValidator("param", gigParam, validationHook), async (c) => {
      const gig = await getGig(db, c.var.band.id, c.req.valid("param").gigId);
      return gig ? c.json({ gig }) : apiError(c, 404, "Gig not found");
    })
    .patch(
      "/:gigId",
      zValidator("param", gigParam, validationHook),
      zValidator("json", gigUpdateBody, validationHook),
      async (c) => {
        const gig = await updateGig(db, who(c), c.req.valid("param").gigId, c.req.valid("json"));
        return gig ? c.json({ gig }) : apiError(c, 404, "Gig not found");
      },
    );
}
