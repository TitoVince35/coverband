/**
 * `bun run serve`: production-like, the API serves the built web app on this machine, over HTTPS
 * when mkcert is installed (`tls.ts`).
 */

import { apiTlsEnv, appUrl, runApp } from "./lan";
import { localTls } from "./tls";

export const SERVE_PORT = 3000;

if (import.meta.main) {
  const tls = localTls();
  const url = appUrl("localhost", SERVE_PORT, tls);
  console.log(`Serving the built app on ${url}`);
  await runApp(["bun", "apps/api/src/main.ts"], {
    appUrl: url,
    env: { PORT: String(SERVE_PORT), WEB_DIST_DIR: "apps/web/dist", ...apiTlsEnv(tls) },
  });
}
