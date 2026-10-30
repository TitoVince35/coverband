import { APP_NAME } from "@coverband/shared";
import rootPackage from "../../../package.json" with { type: "json" };
import { createAuth } from "./adapters/auth";
import { createDeezerCatalog } from "./adapters/deezer";
import { createLrclibProvider } from "./adapters/lyrics";
import { createSmtpMailer } from "./adapters/mail/mailer";
import { createWebPushSender, PUSH_SERVICE_HOSTS, vapidKeys, vapidSubject } from "./adapters/push";
import { createS3Storage } from "./adapters/storage";
import { createYoutubeSearch } from "./adapters/youtube";
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
  // The admin app logs in from its own host (#246).
  trustedOrigins: [...env.TRUSTED_ORIGINS, ...(env.ADMIN_URL ? [env.ADMIN_URL] : [])],
  clientIpHeader: env.CLIENT_IP_HEADER,
});

if (env.ADMIN_EMAIL && env.ADMIN_PASSWORD) {
  const result = await ensureAdmin(auth, { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD });
  log.info(result === "created" ? "Default admin created" : "Default admin exists");
}

const pushKeys =
  env.VAPID_PRIVATE_KEY &&
  vapidKeys(env.VAPID_PRIVATE_KEY, vapidSubject(env.BETTER_AUTH_URL, env.MAIL_FROM));

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
    catalog: createDeezerCatalog({ baseUrl: env.DEEZER_URL }),
    ...(env.YOUTUBE_API_KEY && {
      videos: createYoutubeSearch({
        apiKey: env.YOUTUBE_API_KEY,
        baseUrl: env.YOUTUBE_API_URL,
        thumbnailsUrl: env.YOUTUBE_THUMBNAILS_URL,
      }),
    }),
    appUrl: env.BETTER_AUTH_URL,
    ...(env.ADMIN_URL && { adminUrl: env.ADMIN_URL }),
    trustedOrigins: env.TRUSTED_ORIGINS,
    redirectHosts: env.REDIRECT_HOSTS,
    ...(env.CRON_SECRET && { cronSecret: env.CRON_SECRET }),
    ...(env.CONTACT_FORM_RECIPIENT && { contactRecipient: env.CONTACT_FORM_RECIPIENT }),
    ...(pushKeys && {
      push: {
        keys: pushKeys,
        serviceHosts: env.PUSH_SERVICE_HOSTS ?? PUSH_SERVICE_HOSTS,
        sender: createWebPushSender(pushKeys),
      },
    }),
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
  adminDistDir: env.ADMIN_DIST_DIR,
});

// Started here rather than by a default export, which makes Bun print its own non-JSON line.
const server = Bun.serve({
  port: env.PORT,
  fetch: app.fetch,
  // Local HTTPS only (`bun run serve`); Scaleway terminates TLS in production.
  ...(env.TLS_CERT_FILE &&
    env.TLS_KEY_FILE && {
      tls: { cert: Bun.file(env.TLS_CERT_FILE), key: Bun.file(env.TLS_KEY_FILE) },
    }),
});

log.info(`${APP_NAME} API listening on ${server.url.origin}`, {
  version: rootPackage.version,
  build: env.BUILD_SHA,
});
