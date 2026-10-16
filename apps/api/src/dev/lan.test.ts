import { describe, expect, test } from "bun:test";
import type { NetworkInterfaceInfo } from "node:os";
import { pickLanAddress } from "./lan";

function ipv4(address: string, internal = false): NetworkInterfaceInfo {
  return {
    address,
    netmask: "255.255.255.0",
    family: "IPv4",
    mac: "00:00:00:00:00:00",
    internal,
    cidr: `${address}/24`,
  };
}

describe("pickLanAddress", () => {
  test("picks the Wi-Fi address, skipping loopback, Docker and VPN interfaces", () => {
    expect(
      pickLanAddress({
        lo: [ipv4("127.0.0.1", true)],
        docker0: [ipv4("172.17.0.1")],
        "br-1a2b3c": [ipv4("172.18.0.1")],
        tailscale0: [ipv4("100.101.102.103")],
        wlp2s0: [ipv4("192.168.1.20")],
      }),
    ).toBe("192.168.1.20");
  });

  test("prefers 192.168.x.x, then 10.x.x.x, then 172.16-31.x.x", () => {
    expect(pickLanAddress({ eth0: [ipv4("172.20.0.5")], wlan0: [ipv4("10.0.0.7")] })).toBe(
      "10.0.0.7",
    );
    expect(pickLanAddress({ eth0: [ipv4("172.20.0.5")] })).toBe("172.20.0.5");
  });

  test("ignores IPv6 and public addresses", () => {
    expect(
      pickLanAddress({
        eth0: [{ ...ipv4("fe80::1"), family: "IPv6", cidr: "fe80::1/64", scopeid: 2 }],
        eth1: [ipv4("203.0.113.5")],
      }),
    ).toBeUndefined();
  });
});
