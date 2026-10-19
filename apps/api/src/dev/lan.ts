/**
 * `bun run dev:lan`: `bun run dev`, reachable from a phone on the local network.
 * Prints a QR code to the web app, then starts both apps with the LAN URL as the
 * public URL (email links, origin checks). Development only. Its helpers also serve
 * `bun run serve:lan` (`serve-lan.ts`).
 */

import { type NetworkInterfaceInfo, networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
import { APP_NAME } from "@coverband/shared";
import { renderUnicodeCompact } from "uqr";

const WEB_PORT = 5173;
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

/** Prints a QR code to the app on the local network, and how to reach it. */
export function announce(host: string, appPort: number) {
  const appUrl = `http://${host}:${appPort}`;
  console.log(`\n${renderUnicodeCompact(appUrl, { border: 1 })}\n`);
  console.log(`${APP_NAME} on the local network: ${appUrl}`);
  console.log(`Mailpit:                        http://${host}:${MAILPIT_PORT}`);
  console.log(`Not reachable? Allow ports ${appPort} and ${MAILPIT_PORT} in your firewall.\n`);
  return appUrl;
}

/**
 * Runs a command from the repository root with the LAN URL as the app's public URL (links in
 * emails, Better Auth's origin checks), logging in through `localUrl` on this machine still
 * allowed. Exits with the command.
 */
export async function runWithLanUrl(
  command: string[],
  appUrl: string,
  localUrl: string | undefined,
  env: Record<string, string> = {},
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

if (import.meta.main) {
  const webUrl = announce(lanHost(), WEB_PORT);
  // Vite listens on every interface (see vite.config.ts).
  await runWithLanUrl(
    ["bun", "run", "--parallel", "--filter", "./apps/*", "dev"],
    webUrl,
    process.env.BETTER_AUTH_URL,
    { DEV_LAN: "1" },
  );
}
