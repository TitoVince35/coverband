/**
 * `bun run dev:lan`: `bun run dev`, reachable from a phone on the local network.
 * Prints a QR code to the web app, then starts both apps with the LAN URL as the
 * public URL (email links, origin checks). Development only.
 */
import { type NetworkInterfaceInfo, networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
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

if (import.meta.main) {
  const host = process.env.DEV_HOST || pickLanAddress(networkInterfaces());
  if (!host) {
    console.error("No local network address found. Set DEV_HOST to your machine's LAN IP.");
    process.exit(1);
  }

  const webUrl = `http://${host}:${WEB_PORT}`;
  const localUrl = process.env.BETTER_AUTH_URL;

  console.log(`\n${renderUnicodeCompact(webUrl, { border: 1 })}\n`);
  console.log(`CoverBand on the local network: ${webUrl}`);
  console.log(`Mailpit:                        http://${host}:${MAILPIT_PORT}`);
  console.log(`Not reachable? Allow ports ${WEB_PORT} and ${MAILPIT_PORT} in your firewall.\n`);

  const child = Bun.spawn(["bun", "run", "--parallel", "--filter", "./apps/*", "dev"], {
    cwd: fileURLToPath(new URL("../../../..", import.meta.url)),
    env: {
      ...process.env,
      // Vite listens on every interface (see vite.config.ts).
      DEV_LAN: "1",
      // Links in emails and Better Auth's origin checks use the LAN URL...
      BETTER_AUTH_URL: webUrl,
      // ...and logging in on this machine through localhost keeps working.
      TRUSTED_ORIGINS: [process.env.TRUSTED_ORIGINS, localUrl].filter(Boolean).join(","),
    },
    stdio: ["inherit", "inherit", "inherit"],
  });

  // Ctrl+C reaches both apps directly: wait for them to stop instead of exiting first.
  process.on("SIGINT", () => {});
  process.exit(await child.exited);
}
