import { createApp } from "./app";
import { createAuth } from "./auth";
import { ensureAdmin } from "./bootstrap";
import { createDb } from "./db/client";
import { loadEnv, s3Config, smtpConfig } from "./env";
import { createSmtpMailer } from "./mail/mailer";
import { createS3Storage } from "./storage";

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
  trustedProxies: env.TRUSTED_PROXIES,
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
    appUrl: env.BETTER_AUTH_URL,
    trustedOrigins: env.TRUSTED_ORIGINS,
  },
  webDistDir: env.WEB_DIST_DIR,
});

console.log(`CoverBand API listening on http://localhost:${env.PORT}`);

export default {
  port: env.PORT,
  fetch: app.fetch,
};
