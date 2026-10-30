import { resolve } from "node:path";
import { serveStatic } from "@hono/bun";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { AppError, apiError, appErrorResponse } from "./core/errors";
import { accessGate, accessRoutes } from "./core/http/access";
import { adminHost, adminHostApi, onAdminHost } from "./core/http/admin-host";
import { healthRoutes } from "./core/http/health";
import { impersonationReadOnly } from "./core/http/impersonation";
import { internalRoutes } from "./core/http/internal";
import { redirectHosts } from "./core/http/redirect";
import { type LogEnv, requestLog } from "./core/http/request-log";
import { noIndex, requestGuards, securityHeaders, wantsHsts } from "./core/http/security";
import { loadSession, type SessionEnv } from "./core/http/session";
import { staticCacheHeaders } from "./core/http/static-cache";
import type { AppDeps } from "./deps";
import { adminRoutes } from "./modules/admin/routes";
import { autofillRoutes } from "./modules/autofill/routes";
import { bandJournalSource } from "./modules/bands/journal";
import { LOGO_UPLOAD_MAX_SIZE } from "./modules/bands/logo";
import { bandRoutes } from "./modules/bands/routes";
import { contactRoutes } from "./modules/contact/routes";
import { instrumentRoutes } from "./modules/instruments/routes";
import { bandInvitationRoutes, leaderInvitationRoutes } from "./modules/invitations/routes";
import { journalRoutes } from "./modules/journal/routes";
import { memberRoutes } from "./modules/members/routes";
import { adminNotificationRoutes, notificationRoutes } from "./modules/notifications/routes";
import { onboardingRoutes } from "./modules/onboarding/routes";
import { meRoutes } from "./modules/profile/routes";
import { userRoutes } from "./modules/profile/user-routes";
import { DOCUMENT_UPLOAD_MAX_SIZE, documentRoutes } from "./modules/songs/documents-routes";
import { songJournalSource } from "./modules/songs/journal";
import { songRoutes } from "./modules/songs/routes";

export type AppOptions = {
  deps: AppDeps;
  /** Directory of the built web app; when set, it is served with an SPA fallback. */
  webDistDir?: string | undefined;
  /** Directory of the built admin app (#246), served the same way on the admin host. */
  adminDistDir?: string | undefined;
};

// REST API, mounted under /api. Chained so that AppType carries every route for the typed client.
// Routes read the logged-in user from `c.var.user` and guard with requireUser / requireAdmin.
function createApi(deps: AppDeps) {
  return (
    new Hono<SessionEnv>()
      .use(loadSession(deps.auth))
      .route("/health", healthRoutes(deps.buildInfo))
      .route("/access", accessRoutes(deps.db, deps.access))
      .route("/admin", adminRoutes(deps, [bandJournalSource, songJournalSource]))
      .route("/admin/invitations", leaderInvitationRoutes(deps))
      .route("/admin/notifications", adminNotificationRoutes(deps))
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
      .route("/bands/:bandSlug/songs/:songId/documents", documentRoutes(deps))
      .route("/bands/:bandSlug/autofill", autofillRoutes(deps))
      .route("/bands/:bandSlug/invitations", bandInvitationRoutes(deps))
      .route("/me", meRoutes(deps))
      .route("/users", userRoutes(deps))
      .route("/instruments", instrumentRoutes(deps))
      .route("/contact", contactRoutes(deps))
      .route("/notifications", notificationRoutes(deps))
  );
}

export type AppType = ReturnType<typeof createApi>;

/** A built single-page app: its files, and its shell for client-side routes. */
function spa(dir: string) {
  const root = resolve(dir);
  return (
    new Hono()
      .use("*", staticCacheHeaders)
      .use("*", serveStatic({ root }))
      // A missing build file (an old build's, after a deploy) is a 404, never the app shell: the
      // web app then reloads onto the new build (#164).
      .get("/assets/*", (c) => c.text("Not found", 404))
      // Client-side routing: any other GET that accepts HTML gets the app shell.
      .get("*", serveStatic({ root, path: "index.html" }))
  );
}

export function createApp({ deps, webDistDir, adminDistDir }: AppOptions) {
  const app = new Hono<LogEnv>();
  const admin = adminHost(deps.adminUrl);

  // First, so it times and logs everything below; it also logs the 500s of onError.
  app.use(requestLog(deps.log));
  app.use(securityHeaders({ hsts: wantsHsts(deps.appUrl) }));
  app.use(noIndex);
  app.use(redirectHosts(deps.redirectHosts ?? [], deps.appUrl));

  // Expected refusals thrown by the domain become their JSON error; anything else is a 500
  // (logged with its stack by requestLog).
  app.onError((err, c) => {
    if (err instanceof AppError) {
      // A refusal caused by an external service that failed (LRCLIB down): its cause is logged.
      if (err.cause !== undefined) {
        c.var.log.error(`${err.code}: ${err.message}`, { err: err.cause });
      }
      return appErrorResponse(c, err);
    }
    if (err instanceof HTTPException) {
      return apiError(c, err.status, err.message || "Request refused");
    }
    return apiError(c, 500, "Internal server error");
  });

  app.use(
    "/api/*",
    ...requestGuards(
      [deps.appUrl, ...(deps.adminUrl ? [deps.adminUrl] : []), ...(deps.trustedOrigins ?? [])],
      [
        { method: "PUT", path: /^\/api\/bands\/[^/]+\/logo$/, maxSize: LOGO_UPLOAD_MAX_SIZE },
        {
          method: "POST",
          path: /^\/api\/bands\/[^/]+\/songs\/[^/]+\/documents$/,
          maxSize: DOCUMENT_UPLOAD_MAX_SIZE,
        },
      ],
    ),
  );
  // The admin host only reaches what the admin app needs (#246).
  app.use("/api/*", adminHostApi(admin));
  // The beta access code, before Better Auth and any session lookup. Not on the admin host: only
  // logging in and the admin routes are there, and an account is as good a proof as the code.
  const gate = accessGate(deps.access);
  app.use("/api/*", (c, next) => (onAdminHost(c, admin) ? next() : gate(c, next)));
  // An admin viewing the app as another user changes nothing (#214), Better Auth included.
  app.use("/api/*", impersonationReadOnly(deps.auth));

  // Better Auth endpoints (login, logout, session...), called by the web app's auth client.
  app.on(["GET", "POST"], "/api/auth/*", (c) => deps.auth.handler(c.req.raw));
  app.route("/api", createApi(deps));
  // Cron jobs (Scaleway triggers), outside the typed API: the web app never calls them.
  if (deps.cronSecret) {
    app.route("/api/internal", internalRoutes({ db: deps.db, cronSecret: deps.cronSecret }));
  }
  // Unknown API routes stay JSON 404s, never the web app shell.
  app.all("/api/*", (c) => apiError(c, 404, "Not found"));

  // The admin host gets the admin app, every other host the web app.
  const web = webDistDir ? spa(webDistDir) : undefined;
  const adminSite = adminDistDir ? spa(adminDistDir) : undefined;
  if (web || adminSite) {
    app.all("*", (c) => {
      const site = onAdminHost(c, admin) ? adminSite : web;
      return site ? site.fetch(c.req.raw) : c.text("Not found", 404);
    });
  }

  return app;
}
