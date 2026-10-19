import { FIELD_MAX_LENGTH } from "@coverband/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { SessionEnv } from "../../core/http/session";
import { validationHook } from "../../core/http/validation";
import type { AppDeps } from "../../deps";
import { requireMember } from "../bands/guard";
import { MAX_INSTRUMENTS, setInstruments } from "../instruments/service";
import { lineupOf } from "./service";

// A member's own instruments in a band: known codes or free text (checked and tidied on save).
const instrumentsBody = z.object({
  instruments: z
    .array(
      z.union([
        z.object({ code: z.string().max(50) }),
        z.object({ label: z.string().max(FIELD_MAX_LENGTH.instrument) }),
      ]),
    )
    .max(MAX_INSTRUMENTS),
});

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
