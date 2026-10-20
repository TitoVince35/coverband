import { createHmac, timingSafeEqual } from "node:crypto";
import { accessCodeBody } from "@coverband/shared/schemas";
import { zValidator } from "@hono/zod-validator";
import type { Context } from "hono";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import type { Db } from "../db/client";
import { apiError } from "../errors";
import { hit, type RateLimitRule } from "./rate-limit";
import { validationHook } from "./validation";

/** The beta access code (#148): a shared code, typed once per device, keeps the beta private. */
export type AccessConfig = {
  code: string;
  /** Signs the cookie (the auth secret): the cookie holds a signature of the code, not the code. */
  secret: string;
  /** Header holding the client IP (CLIENT_IP_HEADER), to rate-limit wrong codes. */
  clientIpHeader: string;
  https: boolean;
};

export const ACCESS_COOKIE = "coverband_access";
const ACCESS_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

/** Code attempts (right or wrong), per client IP. */
export const ACCESS_CODES: RateLimitRule = { name: "access-codes", max: 10, windowMs: 15 * 60_000 };

/**
 * API paths open without the code: the deploy check, the code check itself, the session check
 * (without a session it only answers null, and the web app asks it on every page), and the routes
 * behind email links, whose token is the proof: invitations and password reset.
 */
const OPEN_PATHS = [
  /^\/api\/health$/,
  /^\/api\/access$/,
  /^\/api\/auth\/get-session$/,
  /^\/api\/invitations\//,
  /^\/api\/auth\/reset-password(\/|$)/,
];

export function accessToken({ code, secret }: AccessConfig) {
  return createHmac("sha256", secret).update(`beta-access:${code}`).digest("base64url");
}

function sameToken(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function hasAccess(c: Context, config: AccessConfig) {
  const cookie = getCookie(c, ACCESS_COOKIE);
  return cookie !== undefined && sameToken(cookie, accessToken(config));
}

function grantAccess(c: Context, config: AccessConfig) {
  setCookie(c, ACCESS_COOKIE, accessToken(config), {
    httpOnly: true,
    secure: config.https,
    sameSite: "Lax",
    path: "/",
    maxAge: ACCESS_COOKIE_MAX_AGE,
  });
}

/** A valid email link: an invitation found, or a reset link sent on with its token. */
function isValidEmailLink(c: Context) {
  const { method, path } = c.req;
  if (method !== "GET") return false;
  if (/^\/api\/invitations\/[^/]+$/.test(path)) return c.res.status === 200;
  if (/^\/api\/auth\/reset-password\/[^/]+$/.test(path)) {
    return c.res.status === 302 && (c.res.headers.get("location") ?? "").includes("token=");
  }
  return false;
}

/**
 * Refuses API requests without the code (403 access_required), before any session lookup, so a
 * refused request doesn't wake the database. Following a valid email link grants access: invited
 * musicians never need the code. No config: no gate.
 */
export function accessGate(config: AccessConfig | undefined) {
  return createMiddleware(async (c, next) => {
    if (!config) return next();
    const open = OPEN_PATHS.some((path) => path.test(c.req.path));
    if (!open && !hasAccess(c, config)) {
      return apiError(c, 403, "Access code required", "access_required");
    }
    await next();
    if (open && isValidEmailLink(c) && !hasAccess(c, config)) {
      grantAccess(c, config);
    }
  });
}

/** `GET /api/access`: whether the code is needed and given; `POST`: checks a code. */
export function accessRoutes(db: Db, config: AccessConfig | undefined) {
  return new Hono()
    .get("/", (c) =>
      c.json({ required: config !== undefined, granted: !config || hasAccess(c, config) }),
    )
    .post("/", zValidator("json", accessCodeBody, validationHook), async (c) => {
      if (!config) return c.body(null, 204);
      const ip = c.req.header(config.clientIpHeader)?.split(",")[0]?.trim() || "unknown";
      const retryAfter = await hit(db, ACCESS_CODES, ip);
      if (retryAfter > 0) {
        c.header("Retry-After", String(retryAfter));
        return apiError(c, 429, "Too many attempts, try again later");
      }
      const given = accessToken({ ...config, code: c.req.valid("json").code.trim() });
      if (!sameToken(given, accessToken(config))) {
        return apiError(c, 403, "Wrong access code", "access_code_invalid");
      }
      grantAccess(c, config);
      return c.body(null, 204);
    });
}
