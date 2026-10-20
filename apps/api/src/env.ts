import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@coverband/shared";
import { z } from "zod";
import type { SmtpConfig } from "./adapters/mail/mailer";
import type { S3Config } from "./adapters/storage";

const databaseUrl = z.url({ protocol: /^postgres(ql)?$/ });

// Object storage (S3 API): local Garage from docker-compose, Scaleway Object Storage in production.
const s3Schema = z.object({
  S3_ENDPOINT: z.url({ protocol: /^https?$/ }),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
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
    // Shared code keeping the beta private (#148): asked once per device. Empty: no gate.
    BETA_ACCESS_CODE: z.string().trim().default(""),
    // Commit the image was built from (set by the deploy workflow's Docker build), for /api/health.
    BUILD_SHA: z.string().min(1).default("dev"),
    // Where song lyrics are searched (#130). The end-to-end tests point it at a fake.
    LRCLIB_URL: z.url({ protocol: /^https?$/ }).default("https://lrclib.net"),
    ...s3Schema.shape,
  })
  .refine((env) => (env.ADMIN_EMAIL === undefined) === (env.ADMIN_PASSWORD === undefined), {
    message: "Set both ADMIN_EMAIL and ADMIN_PASSWORD, or neither",
    path: ["ADMIN_PASSWORD"],
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

/** Only the object storage variables, for its integration test. */
export function loadS3Env(source: Source = process.env) {
  return parse(s3Schema, source);
}
