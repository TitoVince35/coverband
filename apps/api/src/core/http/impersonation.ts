import { createMiddleware } from "hono/factory";
import type { Auth } from "../../adapters/auth";
import { apiError } from "../errors";

/** Methods that change nothing: always allowed. */
const READ_METHODS = ["GET", "HEAD", "OPTIONS"];

/** The ways out of an impersonation, allowed during it. */
const WAYS_OUT = ["/api/auth/admin/stop-impersonating", "/api/auth/sign-out"];

/**
 * Impersonation is read-only (#214): an admin viewing the app as a user (Better Auth's admin
 * plugin, a session with `impersonatedBy`) changes nothing in their name, Better Auth's own
 * endpoints included (revoking the user's sessions, changing their password...). Only writes look
 * the session up, so reads cost nothing more.
 */
export function impersonationReadOnly(auth: Auth) {
  return createMiddleware(async (c, next) => {
    if (READ_METHODS.includes(c.req.method) || WAYS_OUT.includes(c.req.path)) {
      return next();
    }
    const data = await auth.api.getSession({ headers: c.req.raw.headers });
    if (data?.session.impersonatedBy) {
      return apiError(c, 403, "Read-only while viewing as another user", "impersonation_read_only");
    }
    await next();
  });
}
