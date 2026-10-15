import { ADMIN_ROLE } from "@coverband/shared";
import { createMiddleware } from "hono/factory";
import type { Auth, SessionData, SessionUser } from "../auth";
import { apiError } from "../errors";

export type SessionEnv = {
  Variables: {
    user: SessionUser | null;
    session: SessionData["session"] | null;
  };
};

/** Loads the session from the request cookies into `c.var.user` / `c.var.session` (null if none). */
export function loadSession(auth: Auth) {
  return createMiddleware<SessionEnv>(async (c, next) => {
    const data = await auth.api.getSession({ headers: c.req.raw.headers });
    c.set("user", data?.user ?? null);
    c.set("session", data?.session ?? null);
    await next();
  });
}

/** 401 unless logged in. */
export const requireUser = createMiddleware<SessionEnv>(async (c, next) => {
  if (!c.var.user) {
    return apiError(c, 401, "Not logged in");
  }
  await next();
});

/** 401 unless logged in, 403 unless the user is an application admin. */
export const requireAdmin = createMiddleware<SessionEnv>(async (c, next) => {
  if (!c.var.user) {
    return apiError(c, 401, "Not logged in");
  }
  if (c.var.user.role !== ADMIN_ROLE) {
    return apiError(c, 403, "Admins only");
  }
  await next();
});
