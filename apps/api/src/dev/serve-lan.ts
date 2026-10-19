/**
 * `bun run serve:lan`: `bun run serve` (production-like: the API serves the built web app),
 * reachable from a phone on the local network. Prints a QR code to the app, then starts the API
 * with the LAN URL as the public URL. The script builds the web app first.
 *
 * Over plain http on the network, the browser doesn't treat the app as a secure context: no
 * service worker (offline, install) and no screen wake lock there, unlike on localhost.
 */

import { announce, lanHost, runWithLanUrl } from "./lan";

const PORT = 3000;

if (import.meta.main) {
  const appUrl = announce(lanHost(), PORT);
  // Bun.serve listens on every interface.
  await runWithLanUrl(["bun", "apps/api/src/main.ts"], appUrl, `http://localhost:${PORT}`, {
    PORT: String(PORT),
    WEB_DIST_DIR: "apps/web/dist",
  });
}
