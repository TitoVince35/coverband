import { APP_NAME } from "@coverband/shared";
import rootPackage from "../../../package.json" with { type: "json" };
import { createAuth } from "./adapters/auth";
import { createLrclibProvider } from "./adapters/lyrics";
import { createSmtpMailer } from "./adapters/mail/mailer";
import { createS3Storage } from "./adapters/storage";
import { createApp } from "./app";
import { ensureAdmin } from "./bootstrap";
import { createDb } from "./core/db/client";
import { loadEnv, s3Config, smtpConfig } from "./env";

const env = loadEnv();
const { db } = createDb(env.DATABASE_URL);
const mailer = createSmtpMailer(smtpConfig(env));
const storage = createS3Storage(s3Config(env));
const auth = createAuth({
  db,
  mailer,
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: env.TRUSTED_ORIGINS,
  clientIpHeader: env.CLIENT_IP_HEADER,
});

if (env.ADMIN_EMAIL && env.ADMIN_PASSWORD) {
  const result = await ensureAdmin(auth, { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD });
  console.log(`Default admin ${env.ADMIN_EMAIL}: ${result}`);
}

const app = createApp({
  deps: {
    auth,
    db,
    mailer,
    storage,
    lyrics: createLrclibProvider({
      userAgent: `${APP_NAME} (${env.BETTER_AUTH_URL})`,
      baseUrl: env.LRCLIB_URL,
    }),
    appUrl: env.BETTER_AUTH_URL,
    trustedOrigins: env.TRUSTED_ORIGINS,
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

console.log(
  `${APP_NAME} ${rootPackage.version} (${env.BUILD_SHA}) API listening on http://localhost:${env.PORT}`,
);

export default {
  port: env.PORT,
  fetch: app.fetch,
};
