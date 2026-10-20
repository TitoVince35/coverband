import { sql } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import type { Db } from "../db/client";
import { rateLimits } from "../db/schema";
import { apiError } from "../errors";
import type { SessionEnv } from "./session";

export type RateLimitRule = {
  /** Bucket name, shared by every route using the same rule. */
  name: string;
  max: number;
  windowMs: number;
};

/**
 * Counts one request in a fixed window and returns the seconds to wait, or 0 when allowed.
 * Stored in Better Auth's `rate_limits` table (the server is stateless): `last_request` holds the
 * window start. Keys start with `coverband:`, so they never collide with Better Auth's `ip|path`.
 */
export async function hit(db: Db, rule: RateLimitRule, subject: string, now = Date.now()) {
  const key = `coverband:${rule.name}:${subject}`;
  const expired = sql`${rateLimits.lastRequest} <= ${now - rule.windowMs}`;
  const [row] = await db
    .insert(rateLimits)
    .values({ key, count: 1, lastRequest: now })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${expired} then 1 else ${rateLimits.count} + 1 end`,
        lastRequest: sql`case when ${expired} then ${now} else ${rateLimits.lastRequest} end`,
      },
    })
    .returning({ count: rateLimits.count, start: rateLimits.lastRequest });
  if (!row || row.count <= rule.max) {
    return 0;
  }
  return Math.max(1, Math.ceil((row.start + rule.windowMs - now) / 1000));
}

/**
 * Limits a logged-in user's requests (place after requireUser or an equivalent guard): 429 when
 * over, logged as a warning with the rule (the request's logger carries the user).
 */
export function rateLimitUser(db: Db, rule: RateLimitRule) {
  return createMiddleware<SessionEnv>(async (c, next) => {
    const retryAfter = await hit(db, rule, c.var.user?.id ?? "anonymous");
    if (retryAfter > 0) {
      c.var.log.warn("Rate limited", { rule: rule.name });
      c.header("Retry-After", String(retryAfter));
      return apiError(c, 429, "Too many requests, try again later");
    }
    await next();
  });
}
