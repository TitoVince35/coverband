import {
  FIELD_MAX_LENGTH,
  MAX_ENERGY,
  MAX_SONG_DURATION,
  MEDIA_LIMITS,
  MUSICAL_KEYS,
  parseMediaUrl,
  SONG_MAX_LENGTH,
  SONG_STATUSES,
  SONG_TEMPO,
} from "@coverband/shared";
import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../deps";
import { apiError } from "../errors";
import { MAX_INSTRUMENTS } from "../instruments";
import { type BandEnv, requireLeader, requireMember } from "../middleware/band";
import { addMedia, deleteMedia, mediaOf, updateMedia } from "../song-media";
import { addSong, deleteSong, getSong, listSongs, setArchived, updateSong } from "../songs";
import { validationHook } from "../validation";

const duration = z.number().int().min(0).max(MAX_SONG_DURATION).nullable();

const key = z.enum(MUSICAL_KEYS).nullable();
// Optional text: blank is null.
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((text) => text || null);

const songFields = z.object({
  title: z.string().trim().min(1).max(SONG_MAX_LENGTH.title),
  artist: z.string().trim().min(1).max(SONG_MAX_LENGTH.artist),
  standardDuration: duration,
  ownDuration: duration,
  key,
  bandKey: key,
  tempo: z.number().int().min(SONG_TEMPO.min).max(SONG_TEMPO.max).nullable(),
  style: optionalText(SONG_MAX_LENGTH.style),
  notes: optionalText(SONG_MAX_LENGTH.notes),
  status: z.enum(SONG_STATUSES),
  energy: z.number().int().min(1).max(MAX_ENERGY).nullable(),
});

// A song matching one of the repertoire is refused (409 song_duplicate) unless confirmed.
const confirm = { confirmDuplicate: z.boolean().optional() };
// The details are optional when adding.
const addBody = songFields
  .partial({
    key: true,
    bandKey: true,
    tempo: true,
    style: true,
    notes: true,
    status: true,
    energy: true,
  })
  .extend(confirm);
const updateBody = songFields.partial().extend(confirm);

const songParam = z.object({ bandSlug: z.string(), songId: z.uuid() });

const listQuery = z.object({ archived: z.enum(["true", "false"]).optional() });

// A song's link: an http(s) URL, an optional title, instruments (checked and tidied on save).
const mediaFields = z.object({
  url: z
    .string()
    .trim()
    .max(MEDIA_LIMITS.url)
    .refine((url) => parseMediaUrl(url) !== null, "Not an http(s) URL"),
  title: optionalText(MEDIA_LIMITS.title),
  instruments: z
    .array(
      z.union([
        z.object({ code: z.string().max(50) }),
        z.object({ label: z.string().max(FIELD_MAX_LENGTH.instrument) }),
      ]),
    )
    .max(MAX_INSTRUMENTS),
});
const addMediaBody = mediaFields.partial({ title: true, instruments: true });
const mediaParam = songParam.extend({ mediaId: z.uuid() });

/** A band's repertoire, under /api/bands/:bandSlug/songs: every member reads, adds and edits. */
export function songRoutes(deps: AppDeps) {
  const { db } = deps;
  const member = requireMember(db);
  const who = (c: Context<BandEnv>) => ({
    bandId: c.var.band.id,
    userId: c.var.user?.id ?? "",
  });

  return (
    new Hono<BandEnv>()
      // The repertoire, or its archived songs with ?archived=true.
      .get("/", member, zValidator("query", listQuery, validationHook), async (c) => {
        const archived = c.req.valid("query").archived === "true";
        return c.json({ songs: await listSongs(db, c.var.band.id, { archived }) });
      })
      .post("/", member, zValidator("json", addBody, validationHook), async (c) => {
        const { confirmDuplicate, ...fields } = c.req.valid("json");
        return c.json({ song: await addSong(db, who(c), fields, { confirmDuplicate }) }, 201);
      })
      .get("/:songId", member, zValidator("param", songParam, validationHook), async (c) => {
        const { songId } = c.req.valid("param");
        const song = await getSong(db, c.var.band.id, songId);
        if (!song) return apiError(c, 404, "Song not found");
        return c.json({ song: { ...song, media: await mediaOf(db, c.var.band.id, songId) } });
      })
      .patch(
        "/:songId",
        member,
        zValidator("param", songParam, validationHook),
        zValidator("json", updateBody, validationHook),
        async (c) => {
          const { confirmDuplicate, ...changes } = c.req.valid("json");
          const song = await updateSong(db, who(c), c.req.valid("param").songId, changes, {
            confirmDuplicate,
          });
          return song ? c.json({ song }) : apiError(c, 404, "Song not found");
        },
      )
      // Any member archives and restores.
      .post(
        "/:songId/archive",
        member,
        zValidator("param", songParam, validationHook),
        async (c) => {
          const song = await setArchived(db, who(c), c.req.valid("param").songId, true);
          return song ? c.json({ song }) : apiError(c, 404, "Song not found");
        },
      )
      .post(
        "/:songId/restore",
        member,
        zValidator("param", songParam, validationHook),
        async (c) => {
          const song = await setArchived(db, who(c), c.req.valid("param").songId, false);
          return song ? c.json({ song }) : apiError(c, 404, "Song not found");
        },
      )
      // Deleting for good is the band leader's, and only for a song nothing uses.
      .delete(
        "/:songId",
        member,
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
        member,
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
        member,
        zValidator("param", mediaParam, validationHook),
        zValidator("json", mediaFields.partial(), validationHook),
        async (c) => {
          const { songId, mediaId } = c.req.valid("param");
          const media = await updateMedia(db, who(c), songId, mediaId, c.req.valid("json"));
          return media ? c.json({ media }) : apiError(c, 404, "Link not found");
        },
      )
      .delete(
        "/:songId/media/:mediaId",
        member,
        zValidator("param", mediaParam, validationHook),
        async (c) => {
          const { songId, mediaId } = c.req.valid("param");
          const deleted = await deleteMedia(db, who(c), songId, mediaId);
          return deleted ? c.body(null, 204) : apiError(c, 404, "Link not found");
        },
      )
  );
}
