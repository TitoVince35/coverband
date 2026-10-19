import {
  addMediaBody,
  addSongBody,
  updateMediaBody,
  updateSongBody,
} from "@coverband/shared/schemas";
import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { apiError } from "../../core/errors";
import { type RateLimitRule, rateLimitUser } from "../../core/http/rate-limit";
import type { SessionEnv } from "../../core/http/session";
import { validationHook } from "../../core/http/validation";
import type { AppDeps } from "../../deps";
import { type BandEnv, requireLeader, requireMember } from "../bands/guard";
import { searchLyrics } from "./lyrics.service";
import { addMedia, deleteMedia, mediaOf, updateMedia } from "./media.service";
import { addSong, deleteSong, getSong, listSongs, setArchived, updateSong } from "./service";

const songParam = z.object({ bandSlug: z.string(), songId: z.uuid() });

const listQuery = z.object({ archived: z.enum(["true", "false"]).optional() });

const mediaParam = songParam.extend({ mediaId: z.uuid() });

/** Lyrics searches call LRCLIB: per user, a fair use of a free service. */
export const LYRICS_SEARCHES: RateLimitRule = {
  name: "lyrics-searches",
  max: 30,
  windowMs: 60 * 60 * 1000,
};

/** A band's repertoire, under /api/bands/:bandSlug/songs: every member reads, adds and edits. */
export function songRoutes(deps: AppDeps) {
  const { db } = deps;
  const lyricsLimit = rateLimitUser(db, LYRICS_SEARCHES);
  const who = (c: Context<BandEnv>) => ({ bandId: c.var.band.id, userId: c.var.user.id });

  return (
    new Hono<SessionEnv>()
      .use(requireMember(db))
      // The repertoire, or its archived songs with ?archived=true.
      .get("/", zValidator("query", listQuery, validationHook), async (c) => {
        const archived = c.req.valid("query").archived === "true";
        return c.json({ songs: await listSongs(db, c.var.band.id, { archived }) });
      })
      .post("/", zValidator("json", addSongBody, validationHook), async (c) => {
        const { confirmDuplicate, ...fields } = c.req.valid("json");
        return c.json({ song: await addSong(db, who(c), fields, { confirmDuplicate }) }, 201);
      })
      .get("/:songId", zValidator("param", songParam, validationHook), async (c) => {
        const { songId } = c.req.valid("param");
        const song = await getSong(db, c.var.band.id, songId);
        if (!song) return apiError(c, 404, "Song not found");
        return c.json({ song: { ...song, media: await mediaOf(db, c.var.band.id, songId) } });
      })
      .patch(
        "/:songId",
        zValidator("param", songParam, validationHook),
        zValidator("json", updateSongBody, validationHook),
        async (c) => {
          const { confirmDuplicate, ...changes } = c.req.valid("json");
          const song = await updateSong(db, who(c), c.req.valid("param").songId, changes, {
            confirmDuplicate,
          });
          return song ? c.json({ song }) : apiError(c, 404, "Song not found");
        },
      )
      // Lyrics found online for the song (#130), to choose from: nothing is saved.
      .get(
        "/:songId/lyrics/search",
        zValidator("param", songParam, validationHook),
        lyricsLimit,
        async (c) => {
          const { songId } = c.req.valid("param");
          const matches = await searchLyrics(db, deps.lyrics, c.var.band.id, songId);
          return matches ? c.json({ matches }) : apiError(c, 404, "Song not found");
        },
      )
      // Any member archives and restores.
      .post("/:songId/archive", zValidator("param", songParam, validationHook), async (c) => {
        const song = await setArchived(db, who(c), c.req.valid("param").songId, true);
        return song ? c.json({ song }) : apiError(c, 404, "Song not found");
      })
      .post("/:songId/restore", zValidator("param", songParam, validationHook), async (c) => {
        const song = await setArchived(db, who(c), c.req.valid("param").songId, false);
        return song ? c.json({ song }) : apiError(c, 404, "Song not found");
      })
      // Deleting for good is the band leader's, and only for a song nothing uses.
      .delete(
        "/:songId",
        requireLeader,
        zValidator("param", songParam, validationHook),
        async (c) => {
          const deleted = await deleteSong(db, who(c), c.req.valid("param").songId);
          return deleted ? c.body(null, 204) : apiError(c, 404, "Song not found");
        },
      )
      // A song's links: every member adds, edits and removes them.
      .post(
        "/:songId/media",
        zValidator("param", songParam, validationHook),
        zValidator("json", addMediaBody, validationHook),
        async (c) => {
          const { url, title = null, instruments = [] } = c.req.valid("json");
          const media = await addMedia(db, who(c), c.req.valid("param").songId, {
            url,
            title,
            instruments,
          });
          return media ? c.json({ media }, 201) : apiError(c, 404, "Song not found");
        },
      )
      .patch(
        "/:songId/media/:mediaId",
        zValidator("param", mediaParam, validationHook),
        zValidator("json", updateMediaBody, validationHook),
        async (c) => {
          const { songId, mediaId } = c.req.valid("param");
          const media = await updateMedia(db, who(c), songId, mediaId, c.req.valid("json"));
          return media ? c.json({ media }) : apiError(c, 404, "Link not found");
        },
      )
      .delete(
        "/:songId/media/:mediaId",
        zValidator("param", mediaParam, validationHook),
        async (c) => {
          const { songId, mediaId } = c.req.valid("param");
          const deleted = await deleteMedia(db, who(c), songId, mediaId);
          return deleted ? c.body(null, 204) : apiError(c, 404, "Link not found");
        },
      )
  );
}
