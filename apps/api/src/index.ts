import { createApp } from "./app";
import { createAuth } from "./auth";
import { ensureAdmin } from "./bootstrap";
import { createDb } from "./db/client";
import { loadEnv } from "./env";

const env = loadEnv();
const { db } = createDb(env.DATABASE_URL);
const auth = createAuth({ db, secret: env.BETTER_AUTH_SECRET, baseURL: env.BETTER_AUTH_URL });

if (env.ADMIN_EMAIL && env.ADMIN_PASSWORD) {
  const result = await ensureAdmin(auth, { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD });
  console.log(`Default admin ${env.ADMIN_EMAIL}: ${result}`);
}

const app = createApp({ auth, webDistDir: env.WEB_DIST_DIR });

console.log(`CoverBand API listening on http://localhost:${env.PORT}`);

export default {
  port: env.PORT,
  fetch: app.fetch,
};
