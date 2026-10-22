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
import { recordActivity } from "../core/activity/record";
import type { Db } from "../core/db/client";
import * as schema from "../core/db/schema";
import type { Logger } from "../core/log";
import type { Mailer } from "./mail/mailer";
import { passwordResetEmail } from "./mail/templates";

export type AuthOptions = {
  db: Db;
  /** Better Auth's own logs go there too. */
  log: Logger;
  mailer: Mailer;
  secret: string;
  /** Public URL of the app, e.g. http://localhost:5173 in development. */
  baseURL: string;
  /** Other origins allowed to log in, besides baseURL's (e.g. localhost with `dev:lan`). */
  trustedOrigins?: string[];
  /** Request header holding the client IP (see env.ts). */
  clientIpHeader?: string;
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
  log,
  mailer,
  secret,
  baseURL,
  trustedOrigins = [],
  clientIpHeader = "x-forwarded-for",
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
        // little slower than unknown ones: an accepted leak. A failed send gets the same answer.
        try {
          await mailer.send(passwordResetEmail(user.email, language, { url }));
        } catch (error) {
          log.error("Password reset email not sent", { userId: user.id, err: error });
        }
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
    databaseHooks: {
      session: {
        create: {
          // An admin starting to view the app as a user (#214). Not in the session's transaction:
          // Better Auth owns it.
          after: async (session) => {
            const { impersonatedBy } = session as { impersonatedBy?: string | null };
            if (!impersonatedBy) return;
            await recordActivity(db, {
              action: "user.impersonated",
              bandId: null,
              actorId: impersonatedBy,
              target: { type: "user", id: session.userId },
            });
          },
        },
      },
    },
    rateLimit: { enabled: rateLimit, storage: "database" },
    advanced: {
      database: { generateId: "uuid" },
      // Rate limits are per client IP, read from one header: X-Real-IP in production (written by
      // Scaleway's proxy, a client can't set it), X-Forwarded-For elsewhere (the e2e tests set it).
      ipAddress: { ipAddressHeaders: [clientIpHeader] },
    },
    telemetry: { enabled: false },
    logger: betterAuthLogger(log),
  });
}

const EMAIL = /[^\s@<>"'(),:;]+@[^\s@<>"'(),:;]+\.[a-z]{2,}/gi;

/**
 * Better Auth's logs in our format. Its messages may hold an email (its "sign-up attempt for
 * existing email", unreachable here): they are masked. Its arguments are mostly errors.
 */
export function betterAuthLogger(log: Logger) {
  return {
    level: "debug" as const,
    disableColors: true,
    log(level: "debug" | "info" | "warn" | "error", message: string, ...args: unknown[]) {
      const [first, ...rest] = args;
      const fields =
        first instanceof Error
          ? { err: first, ...(rest.length > 0 && { args: rest }) }
          : args.length > 0
            ? { args }
            : {};
      log[level](`Better Auth: ${message.replace(EMAIL, "[email]")}`, fields);
    },
  };
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
