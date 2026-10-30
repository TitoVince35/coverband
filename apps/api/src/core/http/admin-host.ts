import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { apiError } from "../errors";

/**
 * The admin app's host (#246): the container also answers on it (admin-beta.coverband.fr,
 * admin.localhost locally), and serves the admin app there instead of the web app.
 */
export type AdminHost = { hostname: string };

export function adminHost(adminUrl: string | undefined): AdminHost | undefined {
  return adminUrl ? { hostname: new URL(adminUrl).hostname.toLowerCase() } : undefined;
}

/** Whether a request is for the admin host: its hostname, whatever the port. */
export function onAdminHost(c: Context, host: AdminHost | undefined) {
  if (!host) return false;
  const hostname = c.req.header("host")?.split(":")[0] ?? new URL(c.req.url).hostname;
  return hostname.toLowerCase() === host.hostname;
}

/** The API paths the admin app uses: the deploy check, logging in, and the admin routes. */
const ADMIN_API_PATHS = [/^\/api\/health$/, /^\/api\/auth\//, /^\/api\/admin(\/|$)/];

/**
 * On the admin host, every other API path is a 404: a session made there (host-only cookie) only
 * ever reaches what the admin app needs.
 */
export function adminHostApi(host: AdminHost | undefined) {
  return createMiddleware(async (c, next) => {
    if (onAdminHost(c, host) && !ADMIN_API_PATHS.some((path) => path.test(c.req.path))) {
      return apiError(c, 404, "Not found");
    }
    await next();
  });
}
