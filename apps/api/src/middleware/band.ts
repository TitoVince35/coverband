import type { BandRole } from "@coverband/shared";
import { and, eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import type { SessionUser } from "../auth";
import type { Db } from "../db/client";
import { bandMembers, bands } from "../db/schema";
import { apiError } from "../errors";
import type { UserEnv } from "./session";

export type BandEnv = UserEnv & {
  Variables: {
    band: typeof bands.$inferSelect;
    membership: { role: BandRole };
  };
};

/**
 * For routes under /bands/:bandSlug: loads the band into `c.var.band` and the user's membership
 * into `c.var.membership`. Someone who isn't a member gets a 404, as if the band didn't exist,
 * so band names can't be probed.
 */
export function requireMember(db: Db) {
  return createMiddleware<BandEnv>(async (c, next) => {
    // Typed as logged in for the routes after it, but it checks it itself.
    const user = c.var.user as SessionUser | null;
    if (!user) {
      return apiError(c, 401, "Not logged in");
    }
    const slug = c.req.param("bandSlug") ?? "";
    const [row] = await db
      .select({ band: bands, role: bandMembers.role })
      .from(bands)
      .innerJoin(
        bandMembers,
        and(eq(bandMembers.bandId, bands.id), eq(bandMembers.userId, user.id)),
      )
      .where(eq(bands.slug, slug));
    if (!row) {
      return apiError(c, 404, "Band not found");
    }
    c.set("band", row.band);
    c.set("membership", { role: row.role });
    await next();
  });
}

/** After requireMember: 403 unless the user is the band's leader. */
export const requireLeader = createMiddleware<BandEnv>(async (c, next) => {
  if (c.var.membership.role !== "leader") {
    return apiError(c, 403, "Band leaders only");
  }
  await next();
});
