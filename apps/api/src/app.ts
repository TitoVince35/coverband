import { resolve } from "node:path";
import { serveStatic } from "@hono/bun";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import type { Auth } from "./auth";
import type { Db } from "./db/client";
import { apiError } from "./errors";
import type { Mailer } from "./mail/mailer";
import { securityHeaders } from "./middleware/security";
import { loadSession, type SessionEnv } from "./middleware/session";
import { adminRoutes } from "./routes/admin";
import { bandRoutes } from "./routes/bands";
import { health } from "./routes/health";
import { invitationRoutes } from "./routes/invitations";

/** Services the API routes use. Tests can pass a database that is never connected to. */
export type AppDeps = {
  auth: Auth;
  db: Db;
  mailer: Mailer;
  /** Public URL of the web app, for links in emails. */
  appUrl: string;
};

export type AppOptions = {
  deps: AppDeps;
  /** Directory of the built web app; when set, it is served with an SPA fallback. */
  webDistDir?: string | undefined;
  /** Request logging, off in tests. */
  log?: boolean;
};

// REST API, mounted under /api. Chained so that AppType carries every route for the typed client.
// Routes read the logged-in user from `c.var.user` and guard with requireUser / requireAdmin.
function createApi(deps: AppDeps) {
  return new Hono<SessionEnv>()
    .use(loadSession(deps.auth))
    .route("/health", health)
    .route("/admin", adminRoutes(deps))
    .route("/invitations", invitationRoutes(deps))
    .route("/bands", bandRoutes(deps));
}

export type AppType = ReturnType<typeof createApi>;

export function createApp({ deps, webDistDir, log = true }: AppOptions) {
  const app = new Hono();

  if (log) {
    app.use(logger());
  }
  app.use(securityHeaders({ https: deps.appUrl.startsWith("https:") }));

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return apiError(c, err.status, err.message);
    }
    console.error(err);
    return apiError(c, 500, "Internal server error");
  });

  // Better Auth endpoints (login, logout, session...), called by the web app's auth client.
  app.on(["GET", "POST"], "/api/auth/*", (c) => deps.auth.handler(c.req.raw));
  app.route("/api", createApi(deps));
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
