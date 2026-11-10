import { setlistContentBody, setlistTitleBody } from "@coverband/shared/schemas";
import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { apiError } from "../../core/errors";
import type { SessionEnv } from "../../core/http/session";
import { validationHook } from "../../core/http/validation";
import type { AppDeps } from "../../deps";
import { type BandEnv, requireMember } from "../bands/guard";
import {
  createSetlist,
  deleteSetlist,
  duplicateSetlist,
  getSetlistWithContent,
  listSetlists,
  renameSetlist,
  saveSetlistContent,
  setSetlistArchived,
} from "./service";

const setlistParam = z.object({ bandSlug: z.string(), setlistId: z.uuid() });

const listQuery = z.object({ archived: z.enum(["true", "false"]).optional() });

/**
 * A band's setlists (brief 026), under /api/bands/:bandSlug/setlists: every member lists,
 * creates, renames, archives and restores them; the band leader and a setlist's author delete it.
 */
export function setlistRoutes({ db }: AppDeps) {
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
      .get("/:setlistId", zValidator("param", setlistParam, validationHook), async (c) => {
        const setlist = await getSetlistWithContent(
          db,
          c.var.band.id,
          c.req.valid("param").setlistId,
        );
        return setlist ? c.json({ setlist }) : apiError(c, 404, "Setlist not found");
      })
      // Its whole content, read at a version: a save on an older one is refused (409).
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
          db,
          { ...who(c), isLeader: c.var.membership.role === "leader" },
          c.req.valid("param").setlistId,
        );
        return deleted ? c.body(null, 204) : apiError(c, 404, "Setlist not found");
      })
  );
}
