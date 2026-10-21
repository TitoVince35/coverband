import { SONG_MAX_LENGTH } from "@coverband/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { type RateLimitRule, rateLimitBy } from "../../core/http/rate-limit";
import type { SessionEnv } from "../../core/http/session";
import { validationHook } from "../../core/http/validation";
import type { AppDeps } from "../../deps";
import { type BandEnv, requireMember } from "../bands/guard";
import { autofill } from "./service";

/** "I feel lucky" searches per band and day (#199): YouTube's free quota is shared by the app. */
export const AUTOFILL_SEARCHES: RateLimitRule = {
  name: "autofill-searches",
  max: 15,
  windowMs: 24 * 60 * 60 * 1000,
};

const songQuery = z.object({
  title: z.string().trim().min(1).max(SONG_MAX_LENGTH.title),
  artist: z.string().trim().min(1).max(SONG_MAX_LENGTH.artist),
});

/** A new song's details looked up online, under /api/bands/:bandSlug/autofill (members). */
export function autofillRoutes(deps: AppDeps) {
  return new Hono<SessionEnv>().use(requireMember(deps.db)).get(
    "/",
    zValidator("query", songQuery, validationHook),
    rateLimitBy<BandEnv & SessionEnv>(deps.db, AUTOFILL_SEARCHES, (c) => c.var.band.id),
    async (c) => c.json(await autofill(deps, c.req.valid("query"))),
  );
}
