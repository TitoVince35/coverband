import { isLanguage, pickLanguage, SETLIST_EXPORT_FORMATS } from "@coverband/shared";
import { setlistContentBody, setlistTitleBody } from "@coverband/shared/schemas";
import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { apiError } from "../../core/errors";
import { fileName } from "../../core/http/file-name";
import { hit, type RateLimitRule } from "../../core/http/rate-limit";
import type { SessionEnv } from "../../core/http/session";
import { validationHook } from "../../core/http/validation";
import type { AppDeps } from "../../deps";
import { type BandEnv, requireMember } from "../bands/guard";
import { isTimeZone } from "./export-document";
import { EXPORT_FILES, findExport, makeExport } from "./exports.service";
import {
  createSetlist,
  deleteSetlist,
  duplicateSetlist,
  getSetlistWithContent,
  listSetlists,
  renameSetlist,
  saveSetlistContent,
  setlistDetails,
  setSetlistArchived,
} from "./service";

const setlistParam = z.object({ bandSlug: z.string(), setlistId: z.uuid() });

const listQuery = z.object({ archived: z.enum(["true", "false"]).optional() });

const exportParam = setlistParam.extend({ format: z.enum(SETLIST_EXPORT_FORMATS) });

/** The language and time zone of the requester's app: a new tab doesn't send the app's language. */
const exportQuery = z.object({
  lang: z.string().optional(),
  tz: z.string().max(64).optional(),
  // The setlist's version, only so the address changes with it (no browser copy is reused).
  v: z.string().max(12).optional(),
});

/** Time zone of an export whose request names none, or one the server doesn't know. */
export const DEFAULT_TIME_ZONE = "Europe/Paris";

/**
 * Setlist exports made per user (brief 030): only the files actually made count, a stored one is
 * served for free. Editing then printing again before a gig stays far below it.
 */
export const SETLIST_EXPORTS: RateLimitRule = {
  name: "setlist-exports",
  max: 30,
  windowMs: 60 * 60 * 1000,
};

/**
 * A band's setlists (brief 026), under /api/bands/:bandSlug/setlists: every member lists,
 * creates, renames, archives and restores them; the band leader and a setlist's author delete it.
 */
export function setlistRoutes({ db, storage }: AppDeps) {
  const who = (c: Context<BandEnv>) => ({ bandId: c.var.band.id, userId: c.var.user.id });

  return (
    new Hono<SessionEnv>()
      .use(requireMember(db))
      // The current setlists, or the archived ones with ?archived=true.
      .get("/", zValidator("query", listQuery, validationHook), async (c) => {
        const archived = c.req.valid("query").archived === "true";
        return c.json({ setlists: await listSetlists(db, c.var.band.id, { archived }) });
      })
      .post("/", zValidator("json", setlistTitleBody, validationHook), async (c) => {
        const setlist = await createSetlist(db, who(c), c.req.valid("json").title);
        return c.json({ setlist }, 201);
      })
      // Every setlist, archived ones too, with its parts and songs, for offline use (#274).
      .get("/details", async (c) => c.json({ setlists: await setlistDetails(db, c.var.band.id) }))
      .get("/:setlistId", zValidator("param", setlistParam, validationHook), async (c) => {
        const setlist = await getSetlistWithContent(
          db,
          c.var.band.id,
          c.req.valid("param").setlistId,
        );
        return setlist ? c.json({ setlist }) : apiError(c, 404, "Setlist not found");
      })
      // Its whole content, read at a version: a save on an older one is refused (409).
      // Its export (brief 030): the stored file while it shows the same, otherwise a new one.
      .get(
        "/:setlistId/exports/:format",
        zValidator("param", exportParam, validationHook),
        zValidator("query", exportQuery, validationHook),
        async (c) => {
          const { setlistId, format } = c.req.valid("param");
          const { lang, tz } = c.req.valid("query");
          const language = isLanguage(lang)
            ? lang
            : pickLanguage([c.req.header("accept-language")?.split(",")[0]?.split(";")[0] ?? ""]);
          const timeZone = tz && isTimeZone(tz) ? tz : DEFAULT_TIME_ZONE;
          const deps = { db, storage, log: c.var.log };
          const found = await findExport(deps, c.var.band, setlistId, format, {
            language,
            timeZone,
          });
          if (!found) return apiError(c, 404, "Setlist not found");
          let body: ReadableStream<Uint8Array> | Uint8Array<ArrayBuffer>;
          if (found.cached) {
            body = found.cached.body;
          } else {
            const retryAfter = await hit(db, SETLIST_EXPORTS, c.var.user.id);
            if (retryAfter > 0) {
              c.var.log.warn("Rate limited", { rule: SETLIST_EXPORTS.name });
              c.header("Retry-After", String(retryAfter));
              return apiError(c, 429, "Too many exports, try again later");
            }
            body = new Uint8Array(await makeExport(deps, found.prepared));
          }
          const file = EXPORT_FILES[format];
          return c.body(body, 200, {
            "content-type": file.type,
            "content-disposition": `${file.disposition}; ${fileName(found.prepared.document.title, file.extension)}`,
            // Never kept by a browser: the same address may give another file once the setlist changes.
            "cache-control": "no-store",
          });
        },
      )
      .put(
        "/:setlistId/content",
        zValidator("param", setlistParam, validationHook),
        zValidator("json", setlistContentBody, validationHook),
        async (c) => {
          const setlist = await saveSetlistContent(
            db,
            who(c),
            c.req.valid("param").setlistId,
            c.req.valid("json"),
          );
          return setlist ? c.json({ setlist }) : apiError(c, 404, "Setlist not found");
        },
      )
      .patch(
        "/:setlistId",
        zValidator("param", setlistParam, validationHook),
        zValidator("json", setlistTitleBody, validationHook),
        async (c) => {
          const setlist = await renameSetlist(
            db,
            who(c),
            c.req.valid("param").setlistId,
            c.req.valid("json").title,
          );
          return setlist ? c.json({ setlist }) : apiError(c, 404, "Setlist not found");
        },
      )
      // A copy with the same parts and songs (#273): the title asked for, numbered when taken.
      .post(
        "/:setlistId/duplicate",
        zValidator("param", setlistParam, validationHook),
        zValidator("json", setlistTitleBody, validationHook),
        async (c) => {
          const setlist = await duplicateSetlist(
            db,
            who(c),
            c.req.valid("param").setlistId,
            c.req.valid("json").title,
          );
          return setlist ? c.json({ setlist }, 201) : apiError(c, 404, "Setlist not found");
        },
      )
      .post("/:setlistId/archive", zValidator("param", setlistParam, validationHook), async (c) => {
        const setlist = await setSetlistArchived(db, who(c), c.req.valid("param").setlistId, true);
        return setlist ? c.json({ setlist }) : apiError(c, 404, "Setlist not found");
      })
      .post("/:setlistId/restore", zValidator("param", setlistParam, validationHook), async (c) => {
        const setlist = await setSetlistArchived(db, who(c), c.req.valid("param").setlistId, false);
        return setlist ? c.json({ setlist }) : apiError(c, 404, "Setlist not found");
      })
      // For good: the band leader, or the setlist's author (403 for the others).
      .delete("/:setlistId", zValidator("param", setlistParam, validationHook), async (c) => {
        const deleted = await deleteSetlist(
          { db, storage, log: c.var.log },
          { ...who(c), isLeader: c.var.membership.role === "leader" },
          c.req.valid("param").setlistId,
        );
        return deleted ? c.body(null, 204) : apiError(c, 404, "Setlist not found");
      })
  );
}
