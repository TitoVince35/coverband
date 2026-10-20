import { createMiddleware } from "hono/factory";
import { routePath } from "hono/route";
import type { Logger } from "../log";

export type LogEnv = {
  Variables: {
    /** The request's logger: carries `requestId`, then `userId` and `bandId` once known. */
    log: Logger;
  };
};

/** Requests slower than this are logged as warnings. */
export const SLOW_REQUEST_MS = 1000;

/**
 * Gives each request an ID (`X-Request-Id`, so a bug report can point to its log lines) and its
 * logger, then logs it once answered: unhandled errors, 5xx and slow requests, and every other
 * request at debug level. 4xx are normal answers (a form error, a non-member's 404): not logged.
 * Requests are logged by route pattern, never the raw path: tokens are in invitation URLs.
 */
export function requestLog(log: Logger, slowMs = SLOW_REQUEST_MS) {
  return createMiddleware<LogEnv>(async (c, next) => {
    const start = performance.now();
    // Always ours: a client can't pick the ID its requests are logged under.
    const requestId = crypto.randomUUID();
    c.header("X-Request-Id", requestId);
    c.set("log", log.child({ requestId }));

    await next();

    const status = c.res.status;
    const fields = {
      method: c.req.method,
      // The handler or guard that answered (the outermost middleware ran first).
      route: routePath(c),
      status,
      durationMs: Math.round(performance.now() - start),
    };
    // Read again: the session and band guards add the user and the band.
    const requestLog = c.var.log;
    if (c.error && status >= 500) {
      requestLog.error("Unhandled error", { ...fields, err: c.error });
    } else if (status >= 500) {
      requestLog.warn("Server error", fields);
    } else if (fields.durationMs > slowMs) {
      requestLog.warn("Slow request", fields);
    } else if (status < 400) {
      requestLog.debug("Request", fields);
    }
  });
}
