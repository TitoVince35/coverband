import { bandBody, logoBackgroundBody, logoUploadBody } from "@coverband/shared/schemas";
import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { apiError } from "../../core/errors";
import { requireUser, type SessionEnv } from "../../core/http/session";
import { validationHook } from "../../core/http/validation";
import type { AppDeps } from "../../deps";
import { instrumentsOf } from "../instruments/service";
import { type BandEnv, requireLeader, requireMember } from "./guard";
import { logoOf, readLogo, removeLogo, setLogo, setLogoBackground } from "./logo";
import { bandsOf, updateBandGenre } from "./service";

/**
 * The logged-in user's bands (/api/bands), and each band itself for its members (404 otherwise).
 * Changing the genre and the logo is the band leader's; members see the logo. A band's features
 * (members, songs...) are their own sub-apps under /api/bands/:bandSlug, each guarded by
 * requireMember.
 */
export function bandRoutes(deps: AppDeps) {
  const { db } = deps;
  const member = requireMember(db);
  return (
    new Hono<SessionEnv>()
      .use(requireUser)
      .get("/", async (c) => c.json({ bands: await bandsOf(db, c.var.user.id) }))
      .get("/:bandSlug", member, async (c) => {
        const { id, name, slug, genre } = c.var.band;
        const userId = c.var.user.id;
        const instruments = (await instrumentsOf(db, id, [userId])).get(userId) ?? [];
        return c.json({
          band: { name, slug, genre, logo: logoOf(c.var.band) },
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
      )
      // The browser sends the logo already fitted (never cropped) and its thumbnail, as a multipart
      // form: a larger body than the API's usual limit (LOGO_UPLOAD_MAX_SIZE, in src/app.ts).
      .put(
        "/:bandSlug/logo",
        member,
        requireLeader,
        zValidator("form", logoUploadBody, validationHook),
        async (c) => {
          const { logo, thumbnail, background } = c.req.valid("form");
          const bytes = async (file: File) => new Uint8Array(await file.arrayBuffer());
          return c.json({
            logo: await setLogo({ ...deps, log: c.var.log }, c.var.band, c.var.user.id, {
              logo: await bytes(logo),
              thumbnail: await bytes(thumbnail),
              background,
            }),
          });
        },
      )
      .patch(
        "/:bandSlug/logo",
        member,
        requireLeader,
        zValidator("json", logoBackgroundBody, validationHook),
        async (c) => {
          const { background } = c.req.valid("json");
          return c.json({
            logo: await setLogoBackground(deps, c.var.band, c.var.user.id, background),
          });
        },
      )
      .delete("/:bandSlug/logo", member, requireLeader, async (c) => {
        await removeLogo({ ...deps, log: c.var.log }, c.var.band.id, c.var.user.id);
        return c.body(null, 204);
      })
      .get("/:bandSlug/logo", member, (c) => sendLogo(c, "logo"))
      .get("/:bandSlug/logo/thumbnail", member, (c) => sendLogo(c, "thumbnail"))
  );

  /** The logo's file, cached for good when asked by its current URL (?v= changes with it). */
  async function sendLogo(c: Context<BandEnv>, file: "logo" | "thumbnail") {
    const logo = await readLogo(deps, c.var.band, file);
    if (!logo) return apiError(c, 404, "No logo");
    const { pathname, search } = new URL(c.req.url);
    const current = logo.url === pathname + search;
    return c.body(logo.body, 200, {
      "content-type": logo.type,
      "content-length": String(logo.size),
      "cache-control": current ? "private, max-age=31536000, immutable" : "private, no-cache",
    });
  }
}
