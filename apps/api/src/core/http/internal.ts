import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { purgeActivity } from "../activity/purge";
import type { Db } from "../db/client";
import { apiError } from "../errors";
import type { LogEnv } from "./request-log";

function sameSecret(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** 401 unless the request carries `Authorization: Bearer <CRON_SECRET>`. */
function requireCronSecret(secret: string) {
  return createMiddleware(async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    if (!header.startsWith("Bearer ") || !sameSecret(header.slice(7), secret)) {
      return apiError(c, 401, "Not allowed");
    }
    await next();
  });
}

/**
 * Jobs the server can't run itself (stateless, no in-process cron), called by Scaleway cron
 * triggers (`infra/cron.tf`) with the shared secret. Mounted only when CRON_SECRET is set.
 */
export function internalRoutes({ db, cronSecret }: { db: Db; cronSecret: string }) {
  return new Hono<LogEnv>()
    .use(requireCronSecret(cronSecret))
    .post("/purge-activity", async (c) => {
      const deleted = await purgeActivity(db);
      c.var.log.info("Activity purged", { deleted });
      return c.json({ deleted });
    });
}
