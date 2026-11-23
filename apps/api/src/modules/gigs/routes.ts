import { DEFAULT_TIME_ZONE, GIG_FILTERS, GIG_POSTER_LIMITS, isTimeZone } from "@coverband/shared";
import { addPosterBody, gigBody, gigCancelBody, gigUpdateBody } from "@coverband/shared/schemas";
import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { apiError } from "../../core/errors";
import { fileName } from "../../core/http/file-name";
import type { SessionEnv } from "../../core/http/session";
import { validationHook } from "../../core/http/validation";
import type { AppDeps } from "../../deps";
import { type BandEnv, requireMember } from "../bands/guard";
import { addPoster, readPoster, removePoster } from "./posters.service";
import { pushGigChange } from "./push";
import {
  cancelGig,
  createGig,
  deleteGig,
  getGig,
  listGigs,
  lockEditableGig,
  postponeGig,
  settleGig,
  updateGig,
} from "./service";

const gigParam = z.object({ bandSlug: z.string(), gigId: z.uuid() });
const posterParam = gigParam.extend({ posterId: z.uuid() });

/** Largest poster upload request: the image plus its title and the multipart framing. */
export const POSTER_UPLOAD_MAX_SIZE = GIG_POSTER_LIMITS.maxBytes + 64 * 1024;

/** Which gigs, by "A gig's day" in the member's time zone (the app sends the device's). */
const listQuery = z.object({
  when: z.enum(GIG_FILTERS).default("next"),
  tz: z.string().max(64).optional(),
});

/** The member's time zone, for the read-only check of past gigs ("A gig's day"). */
const tzQuery = z.object({ tz: z.string().max(64).optional() });

/** The time zone a request names, when the runtime knows it. */
export const timeZoneOf = (tz: string | undefined) =>
  tz && isTimeZone(tz) ? tz : DEFAULT_TIME_ZONE;

/**
 * A band's gigs (brief 034), under /api/bands/:bandSlug/gigs: every member lists, creates and
 * edits them, with their venue.
 */
export function gigRoutes(deps: AppDeps) {
  const { db } = deps;
  const who = (c: Context<BandEnv>) => ({ bandId: c.var.band.id, userId: c.var.user.id });
  const manager = (c: Context<BandEnv>) => ({
    ...who(c),
    isLeader: c.var.membership.role === "leader",
  });
  const when = (tz: string | undefined) => ({ now: new Date(), timeZone: timeZoneOf(tz) });

  return (
    new Hono<SessionEnv>()
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
        zValidator("query", tzQuery, validationHook),
        zValidator("json", gigUpdateBody, validationHook),
        async (c) => {
          const gig = await updateGig(
            db,
            who(c),
            c.req.valid("param").gigId,
            c.req.valid("json"),
            when(c.req.valid("query").tz),
          );
          return gig ? c.json({ gig }) : apiError(c, 404, "Gig not found");
        },
      )
      // Its creator or a band leader settles it (#327); the band's members get a push.
      .post(
        "/:gigId/settle",
        zValidator("param", gigParam, validationHook),
        zValidator("query", tzQuery, validationHook),
        async (c) => {
          const settled = await settleGig(
            db,
            manager(c),
            c.req.valid("param").gigId,
            when(c.req.valid("query").tz),
          );
          if (!settled?.gig) return apiError(c, 404, "Gig not found");
          if (settled.changed) {
            await pushGigChange(
              { ...deps, log: c.var.log },
              c.var.band,
              settled.gig,
              "settled",
              c.var.user.id,
            );
          }
          return c.json({ gig: settled.gig });
        },
      )
      // Back to proposed, to change its date, title or venue.
      .post(
        "/:gigId/postpone",
        zValidator("param", gigParam, validationHook),
        zValidator("query", tzQuery, validationHook),
        async (c) => {
          const gig = await postponeGig(
            db,
            manager(c),
            c.req.valid("param").gigId,
            when(c.req.valid("query").tz),
          );
          return gig ? c.json({ gig }) : apiError(c, 404, "Gig not found");
        },
      )
      // Cancelled with its reason, then read-only; the band's members get a push.
      .post(
        "/:gigId/cancel",
        zValidator("param", gigParam, validationHook),
        zValidator("query", tzQuery, validationHook),
        zValidator("json", gigCancelBody, validationHook),
        async (c) => {
          const gig = await cancelGig(
            db,
            manager(c),
            c.req.valid("param").gigId,
            c.req.valid("json").reason,
            when(c.req.valid("query").tz),
          );
          if (!gig) return apiError(c, 404, "Gig not found");
          await pushGigChange(
            { ...deps, log: c.var.log },
            c.var.band,
            gig,
            "cancelled",
            c.var.user.id,
          );
          return c.json({ gig });
        },
      )
      // For good: a proposed or cancelled gig, or a past one; its venue stays.
      .delete(
        "/:gigId",
        zValidator("param", gigParam, validationHook),
        zValidator("query", tzQuery, validationHook),
        async (c) => {
          const deleted = await deleteGig(
            { db, storage: deps.storage, log: c.var.log },
            manager(c),
            c.req.valid("param").gigId,
            when(c.req.valid("query").tz),
          );
          return deleted ? c.body(null, 204) : apiError(c, 404, "Gig not found");
        },
      )
      // A poster (#330), a multipart form: the image (shrunk by the browser), its title. On a
      // gig that can still change.
      .post(
        "/:gigId/posters",
        zValidator("param", gigParam, validationHook),
        zValidator("query", tzQuery, validationHook),
        zValidator("form", addPosterBody, validationHook),
        async (c) => {
          const { gigId } = c.req.valid("param");
          const { file, title } = c.req.valid("form");
          const at = when(c.req.valid("query").tz);
          const poster = await addPoster(
            { db, storage: deps.storage, log: c.var.log },
            who(c),
            gigId,
            { bytes: new Uint8Array(await file.arrayBuffer()), title },
            (tx) => lockEditableGig(tx, c.var.band.id, gigId, at),
          );
          return poster ? c.json({ poster }, 201) : apiError(c, 404, "Gig not found");
        },
      )
      // Who added it, or the band leader.
      .delete(
        "/:gigId/posters/:posterId",
        zValidator("param", posterParam, validationHook),
        zValidator("query", tzQuery, validationHook),
        async (c) => {
          const { gigId, posterId } = c.req.valid("param");
          const at = when(c.req.valid("query").tz);
          const removed = await removePoster(
            { db, storage: deps.storage, log: c.var.log },
            manager(c),
            gigId,
            posterId,
            (tx) => lockEditableGig(tx, c.var.band.id, gigId, at),
          );
          return removed ? c.body(null, 204) : apiError(c, 404, "Poster not found");
        },
      )
      // Its file, for the band's members only. Never replaced: cached for good.
      .get(
        "/:gigId/posters/:posterId/file",
        zValidator("param", posterParam, validationHook),
        async (c) => {
          const { gigId, posterId } = c.req.valid("param");
          const poster = await readPoster(deps, c.var.band.id, gigId, posterId);
          if (!poster) return apiError(c, 404, "Poster not found");
          return c.body(poster.body, 200, {
            "content-type": poster.type,
            "content-length": String(poster.size),
            "content-disposition": `inline; ${fileName(poster.title, poster.extension)}`,
            "cache-control": "private, max-age=31536000, immutable",
          });
        },
      )
  );
}
