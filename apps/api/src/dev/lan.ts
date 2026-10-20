/**
 * `bun run dev:lan`: `bun run dev`, reachable from a phone on the local network.
 * Prints a QR code to the web app, then starts both apps with the LAN URL as the
 * public URL (email links, origin checks). HTTPS when mkcert is installed (`tls.ts`).
 * Development only. Its helpers also serve the other modes (`dev.ts`, `serve.ts`,
 * `serve-lan.ts`).
 */

import { type NetworkInterfaceInfo, networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
import { APP_NAME } from "@coverband/shared";
import { renderUnicodeCompact } from "uqr";
import { type LocalTls, localTls, rootCertificate } from "./tls";

export const WEB_PORT = 5173;
const MAILPIT_PORT = 8025;

// Docker bridges, VMs and VPNs: not reachable from a phone on the Wi-Fi.
const VIRTUAL_INTERFACE =
  /^(docker|br-|veth|virbr|vmnet|vboxnet|lxc|lxd|cni|flannel|tun|tap|wg|tailscale|zt|utun)/;

/** Private ranges, most likely Wi-Fi first. */
function privateRank(address: string): number | undefined {
  if (address.startsWith("192.168.")) return 0;
  if (address.startsWith("10.")) return 1;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) return 2;
  return undefined;
}

/** The IPv4 address a phone on the same local network can reach, if any. */
export function pickLanAddress(
  interfaces: NodeJS.Dict<NetworkInterfaceInfo[]>,
): string | undefined {
  const candidates = Object.entries(interfaces)
    .filter(([name]) => !VIRTUAL_INTERFACE.test(name))
    .flatMap(([, infos]) => infos ?? [])
    .filter((info) => info.family === "IPv4" && !info.internal)
    .flatMap((info) => {
      const rank = privateRank(info.address);
      return rank === undefined ? [] : [{ address: info.address, rank }];
    });
  candidates.sort((a, b) => a.rank - b.rank);
  return candidates[0]?.address;
}

/** This machine's address on the local network (DEV_HOST overrides it); exits without one. */
export function lanHost(): string {
  const host = process.env.DEV_HOST || pickLanAddress(networkInterfaces());
  if (!host) {
    console.error("No local network address found. Set DEV_HOST to your machine's LAN IP.");
    process.exit(1);
  }
  return host;
}

/** Port of the plain http page handing phones mkcert's root certificate (LAN modes). */
const ROOT_CERT_PORT = 3080;

/**
 * Serves mkcert's root certificate (never its key) over plain http, the only way a phone can fetch
 * it before trusting it. Returns its URL, or undefined without one.
 */
export function serveRootCertificate(host: string): string | undefined {
  const file = rootCertificate();
  if (!file) return undefined;
  Bun.serve({
    port: ROOT_CERT_PORT,
    fetch: () =>
      new Response(Bun.file(file), {
        headers: {
          "content-type": "application/x-x509-ca-cert",
          "content-disposition": 'attachment; filename="coverband-dev-ca.crt"',
        },
      }),
  });
  return `http://${host}:${ROOT_CERT_PORT}`;
}

/** Prints a QR code to the app on the local network (and one to the root certificate), and how to reach them. */
export function announce(appUrl: string, rootCertUrl?: string) {
  const { hostname, port } = new URL(appUrl);
  const ports = [port, MAILPIT_PORT, ...(rootCertUrl ? [ROOT_CERT_PORT] : [])];
  console.log(`\n${renderUnicodeCompact(appUrl, { border: 1 })}\n`);
  console.log(`${APP_NAME} on the local network: ${appUrl}`);
  console.log(`Mailpit:                        http://${hostname}:${MAILPIT_PORT}`);
  if (rootCertUrl) {
    console.log(`\n${renderUnicodeCompact(rootCertUrl, { border: 1 })}\n`);
    console.log(`First time on a phone? Install this root certificate: ${rootCertUrl}`);
    console.log(
      '  Android: in Settings, search "certificate", choose CA certificate, then the downloaded file.',
    );
    console.log(
      "  iPhone: install the downloaded profile (Settings › General › VPN & Device Management),",
    );
    console.log("  then trust it in Settings › General › About › Certificate Trust Settings.");
  }
  console.log(`Not reachable? Allow ports ${ports.join(", ")} in your firewall.\n`);
}

/** The app's URL: https when there is a local certificate. */
export function appUrl(host: string, port: number, tls: LocalTls | undefined) {
  return `${tls ? "https" : "http"}://${host}:${port}`;
}

/**
 * Runs a command from the repository root with the given environment, `appUrl` as the app's public
 * URL (links in emails, Better Auth's origin checks), and logging in through `localUrl` on this
 * machine still allowed. Exits with the command.
 */
export async function runApp(
  command: string[],
  {
    appUrl,
    localUrl,
    env = {},
  }: { appUrl: string; localUrl?: string; env?: Record<string, string> },
): Promise<never> {
  const child = Bun.spawn(command, {
    cwd: fileURLToPath(new URL("../../../..", import.meta.url)),
    env: {
      ...process.env,
      ...env,
      BETTER_AUTH_URL: appUrl,
      TRUSTED_ORIGINS: [process.env.TRUSTED_ORIGINS, localUrl].filter(Boolean).join(","),
    },
    stdio: ["inherit", "inherit", "inherit"],
  });
  // Ctrl+C reaches the command directly: wait for it to stop instead of exiting first.
  process.on("SIGINT", () => {});
  process.exit(await child.exited);
}

/** The certificate for Vite (`DEV_TLS_*`, read by apps/web/vite.config.ts). */
export function viteTlsEnv(tls: LocalTls | undefined): Record<string, string> {
  return tls ? { DEV_TLS_CERT_FILE: tls.certFile, DEV_TLS_KEY_FILE: tls.keyFile } : {};
}

/** The certificate for the API server (`TLS_*`, read by src/env.ts). */
export function apiTlsEnv(tls: LocalTls | undefined): Record<string, string> {
  return tls ? { TLS_CERT_FILE: tls.certFile, TLS_KEY_FILE: tls.keyFile } : {};
}

if (import.meta.main) {
  const host = lanHost();
  const tls = localTls([host]);
  const webUrl = appUrl(host, WEB_PORT, tls);
  announce(webUrl, tls && serveRootCertificate(host));
  console.log(
    "The dev server has no service worker: test installing and offline use with serve:lan.\n",
  );
  // Vite listens on every interface (see vite.config.ts) and serves HTTPS with the certificate.
  await runApp(["bun", "run", "--parallel", "--filter", "./apps/*", "dev"], {
    appUrl: webUrl,
    localUrl: appUrl("localhost", WEB_PORT, tls),
    env: { DEV_LAN: "1", ...viteTlsEnv(tls) },
  });
}
