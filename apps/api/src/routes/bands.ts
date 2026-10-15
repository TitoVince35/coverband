import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppDeps } from "../app";
import { bandMembers, bands } from "../db/schema";
import { type BandEnv, requireMember } from "../middleware/band";
import { requireUser } from "../middleware/session";

/** The logged-in user's bands (/api/bands). Band-scoped routes check membership. */
export function bandRoutes({ db }: AppDeps) {
  return new Hono<BandEnv>()
    .use(requireUser)
    .get("/", async (c) => {
      const rows = await db
        .select({
          name: bands.name,
          slug: bands.slug,
          genre: bands.genre,
          role: bandMembers.role,
          instrument: bandMembers.instrument,
        })
        .from(bandMembers)
        .innerJoin(bands, eq(bands.id, bandMembers.bandId))
        .where(eq(bandMembers.userId, c.var.user?.id ?? ""))
        .orderBy(asc(bands.name));
      return c.json({ bands: rows });
    })
    .get("/:bandSlug", requireMember(db), (c) => {
      const { name, slug, genre } = c.var.band;
      return c.json({ band: { name, slug, genre }, membership: c.var.membership });
    });
}
