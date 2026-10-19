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

/** After requireUser or requireAdmin: the user is logged in. */
export type UserEnv = {
  Variables: {
    user: SessionUser;
    session: SessionData["session"];
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

// The guards are typed with UserEnv so the routes after them read a non-null `c.var.user`; they
// run where loadSession may have set null, which is what they check.

/** 401 unless logged in. */
export const requireUser = createMiddleware<UserEnv>(async (c, next) => {
  if (!(c.var.user as SessionUser | null)) {
    return apiError(c, 401, "Not logged in");
  }
  await next();
});

/** 401 unless logged in, 403 unless the user is an application admin. */
export const requireAdmin = createMiddleware<UserEnv>(async (c, next) => {
  if (!(c.var.user as SessionUser | null)) {
    return apiError(c, 401, "Not logged in");
  }
  if (c.var.user.role !== ADMIN_ROLE) {
    return apiError(c, 403, "Admins only");
  }
  await next();
});
