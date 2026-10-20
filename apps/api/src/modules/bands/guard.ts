import type { BandRole } from "@coverband/shared";
import { createMiddleware } from "hono/factory";
import type { SessionUser } from "../../adapters/auth";
import type { Db } from "../../core/db/client";
import { apiError } from "../../core/errors";
import type { UserEnv } from "../../core/http/session";
import { type Band, membershipOf } from "./service";

export type BandEnv = UserEnv & {
  Variables: {
    band: Band;
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
    const row = await membershipOf(db, c.req.param("bandSlug") ?? "", user.id);
    if (!row) {
      return apiError(c, 404, "Band not found");
    }
    c.set("band", row.band);
    c.set("membership", { role: row.role });
    c.set("log", c.var.log.child({ bandId: row.band.id }));
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
