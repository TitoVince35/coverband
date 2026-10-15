import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@coverband/shared";
import { z } from "zod";

const databaseUrl = z.url({ protocol: /^postgres(ql)?$/ });

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
    // Default admin, created at startup if no user has this email. Both or neither.
    ADMIN_EMAIL: z.email().optional(),
    ADMIN_PASSWORD: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH).optional(),
  })
  .refine((env) => (env.ADMIN_EMAIL === undefined) === (env.ADMIN_PASSWORD === undefined), {
    message: "Set both ADMIN_EMAIL and ADMIN_PASSWORD, or neither",
    path: ["ADMIN_PASSWORD"],
  });

export type Env = z.infer<typeof envSchema>;

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
