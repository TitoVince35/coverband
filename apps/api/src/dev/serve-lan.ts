/**
 * `bun run serve:lan`: `bun run serve` (production-like: the API serves the built web app),
 * reachable from a phone on the local network. Prints a QR code to the app, then starts the API
 * with the LAN URL as the public URL. The script builds the web app first.
 *
 * HTTPS when mkcert is installed (`tls.ts`): the service worker (offline, install) and the screen
 * wake lock then work on the phone too. Over plain http, they only work on localhost.
 */

import { announce, apiTlsEnv, appUrl, lanHost, runApp, serveRootCertificate } from "./lan";
import { SERVE_PORT } from "./serve";
import { localTls } from "./tls";

if (import.meta.main) {
  const host = lanHost();
  const tls = localTls([host]);
  const url = appUrl(host, SERVE_PORT, tls);
  announce(url, tls && serveRootCertificate(host));
  // Bun.serve listens on every interface.
  await runApp(["bun", "apps/api/src/main.ts"], {
    appUrl: url,
    localUrl: appUrl("localhost", SERVE_PORT, tls),
    env: { PORT: String(SERVE_PORT), WEB_DIST_DIR: "apps/web/dist", ...apiTlsEnv(tls) },
  });
}
