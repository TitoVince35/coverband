import { createMiddleware } from "hono/factory";

/** Vite's hashed build files: a new build gets new names, so they never change. */
export const IMMUTABLE = "public, max-age=31536000, immutable";

/**
 * Cache headers for the built web app (#164): the hashed files in `/assets/` are cached for a
 * year; everything else (the app shell, `sw.js`, `registerSW.js`, the manifest, icons) is checked
 * again on every load, so a deploy is noticed at once. API responses are left alone.
 */
export const staticCacheHeaders = createMiddleware(async (c, next) => {
  await next();
  if (c.req.path.startsWith("/api/") || c.res.headers.has("cache-control")) return;
  const hashed = c.req.path.startsWith("/assets/") && c.res.status === 200;
  c.header("Cache-Control", hashed ? IMMUTABLE : "no-cache");
});
