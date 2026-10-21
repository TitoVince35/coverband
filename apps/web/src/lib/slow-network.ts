// Development only (#197): a slow network on demand, to see the skeletons and spinners (#190).

/** How long each API request waits when the slow network is on. */
export const SLOW_NETWORK_DELAY_MS = 2000;

const KEY = "coverband-slow-network";

/** Whether the slow network is on (remembered on the device). */
export function isSlowNetwork() {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

export function setSlowNetwork(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, "on");
    else localStorage.removeItem(KEY);
  } catch {
    // Storage refused: the switch only lasts until the page reloads.
  }
}

/** Whether a request is one of the API's: a URL under /api on the app's own origin. */
export function isApiRequest(input: RequestInfo | URL, origin: string) {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(raw, origin);
  return url.origin === origin && (url.pathname === "/api" || url.pathname.startsWith("/api/"));
}

/** Makes every API request wait SLOW_NETWORK_DELAY_MS while the slow network is on. */
export function installSlowNetwork() {
  const fetch = window.fetch.bind(window);
  const slowFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (isSlowNetwork() && isApiRequest(input, window.location.origin)) {
      await new Promise((resolve) => setTimeout(resolve, SLOW_NETWORK_DELAY_MS));
    }
    return fetch(input, init);
  };
  // The browser's fetch (Bun's types add members it doesn't use here).
  window.fetch = slowFetch as typeof window.fetch;
}
