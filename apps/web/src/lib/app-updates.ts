// Keeps an open or installed app on the deployed build (#164). After a deploy, the new service
// worker takes over and deletes the old build's cached files, which the new container doesn't
// have either: an app still running the old build fails to load the code of a page it hasn't
// opened yet, and an installed app can stay on an old build for days. Updates stay silent.

import { APP_BUILD } from "./build-info";

/** Session storage keys: what each reload was for, so a reload that didn't help isn't repeated. */
const RELOADED_FOR_BUILD = "coverband-reloaded-for-build";
const RELOADED_AFTER_LOAD_ERROR = "coverband-reloaded-after-load-error";

/** A page's code failing again this soon after a reload is not a stale build: no loop. */
export const LOAD_ERROR_RELOAD_WINDOW_MS = 30_000;
/** Version checks when the app comes back to the foreground, at most this often. */
export const CHECK_INTERVAL_MS = 60_000;
/** How long to wait for the new service worker before reloading anyway. */
const WORKER_TIMEOUT_MS = 10_000;

type SessionStore = Pick<Storage, "getItem" | "setItem">;

/** The server runs another build, which this app hasn't already reloaded for. */
export function shouldReloadForBuild(
  serverBuild: string | null,
  appBuild: string,
  reloadedFor: string | null,
) {
  return serverBuild !== null && serverBuild !== appBuild && serverBuild !== reloadedFor;
}

/** Whether to reload after a page's code failed to load, and remembers it. */
export function claimLoadErrorReload(store: SessionStore, now = Date.now()) {
  const last = Number(store.getItem(RELOADED_AFTER_LOAD_ERROR) ?? 0);
  if (now - last < LOAD_ERROR_RELOAD_WINDOW_MS) return false;
  store.setItem(RELOADED_AFTER_LOAD_ERROR, String(now));
  return true;
}

function session(): SessionStore | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Lets the new service worker take over (it serves the new build), or gives up after a while. */
async function refreshServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return;
  await registration.update().catch(() => {});
  if (!registration.installing && !registration.waiting) return;
  await new Promise<void>((resolve) => {
    navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true });
    setTimeout(resolve, WORKER_TIMEOUT_MS);
  });
}

async function serverBuild(): Promise<string | null> {
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    if (!res.ok) return null;
    const { build } = (await res.json()) as { build?: unknown };
    return typeof build === "string" ? build : null;
  } catch {
    // Offline: nothing to compare.
    return null;
  }
}

async function checkBuild() {
  const build = await serverBuild();
  const store = session();
  if (!shouldReloadForBuild(build, APP_BUILD, store?.getItem(RELOADED_FOR_BUILD) ?? null)) return;
  store?.setItem(RELOADED_FOR_BUILD, build ?? "");
  await refreshServiceWorker();
  window.location.reload();
}

/** Starts the checks: production builds only (the dev server has no service worker). */
export function startAppUpdates() {
  // Vite's event when a page's code fails to load (`import()` of a deleted chunk).
  window.addEventListener("vite:preloadError", (event) => {
    const store = session();
    if (store && claimLoadErrorReload(store)) {
      event.preventDefault();
      window.location.reload();
    }
  });

  let lastCheck = 0;
  const check = () => {
    if (Date.now() - lastCheck < CHECK_INTERVAL_MS) return;
    lastCheck = Date.now();
    void checkBuild();
  };
  check();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check();
  });
}
