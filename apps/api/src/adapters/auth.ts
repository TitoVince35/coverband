import {
  ADMIN_ROLE,
  APP_NAME,
  type Language,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  pickLanguage,
} from "@coverband/shared";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import type { Db } from "../core/db/client";
import * as schema from "../core/db/schema";
import type { Mailer } from "./mail/mailer";
import { passwordResetEmail } from "./mail/templates";

export type AuthOptions = {
  db: Db;
  mailer: Mailer;
  secret: string;
  /** Public URL of the app, e.g. http://localhost:5173 in development. */
  baseURL: string;
  /** Other origins allowed to log in, besides baseURL's (e.g. localhost with `dev:lan`). */
  trustedOrigins?: string[];
  /** Reverse proxies skipped when reading the client IP from X-Forwarded-For (see env.ts). */
  trustedProxies?: string[];
  /** Login rate limiting (stored in Postgres). Off in tests that log in repeatedly. */
  rateLimit?: boolean;
};

/**
 * Better Auth: email + password, sessions in Postgres (the server is stateless).
 * No public sign-up: accounts only come from invitations (#22, #23, #7) and the
 * default admin (see ensureAdmin). Mounted at /api/auth/*.
 */
export function createAuth({
  db,
  mailer,
  secret,
  baseURL,
  trustedOrigins = [],
  trustedProxies = [],
  rateLimit = true,
}: AuthOptions) {
  return betterAuth({
    appName: APP_NAME,
    secret,
    baseURL,
    trustedOrigins,
    basePath: "/api/auth",
    database: drizzleAdapter(db, { provider: "pg", schema, usePlural: true }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      // "Forgot password?" (#24): single-use link valid for 1 hour. It goes through Better Auth,
      // which checks the token and redirects to the web app's reset page with `?token=` or
      // `?error=INVALID_TOKEN`, so a used or expired link says so before a password is typed.
      resetPasswordTokenExpiresIn: RESET_PASSWORD_EXPIRES_IN,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, token }, request) => {
        const url = `${baseURL}/api/auth/reset-password/${encodeURIComponent(token)}?callbackURL=${encodeURIComponent("/reset-password")}`;
        const language = requestLanguage(request);
        // Awaited, so the email is sent before the container may be paused. Known emails answer a
        // little slower than unknown ones: an accepted leak (Better Auth logs send failures).
        await mailer.send(passwordResetEmail(user.email, language, { url }));
      },
    },
    // Profile fields, set by the onboarding wizards only (not through Better Auth endpoints).
    user: {
      additionalFields: {
        firstName: { type: "string", required: false, input: false },
        lastName: { type: "string", required: false, input: false },
        nickname: { type: "string", required: false, input: false },
      },
    },
    // Users change their profile and avatar through our own routes (/api/me), never Better Auth's:
    // `name` must follow the profile, and `image` holds a storage key only the server may write.
    disabledPaths: ["/update-user"],
    // Global roles only ("admin" or "user"); band roles are per membership.
    plugins: [admin({ adminRoles: [ADMIN_ROLE] })],
    rateLimit: { enabled: rateLimit, storage: "database" },
    advanced: {
      database: { generateId: "uuid" },
      // Rate limits are per client IP, read from X-Forwarded-For (set by Scaleway's proxy). A header
      // with several addresses is only trusted with trustedProxies: otherwise every user would
      // share one bucket. Checked at the first deployment (#8).
      ipAddress: { ipAddressHeaders: ["x-forwarded-for"], trustedProxies },
    },
    telemetry: { enabled: false },
  });
}

/** Lifetime of a password reset link, in seconds. */
export const RESET_PASSWORD_EXPIRES_IN = 60 * 60;

/** Language of the request's `Accept-Language` header (the web app sends its current language). */
export function requestLanguage(request: Request | undefined): Language {
  const header = request?.headers.get("accept-language") ?? "";
  return pickLanguage(header.split(",").map((part) => part.split(";")[0]?.trim() ?? ""));
}

export type Auth = ReturnType<typeof createAuth>;
export type SessionData = NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>;
export type SessionUser = SessionData["user"];
