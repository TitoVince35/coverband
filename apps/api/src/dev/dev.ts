/**
 * `bun run dev`: both apps in watch mode (the API, Vite proxying `/api` to it, Drizzle Studio).
 * Vite serves HTTPS when mkcert is installed (`tls.ts`); the API stays on local http behind it.
 */

import { appUrl, runApp, viteTlsEnv, WEB_PORT } from "./lan";
import { localTls } from "./tls";

if (import.meta.main) {
  const tls = localTls();
  const url = appUrl("localhost", WEB_PORT, tls);
  console.log(`${tls ? "HTTPS" : "http"}: open ${url}`);
  await runApp(["bun", "run", "--parallel", "--filter", "./apps/*", "dev"], {
    appUrl: url,
    env: viteTlsEnv(tls),
  });
}
