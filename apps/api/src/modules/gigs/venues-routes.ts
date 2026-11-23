import { venueBody } from "@coverband/shared/schemas";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { apiError } from "../../core/errors";
import type { SessionEnv } from "../../core/http/session";
import { validationHook } from "../../core/http/validation";
import type { AppDeps } from "../../deps";
import { requireMember } from "../bands/guard";
import { getVenue, listVenues, locateVenue, updateVenue } from "./venues.service";

const venueParam = z.object({ bandSlug: z.string(), venueId: z.uuid() });
const listQuery = z.object({ q: z.string().max(100).optional() });

/**
 * A band's venues (brief 034), under /api/bands/:bandSlug/venues: every member searches them
 * (the gig form's venue box) and changes their details, which every gig there shows.
 */
export function venueRoutes(deps: AppDeps) {
  const { db } = deps;
  return new Hono<SessionEnv>()
    .use(requireMember(db))
    .get("/", zValidator("query", listQuery, validationHook), async (c) => {
      const venues = await listVenues(db, c.var.band.id, c.req.valid("query").q);
      return c.json({ venues });
    })
    .get("/:venueId", zValidator("param", venueParam, validationHook), async (c) => {
      const venue = await getVenue(db, c.var.band.id, c.req.valid("param").venueId);
      return venue ? c.json({ venue }) : apiError(c, 404, "Venue not found");
    })
    .patch(
      "/:venueId",
      zValidator("param", venueParam, validationHook),
      zValidator("json", venueBody, validationHook),
      async (c) => {
        const venue = await updateVenue(
          db,
          { bandId: c.var.band.id, userId: c.var.user.id },
          c.req.valid("param").venueId,
          c.req.valid("json"),
        );
        if (!venue) return apiError(c, 404, "Venue not found");
        // Placed on the map (#333) once saved, when its address changed.
        const moved = await locateVenue({ ...deps, log: c.var.log }, c.var.band.id, venue.id);
        const saved = moved ? await getVenue(db, c.var.band.id, venue.id) : venue;
        return c.json({ venue: saved ?? venue });
      },
    );
}
