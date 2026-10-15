import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  PORT: z.coerce.number().int().positive().default(3000),
  // Built web app to serve (apps/web/dist). Unset in development: Vite serves the web app.
  WEB_DIST_DIR: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

/** Validates environment variables, failing fast with a readable message. */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
