import { bandContactBody } from "@coverband/shared/schemas";
import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { apiError } from "../../core/errors";
import type { SessionEnv } from "../../core/http/session";
import { validationHook } from "../../core/http/validation";
import type { AppDeps } from "../../deps";
import { type BandEnv, requireMember } from "../bands/guard";
import {
  createBandContact,
  getBandContact,
  listBandContacts,
  updateBandContact,
} from "./contacts.service";

const contactParam = z.object({ bandSlug: z.string(), contactId: z.uuid() });
const listQuery = z.object({ q: z.string().max(100).optional() });

/**
 * A band's contacts (#329), under /api/bands/:bandSlug/contacts: every member lists, adds and
 * changes them; gigs and venues link them (a change shows everywhere).
 */
export function bandContactRoutes({ db }: AppDeps) {
  const who = (c: Context<BandEnv>) => ({ bandId: c.var.band.id, userId: c.var.user.id });
  return new Hono<SessionEnv>()
    .use(requireMember(db))
    .get("/", zValidator("query", listQuery, validationHook), async (c) => {
      const contacts = await listBandContacts(db, c.var.band.id, c.req.valid("query").q);
      return c.json({ contacts });
    })
    .post("/", zValidator("json", bandContactBody, validationHook), async (c) => {
      const contact = await createBandContact(db, who(c), c.req.valid("json"));
      return contact ? c.json({ contact }, 201) : apiError(c, 500, "Contact not created");
    })
    .get("/:contactId", zValidator("param", contactParam, validationHook), async (c) => {
      const contact = await getBandContact(db, c.var.band.id, c.req.valid("param").contactId);
      return contact ? c.json({ contact }) : apiError(c, 404, "Contact not found");
    })
    .patch(
      "/:contactId",
      zValidator("param", contactParam, validationHook),
      zValidator("json", bandContactBody, validationHook),
      async (c) => {
        const contact = await updateBandContact(
          db,
          who(c),
          c.req.valid("param").contactId,
          c.req.valid("json"),
        );
        return contact ? c.json({ contact }) : apiError(c, 404, "Contact not found");
      },
    );
}
