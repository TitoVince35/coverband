import { SONG_MAX_LENGTH } from "@coverband/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { VideoSearch } from "../../adapters/youtube";
import { apiError } from "../../core/errors";
import { type RateLimitRule, rateLimitBy, rateLimitUser } from "../../core/http/rate-limit";
import type { SessionEnv } from "../../core/http/session";
import { validationHook } from "../../core/http/validation";
import type { AppDeps } from "../../deps";
import { type BandEnv, requireMember } from "../bands/guard";
import { autofill, searchTracks } from "./service";

/** "Search and add" searches per band and day (#199): YouTube's free quota is shared by the app. */
export const AUTOFILL_SEARCHES: RateLimitRule = {
  name: "autofill-searches",
  max: 15,
  windowMs: 24 * 60 * 60 * 1000,
};

/**
 * Link searches per member and hour (#220): Deezer is free, with no quota of ours, but limits
 * every IP (the server's), so a member can't use it all.
 */
export const TRACK_SEARCHES: RateLimitRule = {
  name: "track-searches",
  max: 30,
  windowMs: 60 * 60 * 1000,
};

/** A link search's free text, as the web app's field allows. */
export const TRACK_SEARCH_MAX = 200;

const trackQuery = z.object({ q: z.string().trim().min(1).max(TRACK_SEARCH_MAX) });

const songQuery = z.object({
  title: z.string().trim().min(1).max(SONG_MAX_LENGTH.title),
  artist: z.string().trim().min(1).max(SONG_MAX_LENGTH.artist),
});

/** A new song's details looked up online, under /api/bands/:bandSlug/autofill (members). */
export function autofillRoutes(deps: AppDeps) {
  return (
    new Hono<SessionEnv>()
      .use(requireMember(deps.db))
      .get(
        "/",
        zValidator("query", songQuery, validationHook),
        rateLimitBy<BandEnv & SessionEnv>(deps.db, AUTOFILL_SEARCHES, (c) => c.var.band.id),
        async (c) => c.json(await autofill(deps, c.var.log, c.var.band, c.req.valid("query"))),
      )
      // Deezer's tracks for free text, to add one as a song's link (#220).
      .get(
        "/tracks",
        zValidator("query", trackQuery, validationHook),
        rateLimitUser(deps.db, TRACK_SEARCHES),
        async (c) => c.json({ tracks: await searchTracks(deps, c.req.valid("query").q) }),
      )
      // A proposed video's thumbnail, through the API: phones never contact Google (#200).
      .get("/thumbnails/:videoId", async (c) => {
        let image: Awaited<ReturnType<VideoSearch["thumbnail"]>> = null;
        try {
          image = (await deps.videos?.thumbnail(c.req.param("videoId"))) ?? null;
        } catch (error) {
          // The list shows a broken thumbnail as such (#208).
          c.var.log.error("YouTube thumbnail failed", { err: error });
          return apiError(c, 502, "YouTube failed");
        }
        if (!image) return apiError(c, 404, "No thumbnail");
        return c.body(image.body, 200, {
          "content-type": image.type,
          "cache-control": "private, max-age=86400",
        });
      })
  );
}
