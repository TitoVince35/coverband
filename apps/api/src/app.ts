import { resolve } from "node:path";
import { serveStatic } from "@hono/bun";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { AppError, apiError, appErrorResponse } from "./core/errors";
import { accessGate, accessRoutes } from "./core/http/access";
import { healthRoutes } from "./core/http/health";
import { noIndex, requestGuards, securityHeaders } from "./core/http/security";
import { loadSession, type SessionEnv } from "./core/http/session";
import type { AppDeps } from "./deps";
import { adminRoutes } from "./modules/admin/routes";
import { bandJournalSource } from "./modules/bands/journal";
import { bandRoutes } from "./modules/bands/routes";
import { instrumentRoutes } from "./modules/instruments/routes";
import { bandInvitationRoutes, leaderInvitationRoutes } from "./modules/invitations/routes";
import { journalRoutes } from "./modules/journal/routes";
import { memberRoutes } from "./modules/members/routes";
import { onboardingRoutes } from "./modules/onboarding/routes";
import { meRoutes } from "./modules/profile/routes";
import { userRoutes } from "./modules/profile/user-routes";
import { songJournalSource } from "./modules/songs/journal";
import { songRoutes } from "./modules/songs/routes";

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
  return (
    new Hono<SessionEnv>()
      .use(loadSession(deps.auth))
      .route("/health", healthRoutes(deps.buildInfo))
      .route("/access", accessRoutes(deps.db, deps.access))
      .route("/admin", adminRoutes(deps))
      .route("/admin/invitations", leaderInvitationRoutes(deps))
      // Invitation links, public: the token is the proof (onboarding).
      .route("/invitations", onboardingRoutes(deps))
      .route("/bands", bandRoutes(deps))
      // A band's features: each sub-app requires membership of the band (404 otherwise).
      .route("/bands/:bandSlug/members", memberRoutes(deps))
      .route(
        "/bands/:bandSlug/activity",
        journalRoutes(deps, [bandJournalSource, songJournalSource]),
      )
      .route("/bands/:bandSlug/songs", songRoutes(deps))
      .route("/bands/:bandSlug/invitations", bandInvitationRoutes(deps))
      .route("/me", meRoutes(deps))
      .route("/users", userRoutes(deps))
      .route("/instruments", instrumentRoutes(deps))
  );
}

export type AppType = ReturnType<typeof createApi>;

export function createApp({ deps, webDistDir, log = true }: AppOptions) {
  const app = new Hono();

  if (log) {
    app.use(logger());
  }
  app.use(securityHeaders({ https: deps.appUrl.startsWith("https:") }));
  app.use(noIndex);

  // Expected refusals thrown by the domain become their JSON error; anything else is a 500.
  app.onError((err, c) => {
    if (err instanceof AppError) {
      return appErrorResponse(c, err);
    }
    if (err instanceof HTTPException) {
      return apiError(c, err.status, err.message || "Request refused");
    }
    console.error(err);
    return apiError(c, 500, "Internal server error");
  });

  app.use("/api/*", ...requestGuards([deps.appUrl, ...(deps.trustedOrigins ?? [])]));
  // The beta access code, before Better Auth and any session lookup.
  app.use("/api/*", accessGate(deps.access));

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
