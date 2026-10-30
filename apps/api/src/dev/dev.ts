/**
 * `bun run dev`: every app in watch mode (the API, Vite for the web and admin apps proxying `/api`
 * to it, Drizzle Studio).
 * Vite serves HTTPS when mkcert is installed (`tls.ts`); the API stays on local http behind it.
 */

import { ADMIN_HOST, ADMIN_PORT, appUrl, runApp, viteTlsEnv, WEB_PORT } from "./lan";
import { localTls } from "./tls";

if (import.meta.main) {
  const tls = localTls();
  const url = appUrl("localhost", WEB_PORT, tls);
  const adminUrl = appUrl(ADMIN_HOST, ADMIN_PORT, tls);
  console.log(`${tls ? "HTTPS" : "http"}: open ${url} (admin app: ${adminUrl})`);
  await runApp(["bun", "run", "--parallel", "--filter", "./apps/*", "dev"], {
    appUrl: url,
    adminUrl,
    env: viteTlsEnv(tls),
  });
}
