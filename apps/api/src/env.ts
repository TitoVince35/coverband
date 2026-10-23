import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@coverband/shared";
import { z } from "zod";
import type { SmtpConfig } from "./adapters/mail/mailer";
import type { S3Config } from "./adapters/storage";
import { LOG_FORMATS, LOG_LEVELS, type LoggerOptions } from "./core/log";

const databaseUrl = z.url({ protocol: /^postgres(ql)?$/ });

// Object storage (S3 API): local Garage from docker-compose, Scaleway Object Storage in production.
const s3Schema = z.object({
  S3_ENDPOINT: z.url({ protocol: /^https?$/ }),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
});

// Technical logs on stdout (#42): JSON for Scaleway Cockpit, `pretty` in development.
const logSchema = z.object({
  LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
  LOG_FORMAT: z.enum(LOG_FORMATS).default("json"),
});

const envSchema = z
  .object({
    DATABASE_URL: databaseUrl,
    PORT: z.coerce.number().int().positive().default(3000),
    // Built web app to serve (apps/web/dist). Unset in development: Vite serves the web app.
    WEB_DIST_DIR: z.string().min(1).optional(),
    // Signs and encrypts sessions. Generate one with `openssl rand -base64 32`.
    BETTER_AUTH_SECRET: z.string().min(32),
    // Public URL of the app (where the browser loads it), used for links and origin checks.
    BETTER_AUTH_URL: z.url({ protocol: /^https?$/ }),
    // Other origins allowed to log in, comma-separated (`bun run dev:lan` adds localhost).
    TRUSTED_ORIGINS: z
      .string()
      .default("")
      .transform((value) =>
        value
          .split(",")
          .map((origin) => origin.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.url({ protocol: /^https?$/ }))),
    // Other hostnames of the container, redirected to BETTER_AUTH_URL (comma-separated): the bare
    // domain in production (#156).
    REDIRECT_HOSTS: z
      .string()
      .default("")
      .transform((value) =>
        value
          .split(",")
          .map((host) => host.trim().toLowerCase())
          .filter(Boolean),
      )
      .pipe(z.array(z.hostname())),
    // Request header holding the client IP, for login rate limits. In production, x-real-ip:
    // Scaleway's proxy overwrites it, while a client can set its own X-Forwarded-For.
    CLIENT_IP_HEADER: z
      .string()
      .regex(/^[a-z0-9-]+$/i)
      .transform((value) => value.toLowerCase())
      .default("x-forwarded-for"),
    // Default admin, created at startup if no user has this email. Both or neither.
    ADMIN_EMAIL: z.email().optional(),
    ADMIN_PASSWORD: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH).optional(),
    // Outgoing email over SMTP: Mailpit locally (docker-compose), Scaleway TEM in production.
    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().positive(),
    // true for implicit TLS (port 465); false uses STARTTLS when the server offers it.
    SMTP_SECURE: z.stringbool().default(false),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    MAIL_FROM: z.string().min(3),
    // Where the contact form's messages go (#233). Unset: no contact form.
    CONTACT_FORM_RECIPIENT: z.email().optional(),
    // Shared code keeping the beta private (#148): asked once per device. Empty: no gate.
    BETA_ACCESS_CODE: z.string().trim().default(""),
    // Local HTTPS certificate (#163), set by `bun run serve` / `serve:lan` when mkcert is installed.
    // Unset in production: Scaleway terminates TLS. Both or neither.
    TLS_CERT_FILE: z.string().min(1).optional(),
    TLS_KEY_FILE: z.string().min(1).optional(),
    // Shared with the Scaleway cron triggers calling /api/internal (#45). Unset: no such routes.
    CRON_SECRET: z.string().min(32).optional(),
    // Commit the image was built from (set by the deploy workflow's Docker build), for /api/health.
    BUILD_SHA: z.string().min(1).default("dev"),
    // Where song lyrics are searched (#130). The end-to-end tests point it at a fake.
    LRCLIB_URL: z.url({ protocol: /^https?$/ }).default("https://lrclib.net"),
    // Where a new song's details are looked up (#199). The end-to-end tests point it at a fake.
    DEEZER_URL: z.url({ protocol: /^https?$/ }).default("https://api.deezer.com"),
    // YouTube Data API v3 (#200), server only. Unset: "Search and add" proposes no videos.
    YOUTUBE_API_KEY: z.string().min(1).optional(),
    // The end-to-end tests point them at a fake.
    YOUTUBE_API_URL: z
      .url({ protocol: /^https?$/ })
      .default("https://www.googleapis.com/youtube/v3"),
    YOUTUBE_THUMBNAILS_URL: z.url({ protocol: /^https?$/ }).default("https://i.ytimg.com"),
    ...s3Schema.shape,
    ...logSchema.shape,
  })
  .refine((env) => (env.ADMIN_EMAIL === undefined) === (env.ADMIN_PASSWORD === undefined), {
    message: "Set both ADMIN_EMAIL and ADMIN_PASSWORD, or neither",
    path: ["ADMIN_PASSWORD"],
  })
  .refine((env) => (env.TLS_CERT_FILE === undefined) === (env.TLS_KEY_FILE === undefined), {
    message: "Set both TLS_CERT_FILE and TLS_KEY_FILE, or neither",
    path: ["TLS_KEY_FILE"],
  });

export type Env = z.infer<typeof envSchema>;

export function smtpConfig(env: Env): SmtpConfig {
  return {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    user: env.SMTP_USER,
    password: env.SMTP_PASSWORD,
    from: env.MAIL_FROM,
  };
}

export function logConfig(env: z.infer<typeof logSchema>): LoggerOptions {
  return { level: env.LOG_LEVEL, format: env.LOG_FORMAT };
}

export function s3Config(env: z.infer<typeof s3Schema>): S3Config {
  return {
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  };
}

type Source = Record<string, string | undefined>;

function parse<T extends z.ZodType>(schema: T, source: Source): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

/** Validates environment variables, failing fast with a readable message. */
export function loadEnv(source: Source = process.env): Env {
  return parse(envSchema, source);
}

/** Only the database URL, for tools that don't run the app (migrations, drizzle-kit). */
export function loadDatabaseEnv(source: Source = process.env) {
  return parse(z.object({ DATABASE_URL: databaseUrl }), source);
}

/** Only the log settings, for tools that don't run the app (migrations). */
export function loadLogEnv(source: Source = process.env) {
  return parse(logSchema, source);
}

/** Only the object storage variables, for its integration test. */
export function loadS3Env(source: Source = process.env) {
  return parse(s3Schema, source);
}
