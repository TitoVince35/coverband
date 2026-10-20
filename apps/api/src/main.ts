import { APP_NAME } from "@coverband/shared";
import rootPackage from "../../../package.json" with { type: "json" };
import { createAuth } from "./adapters/auth";
import { createLrclibProvider } from "./adapters/lyrics";
import { createSmtpMailer } from "./adapters/mail/mailer";
import { createS3Storage } from "./adapters/storage";
import { createApp } from "./app";
import { ensureAdmin } from "./bootstrap";
import { createDb } from "./core/db/client";
import { createLogger } from "./core/log";
import { loadEnv, logConfig, s3Config, smtpConfig } from "./env";

const env = loadEnv();
const log = createLogger(logConfig(env));
const { db } = createDb(env.DATABASE_URL);
const mailer = createSmtpMailer(smtpConfig(env));
const storage = createS3Storage(s3Config(env));
const auth = createAuth({
  db,
  log,
  mailer,
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: env.TRUSTED_ORIGINS,
  clientIpHeader: env.CLIENT_IP_HEADER,
});

if (env.ADMIN_EMAIL && env.ADMIN_PASSWORD) {
  const result = await ensureAdmin(auth, { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD });
  log.info(result === "created" ? "Default admin created" : "Default admin exists");
}

const app = createApp({
  deps: {
    auth,
    db,
    log,
    mailer,
    storage,
    lyrics: createLrclibProvider({
      userAgent: `${APP_NAME} (${env.BETTER_AUTH_URL})`,
      baseUrl: env.LRCLIB_URL,
    }),
    appUrl: env.BETTER_AUTH_URL,
    trustedOrigins: env.TRUSTED_ORIGINS,
    redirectHosts: env.REDIRECT_HOSTS,
    buildInfo: { version: rootPackage.version, build: env.BUILD_SHA },
    ...(env.BETA_ACCESS_CODE && {
      access: {
        code: env.BETA_ACCESS_CODE,
        secret: env.BETTER_AUTH_SECRET,
        clientIpHeader: env.CLIENT_IP_HEADER,
        https: env.BETTER_AUTH_URL.startsWith("https:"),
      },
    }),
  },
  webDistDir: env.WEB_DIST_DIR,
});

// Started here rather than by a default export, which makes Bun print its own non-JSON line.
const server = Bun.serve({ port: env.PORT, fetch: app.fetch });

log.info(`${APP_NAME} API listening on http://localhost:${server.port}`, {
  version: rootPackage.version,
  build: env.BUILD_SHA,
});
