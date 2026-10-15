import { ADMIN_ROLE, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@coverband/shared";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import type { Db } from "./db/client";
import * as schema from "./db/schema";

export type AuthOptions = {
  db: Db;
  secret: string;
  /** Public URL of the app, e.g. http://localhost:5173 in development. */
  baseURL: string;
  /** Login rate limiting (stored in Postgres). Off in tests that log in repeatedly. */
  rateLimit?: boolean;
};

/**
 * Better Auth: email + password, sessions in Postgres (the server is stateless).
 * No public sign-up: accounts only come from invitations (#22, #23, #7) and the
 * default admin (see ensureAdmin). Mounted at /api/auth/*.
 */
export function createAuth({ db, secret, baseURL, rateLimit = true }: AuthOptions) {
  return betterAuth({
    appName: "CoverBand",
    secret,
    baseURL,
    basePath: "/api/auth",
    database: drizzleAdapter(db, { provider: "pg", schema, usePlural: true }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
    },
    // Global roles only ("admin" or "user"); band roles are per membership.
    plugins: [admin({ adminRoles: [ADMIN_ROLE] })],
    rateLimit: { enabled: rateLimit, storage: "database" },
    advanced: { database: { generateId: "uuid" } },
    telemetry: { enabled: false },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type SessionData = NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>;
export type SessionUser = SessionData["user"];
