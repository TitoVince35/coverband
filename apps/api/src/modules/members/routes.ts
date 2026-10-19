import { instrumentsBody } from "@coverband/shared/schemas";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { SessionEnv } from "../../core/http/session";
import { validationHook } from "../../core/http/validation";
import type { AppDeps } from "../../deps";
import { requireMember } from "../bands/guard";
import { setInstruments } from "../instruments/service";
import { lineupOf } from "./service";

/** A band's lineup (/api/bands/:bandSlug/members), for its members. */
export function memberRoutes(deps: AppDeps) {
  const { db } = deps;
  return (
    new Hono<SessionEnv>()
      .use(requireMember(db))
      .get("/", async (c) => c.json({ members: await lineupOf(db, c.var.band.id) }))
      // Members change their own instruments only.
      .put("/me/instruments", zValidator("json", instrumentsBody, validationHook), async (c) => {
        const instruments = await setInstruments(
          db,
          { bandId: c.var.band.id, userId: c.var.user.id },
          c.req.valid("json").instruments,
        );
        return c.json({ instruments });
      })
  );
}
