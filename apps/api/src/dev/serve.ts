/**
 * `bun run serve`: production-like, the API serves the built web and admin apps on this machine, over HTTPS
 * when mkcert is installed (`tls.ts`).
 */

import { ADMIN_HOST, apiTlsEnv, appUrl, runApp } from "./lan";
import { localTls } from "./tls";

export const SERVE_PORT = 3000;
/** The built apps the API serves. */
export const SERVE_DIST = { WEB_DIST_DIR: "apps/web/dist", ADMIN_DIST_DIR: "apps/admin/dist" };

if (import.meta.main) {
  const tls = localTls();
  const url = appUrl("localhost", SERVE_PORT, tls);
  const adminUrl = appUrl(ADMIN_HOST, SERVE_PORT, tls);
  console.log(`Serving the built app on ${url} (admin app: ${adminUrl})`);
  await runApp(["bun", "apps/api/src/main.ts"], {
    appUrl: url,
    adminUrl,
    env: { PORT: String(SERVE_PORT), ...SERVE_DIST, ...apiTlsEnv(tls) },
  });
}
