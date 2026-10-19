import { MAX_SONG_DURATION, SONG_MAX_LENGTH } from "@coverband/shared";
import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../app";
import { apiError } from "../errors";
import { type BandEnv, requireMember } from "../middleware/band";
import { addSong, DuplicateSongError, getSong, listSongs, updateSong } from "../songs";
import { validationHook } from "../validation";

const duration = z.number().int().min(0).max(MAX_SONG_DURATION).nullable();

const songFields = z.object({
  title: z.string().trim().min(1).max(SONG_MAX_LENGTH.title),
  artist: z.string().trim().min(1).max(SONG_MAX_LENGTH.artist),
  standardDuration: duration,
  ownDuration: duration,
});

// A song matching one of the repertoire is refused (409 song_duplicate) unless confirmed.
const confirm = { confirmDuplicate: z.boolean().optional() };
const addBody = songFields.extend(confirm);
const updateBody = songFields.partial().extend(confirm);

const songParam = z.object({ bandSlug: z.string(), songId: z.uuid() });

/** 409 naming the song it matches, for the warning ("Already in your repertoire: …"). */
const duplicate = (c: Context, { message, song }: DuplicateSongError) =>
  apiError(c, 409, message, "song_duplicate", song);

/** A band's repertoire, under /api/bands/:bandSlug/songs: every member reads, adds and edits. */
export function songRoutes(deps: AppDeps) {
  const { db } = deps;
  const member = requireMember(db);
  const who = (c: Context<BandEnv>) => ({
    bandId: c.var.band.id,
    userId: c.var.user?.id ?? "",
  });

  return new Hono<BandEnv>()
    .get("/", member, async (c) => {
      return c.json({ songs: await listSongs(db, c.var.band.id) });
    })
    .post("/", member, zValidator("json", addBody, validationHook), async (c) => {
      const { confirmDuplicate, ...fields } = c.req.valid("json");
      try {
        return c.json({ song: await addSong(db, who(c), fields, { confirmDuplicate }) }, 201);
      } catch (error) {
        if (error instanceof DuplicateSongError) return duplicate(c, error);
        throw error;
      }
    })
    .get("/:songId", member, zValidator("param", songParam, validationHook), async (c) => {
      const song = await getSong(db, c.var.band.id, c.req.valid("param").songId);
      return song ? c.json({ song }) : apiError(c, 404, "Song not found");
    })
    .patch(
      "/:songId",
      member,
      zValidator("param", songParam, validationHook),
      zValidator("json", updateBody, validationHook),
      async (c) => {
        const { confirmDuplicate, ...changes } = c.req.valid("json");
        try {
          const song = await updateSong(db, who(c), c.req.valid("param").songId, changes, {
            confirmDuplicate,
          });
          return song ? c.json({ song }) : apiError(c, 404, "Song not found");
        } catch (error) {
          if (error instanceof DuplicateSongError) return duplicate(c, error);
          throw error;
        }
      },
    );
}
