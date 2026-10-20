import { createMiddleware } from "hono/factory";

/**
 * Sends requests for other hostnames of the container (the bare domain, #156) to the app URL,
 * with a permanent redirect keeping the path and query. No hosts: does nothing.
 */
export function redirectHosts(hosts: readonly string[], appUrl: string) {
  const target = new URL(appUrl).origin;
  const redirected = new Set(hosts.map((host) => host.toLowerCase()));
  return createMiddleware(async (c, next) => {
    const url = new URL(c.req.url);
    const host = (c.req.header("host")?.split(":")[0] ?? url.hostname).toLowerCase();
    if (!redirected.has(host)) return next();
    const { pathname, search } = url;
    return c.redirect(`${target}${pathname}${search}`, 301);
  });
}
