import { resolve } from "node:path";
import { serveStatic } from "@hono/bun";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { apiError } from "./errors";
import { health } from "./routes/health";

export type AppOptions = {
  /** Directory of the built web app; when set, it is served with an SPA fallback. */
  webDistDir?: string | undefined;
  /** Request logging, off in tests. */
  log?: boolean;
};

// REST API, mounted under /api. Chained so that AppType carries every route for the typed client.
const api = new Hono().route("/health", health);

export type AppType = typeof api;

export function createApp({ webDistDir, log = true }: AppOptions = {}) {
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

  app.route("/api", api);
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
