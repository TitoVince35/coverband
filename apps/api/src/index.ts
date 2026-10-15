import { createApp } from "./app";
import { loadEnv } from "./env";

const env = loadEnv();
const app = createApp({ webDistDir: env.WEB_DIST_DIR });

console.log(`CoverBand API listening on http://localhost:${env.PORT}`);

export default {
  port: env.PORT,
  fetch: app.fetch,
};
