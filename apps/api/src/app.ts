import { resolve } from "node:path";
import { serveStatic } from "@hono/bun";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import type { Auth } from "./auth";
import { apiError } from "./errors";
import { loadSession, type SessionEnv } from "./middleware/session";
import { health } from "./routes/health";

export type AppOptions = {
  /** Better Auth instance; without it (tests that don't need a database) nobody is logged in. */
  auth?: Auth | undefined;
  /** Directory of the built web app; when set, it is served with an SPA fallback. */
  webDistDir?: string | undefined;
  /** Request logging, off in tests. */
  log?: boolean;
};

// REST API, mounted under /api. Chained so that AppType carries every route for the typed client.
// Routes read the logged-in user from `c.var.user` and guard with requireUser / requireAdmin.
function createApi(auth: Auth | undefined) {
  return new Hono<SessionEnv>().use(loadSession(auth)).route("/health", health);
}

export type AppType = ReturnType<typeof createApi>;

export function createApp({ auth, webDistDir, log = true }: AppOptions = {}) {
  const app = new Hono();

  if (log) {
    app.use(logger());
  }

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return apiError(c, err.status, err.message);
    }
    console.error(err);
    return apiError(c, 500, "Internal server error");
  });

  // Better Auth endpoints (login, logout, session...), called by the web app's auth client.
  if (auth) {
    app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
  }
  app.route("/api", createApi(auth));
  // Unknown API routes stay JSON 404s, never the web app shell.
  app.all("/api/*", (c) => apiError(c, 404, "Not found"));

  if (webDistDir) {
    const root = resolve(webDistDir);
    app.use("*", serveStatic({ root }));
    // Client-side routing: any other GET that accepts HTML gets the app shell.
    app.get("*", serveStatic({ root, path: "index.html" }));
  }

  return app;
}
